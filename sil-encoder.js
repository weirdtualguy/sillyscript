// sil-encoder.js — ABI-driven sigscript encoder (kaspa-platform-kit / codec seed)
//
// Builds entry sigscripts from the ABI at runtime. Arg order, types, and tags
// are READ FROM THE ARTIFACT — never hardcoded. A builder pointed at a wrong
// or stale ABI fails at load (sil-abi.js derive-and-assert), not at broadcast.
//
// [REF argent/silverscript-abi + rusty-kaspa ScriptBuilder @ c7d17a1]
//   Sigscript args  : MINIMAL pushes (OP_0 / OP_1..16 / OP_1NEGATE / OP_DATA_N / PUSHDATA)
//   State fields    : EXPLICIT pushes (OP_DATA_N / PUSHDATA — never OP_1..16)
//   Int in arrays   : fixed 8-byte script number (sign-magnitude LE, sign bit = bit 7 of last byte)
//   Bool in arrays  : 1 byte (0 or 1)
//   Struct arg      : one push per field, declaration order, each as top-level arg
//   Struct array arg: one push per FIELD (column-grouped), each = concatenated
//                     fixed-width payloads of that field across all elements
//   Array (scalar)  : single push, elements' fixed payloads concatenated
//   After all args  : OP_DATA_4 + dispatch tag
//   Then caller appends: redeem push
//   Size gate       : len(args+tag) + push_size(redeem) <= 250_000
//
// Edge cases pinned:
//   Int 0   -> OP_0 (empty push — minimal script number for zero)
//   Byte 0  -> OP_DATA_1 0x00 (NOT OP_0 — OP_0 pushes empty, not [0x00])
//   Byte 1  -> OP_1 (same stack value as OP_DATA_1 0x01)
//   Byte 0x81 -> OP_1NEGATE (same stack value as OP_DATA_1 0x81)
//   i64::MIN -> REJECTED (needs 9-byte script number; Kaspa VM limit is 8)
//
// VERIFIED against: argent abi crate canonical test vector + production
// artifacts (v4/v5/v6/v11) via sil-abi.js loader.

const MAX_SIGNATURE_SCRIPT_LEN = 250_000;
const I64_MAX = 9223372036854775807n;   //  2^63 - 1
const I64_MIN = -9223372036854775808n;  // -2^63 (unrepresentable in 8-byte script num)

// ─────────────────────────────────────────────────────────────────────────────
// Script number serialization
// ─────────────────────────────────────────────────────────────────────────────

// Minimal script-number encoding (BigInt → shortest LE sign-magnitude bytes).
// Zero → empty buffer. Sign = bit 7 of the most significant (last) byte.
function serializeScriptNum(value) {
  if (value === 0n) return Buffer.alloc(0);
  if (value > I64_MAX || value < I64_MIN)
    throw new Error(`sil-encoder: value ${value} outside i64 range`);
  if (value === I64_MIN)
    throw new Error(`sil-encoder: i64::MIN requires 9-byte script number (VM limit is 8)`);

  const neg = value < 0n;
  const mag = neg ? -value : value;

  // magnitude → LE bytes
  const bytes = [];
  let v = mag;
  while (v > 0n) { bytes.push(Number(v & 0xffn)); v >>= 8n; }

  const last = bytes[bytes.length - 1];
  if (neg) {
    if (last & 0x80) {
      // bit 7 already set by magnitude — appending a sign byte so decode
      // doesn't misread the magnitude (e.g. -128 → [0x80, 0x80], not [0x80])
      bytes.push(0x80);
    } else {
      bytes[bytes.length - 1] = last | 0x80;
    }
  } else {
    if (last & 0x80) {
      // positive but bit 7 set — append 0x00 to disambiguate from negative
      bytes.push(0x00);
    }
  }
  return Buffer.from(bytes);
}

// Fixed 8-byte script-number encoding (used in arrays and state fields).
// Sign bit = bit 7 of byte[7]. Rejects values whose magnitude needs bit 7
// of the last byte (i.e. i64::MIN and anything ≥ 2^63).
function serializeScriptNumFixed8(value) {
  if (value === 0n) return Buffer.alloc(8);
  if (value > I64_MAX || value < I64_MIN)
    throw new Error(`sil-encoder: value ${value} outside i64 range`);
  if (value === I64_MIN)
    throw new Error(`sil-encoder: i64::MIN unrepresentable in fixed 8-byte script number`);

  const neg = value < 0n;
  const mag = neg ? -value : value;
  if (mag >= 9223372036854775808n) // 2^63
    throw new Error(`sil-encoder: magnitude ${mag} too large for 8-byte script number`);

  const buf = Buffer.alloc(8);
  let v = mag;
  for (let i = 0; i < 8; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  if (neg) buf[7] |= 0x80;
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Push encoding
// ─────────────────────────────────────────────────────────────────────────────

// Byte-array builder with push methods
class ScriptBuf {
  constructor() { this.parts = []; this._len = 0; }
  get length() { return this._len; }
  _append(buf) { this.parts.push(buf); this._len += buf.length; return this; }

  op(byte) { return this._append(Buffer.from([byte])); }

  // MINIMAL push (sigscript args): uses OP_0/OP_N/OP_1NEGATE when possible
  pushMinimal(data) {
    if (data.length === 0) return this.op(0x00);                       // OP_0
    if (data.length === 1 && data[0] >= 1 && data[0] <= 16)
      return this.op(0x50 + data[0]);                                  // OP_1..OP_16
    if (data.length === 1 && data[0] === 0x81)
      return this.op(0x4f);                                            // OP_1NEGATE
    return this._pushDataOpcode(data);
  }

  // EXPLICIT push (state fields): always uses OP_DATA_N or PUSHDATA opcodes
  pushExplicit(data) {
    if (data.length === 0) return this.op(0x00);                       // OP_0 (only option)
    return this._pushDataOpcode(data);
  }

  _pushDataOpcode(data) {
    if (data.length <= 75) {
      this.op(data.length);
      return this._append(data);
    }
    if (data.length <= 255) {
      this.op(0x4c);                                                   // OP_PUSHDATA1
      this._append(Buffer.from([data.length]));
      return this._append(data);
    }
    if (data.length <= 65535) {
      this.op(0x4d);                                                   // OP_PUSHDATA2
      const len = Buffer.alloc(2); len.writeUInt16LE(data.length);
      this._append(len);
      return this._append(data);
    }
    this.op(0x4e);                                                     // OP_PUSHDATA4
    const len = Buffer.alloc(4); len.writeUInt32LE(data.length);
    this._append(len);
    return this._append(data);
  }

  build() { return Buffer.concat(this.parts); }
}

// Size of the push encoding for data of a given length (for the 250KB gate)
function canonicalPushSize(dataLen) {
  if (dataLen === 0) return 1;          // OP_0
  if (dataLen <= 75) return 1 + dataLen;
  if (dataLen <= 255) return 2 + dataLen;
  if (dataLen <= 65535) return 3 + dataLen;
  return 5 + dataLen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value coercion (JS value → typed value, with validation)
// ─────────────────────────────────────────────────────────────────────────────

function asBytes(value, expectedLen, context) {
  let buf;
  if (Buffer.isBuffer(value)) buf = value;
  else if (value instanceof Uint8Array) buf = Buffer.from(value);
  else if (typeof value === 'string' && /^[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0)
    buf = Buffer.from(value, 'hex');
  else throw new Error(`sil-encoder: ${context}: expected ${expectedLen}-byte Buffer or hex string, got ${typeof value}`);
  if (buf.length !== expectedLen)
    throw new Error(`sil-encoder: ${context}: expected ${expectedLen} bytes, got ${buf.length}`);
  return buf;
}

function asBigInt(value, context) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  throw new Error(`sil-encoder: ${context}: expected BigInt or integer, got ${typeof value}`);
}

function coerceArg(type, value, context, resolveStruct) {
  switch (type.kind) {
    case 'int': case 'temporal':
      return asBigInt(value, context);
    case 'bool':
      if (typeof value !== 'boolean')
        throw new Error(`sil-encoder: ${context}: expected boolean, got ${typeof value}`);
      return value;
    case 'byte':
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255)
        throw new Error(`sil-encoder: ${context}: expected byte (0-255), got ${value}`);
      return value;
    case 'bytes':
      if (Buffer.isBuffer(value)) return value;
      if (typeof value === 'string' && /^[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0)
        return Buffer.from(value, 'hex');
      if (value instanceof Uint8Array) return Buffer.from(value);
      throw new Error(`sil-encoder: ${context}: expected Buffer or hex string`);
    case 'string':
      if (typeof value !== 'string') throw new Error(`sil-encoder: ${context}: expected string`);
      return value;
    case 'pubkey': return asBytes(value, 32, context);
    case 'sig':    return asBytes(value, 65, context);
    case 'datasig':return asBytes(value, 64, context);
    case 'fixed_bytes': return asBytes(value, type.len, context);
    case 'fixed_array': case 'dynamic_array': {
      if (!Array.isArray(value)) throw new Error(`sil-encoder: ${context}: expected array`);
      return value;
    }
    case 'struct': {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error(`sil-encoder: ${context}: expected object for struct ${type.name}`);
      return value;
    }
    default:
      throw new Error(`sil-encoder: ${context}: unsupported type kind ${type.kind}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixed-width payload encoding (for array elements and state fields)
// ─────────────────────────────────────────────────────────────────────────────

function encodeFixedPayload(type, value, context) {
  switch (type.kind) {
    case 'int': case 'temporal':
      return serializeScriptNumFixed8(value);
    case 'bool':
      return Buffer.from([value ? 1 : 0]);
    case 'byte':
      return Buffer.from([value]);
    case 'pubkey':     return asBytes(value, 32, context);
    case 'sig':        return asBytes(value, 65, context);
    case 'datasig':    return asBytes(value, 64, context);
    case 'fixed_bytes': return asBytes(value, type.len, context);
    case 'fixed_array': {
      if (!Array.isArray(value)) throw new Error(`sil-encoder: ${context}: expected array`);
      if (value.length !== type.len)
        throw new Error(`sil-encoder: ${context}: fixed array expects ${type.len} elements, got ${value.length}`);
      return Buffer.concat(value.map((v, i) => encodeFixedPayload(type.item, v, `${context}[${i}]`)));
    }
    default:
      throw new Error(`sil-encoder: ${context}: type ${JSON.stringify(type)} has no fixed-width encoding`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sigscript arg encoding (recursive, ABI-driven)
// ─────────────────────────────────────────────────────────────────────────────

function encodeSigArg(buf, type, value, paramName, resolveStruct) {
  const ctx = `param '${paramName}'`;

  switch (type.kind) {
    // ── Scalars: minimal push ──
    case 'int': case 'temporal': {
      const v = asBigInt(value, ctx);
      buf.pushMinimal(serializeScriptNum(v));
      return;
    }
    case 'bool': {
      if (typeof value !== 'boolean') throw new Error(`sil-encoder: ${ctx}: expected boolean`);
      buf.pushMinimal(serializeScriptNum(value ? 1n : 0n));
      return;
    }
    case 'byte': {
      if (typeof value !== 'number' || value < 0 || value > 255)
        throw new Error(`sil-encoder: ${ctx}: expected byte 0-255`);
      buf.pushMinimal(Buffer.from([value]));
      return;
    }
    case 'bytes': {
      const v = coerceArg(type, value, ctx);
      buf.pushMinimal(v);
      return;
    }
    case 'string': {
      if (typeof value !== 'string') throw new Error(`sil-encoder: ${ctx}: expected string`);
      buf.pushMinimal(Buffer.from(value, 'utf8'));
      return;
    }
    case 'pubkey': case 'sig': case 'datasig': case 'fixed_bytes': {
      const len = type.kind === 'pubkey' ? 32 : type.kind === 'sig' ? 65 : type.kind === 'datasig' ? 64 : type.len;
      const v = asBytes(value, len, ctx);
      buf.pushMinimal(v);
      return;
    }

    // ── Arrays of scalars: single push with concatenated fixed payloads ──
    case 'fixed_array': case 'dynamic_array': {
      if (type.item.kind === 'struct') {
        encodeStructArrayArg(buf, type, value, paramName, resolveStruct);
        return;
      }
      if (!Array.isArray(value)) throw new Error(`sil-encoder: ${ctx}: expected array`);
      if (type.kind === 'fixed_array' && value.length !== type.len)
        throw new Error(`sil-encoder: ${ctx}: fixed array expects ${type.len} elements, got ${value.length}`);
      const payload = Buffer.concat(
        value.map((v, i) => encodeFixedPayload(type.item, v, `${ctx}[${i}]`))
      );
      buf.pushMinimal(payload);
      return;
    }

    // ── Struct: one push per field, declaration order ──
    case 'struct': {
      const st = resolveStruct(type.name);
      if (!st || !st.fields) throw new Error(`sil-encoder: ${ctx}: unknown struct '${type.name}'`);
      if (typeof value !== 'object' || value === null)
        throw new Error(`sil-encoder: ${ctx}: expected object for struct ${type.name}`);
      for (const field of st.fields) {
        const fv = value[field.name];
        if (fv === undefined)
          throw new Error(`sil-encoder: ${ctx}: missing field '${field.name}' in struct ${type.name}`);
        encodeSigArg(buf, field.type, fv, `${paramName}.${field.name}`, resolveStruct);
      }
      return;
    }

    default:
      throw new Error(`sil-encoder: ${ctx}: unsupported type kind '${type.kind}'`);
  }
}

// Struct array: column-grouped — one push per struct FIELD, each containing
// all elements' values for that field concatenated (fixed-width payloads).
// This matches the KCC20 encoding: (owners|types|amounts|isMinter)
function encodeStructArrayArg(buf, type, value, paramName, resolveStruct) {
  const ctx = `param '${paramName}'`;
  const structType = type.item;
  const st = resolveStruct(structType.name);
  if (!st || !st.fields) throw new Error(`sil-encoder: ${ctx}: unknown struct '${structType.name}'`);
  if (!Array.isArray(value)) throw new Error(`sil-encoder: ${ctx}: expected array of structs`);
  if (type.kind === 'fixed_array' && value.length !== type.len)
    throw new Error(`sil-encoder: ${ctx}: fixed struct array expects ${type.len} elements, got ${value.length}`);

  // Validate all elements have the required fields
  for (let i = 0; i < value.length; i++) {
    const elem = value[i];
    if (typeof elem !== 'object' || elem === null)
      throw new Error(`sil-encoder: ${ctx}[${i}]: expected object`);
    for (const field of st.fields) {
      if (elem[field.name] === undefined)
        throw new Error(`sil-encoder: ${ctx}[${i}]: missing field '${field.name}'`);
    }
  }

  // Column-grouped: one push per field across all elements
  for (const field of st.fields) {
    const column = value.map((elem, i) =>
      encodeFixedPayload(field.type, elem[field.name], `${ctx}[${i}].${field.name}`)
    );
    buf.pushMinimal(Buffer.concat(column));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// High-level API
// ─────────────────────────────────────────────────────────────────────────────

// Build the sigscript for an entry call (args + tag, WITHOUT redeem).
// contract: ContractView from sil-abi.js
// entryName: string
// args: array of JS values matching entry.params
// Returns: Buffer (args pushes + OP_DATA_4 tag push)
function buildSigScript(contract, entryName, args) {
  const entry = contract.entry(entryName);
  if (args.length !== entry.params.length)
    throw new Error(`sil-encoder: entry '${entryName}' expects ${entry.params.length} args, got ${args.length}`);

  const buf = new ScriptBuf();
  for (let i = 0; i < entry.params.length; i++) {
    const p = entry.params[i];
    encodeSigArg(buf, p.type, args[i], p.name, contract.resolveStruct);
  }
  buf.pushMinimal(entry.tag);  // OP_DATA_4 + 4-byte tag

  // 250 KB consensus gate (includes the redeem push we're about to append)
  const redeemPushSize = canonicalPushSize(contract.bytecode.length);
  const total = buf.length + redeemPushSize;
  if (total > MAX_SIGNATURE_SCRIPT_LEN)
    throw new Error(`sil-encoder: sigscript ${total} bytes exceeds consensus limit ${MAX_SIGNATURE_SCRIPT_LEN} (args+tag=${buf.length}, redeem push=${redeemPushSize})`);

  return buf.build();
}

// Append the redeem script push to complete a sigscript
function appendRedeem(sigscriptWithoutRedeem, redeemScript) {
  const buf = new ScriptBuf();
  buf._append(Buffer.isBuffer(sigscriptWithoutRedeem) ? sigscriptWithoutRedeem : Buffer.from(sigscriptWithoutRedeem));
  const redeem = Buffer.isBuffer(redeemScript) ? redeemScript : Buffer.from(redeemScript);
  buf.pushMinimal(redeem);  // large redeem → PUSHDATA2/4 automatically
  return buf.build();
}

// Convenience: complete sigscript in one call
function buildCompleteSigScript(contract, entryName, args, redeemScript) {
  const partial = buildSigScript(contract, entryName, args);
  const redeem = redeemScript || contract.bytecode;
  return appendRedeem(partial, redeem);
}

// ─────────────────────────────────────────────────────────────────────────────
// State encoding (for building redeem scripts with new state)
// ─────────────────────────────────────────────────────────────────────────────

// Encode a runtime state into its push sequence (EXPLICIT pushes, one per field)
function encodeState(contract, stateValues) {
  const buf = new ScriptBuf();
  for (const field of contract.fields) {
    const value = stateValues[field.name];
    if (value === undefined)
      throw new Error(`sil-encoder: state: missing field '${field.name}'`);
    const payload = encodeFixedPayload(field.type, value, `state.${field.name}`);
    buf.pushExplicit(payload);  // EXPLICIT: OP_DATA_N, never OP_1..16
  }
  return buf.build();
}

// Build a complete redeem script: prefix + encoded state + suffix
// Useful for computing the next state's scriptPubKey in a transition
function buildRedeem(contract, stateValues) {
  const stateScript = encodeState(contract, stateValues);
  return Buffer.concat([contract.prefix, stateScript, contract.suffix]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // high-level
  buildSigScript, appendRedeem, buildCompleteSigScript,
  encodeState, buildRedeem,
  // low-level (for testing / custom use)
  serializeScriptNum, serializeScriptNumFixed8,
  ScriptBuf, canonicalPushSize, encodeFixedPayload,
  MAX_SIGNATURE_SCRIPT_LEN,
};

// ─────────────────────────────────────────────────────────────────────────────
// Self-test (run with: node sil-encoder.js --test)
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module && process.argv.includes('--test')) {
  const hex = b => b.toString('hex');
  let pass = 0, fail = 0;
  const t = (label, got, want) => {
    const ok = got === want;
    if (ok) pass++; else fail++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + '  ' + got + (ok ? '' : '  (want ' + want + ')'));
  };

  // ── Script number serialization ──
  t('num 0',    hex(serializeScriptNum(0n)),    '');
  t('num 1',    hex(serializeScriptNum(1n)),    '01');
  t('num -1',   hex(serializeScriptNum(-1n)),   '81');
  t('num 16',   hex(serializeScriptNum(16n)),   '10');
  t('num 17',   hex(serializeScriptNum(17n)),   '11');
  t('num -17',  hex(serializeScriptNum(-17n)),  '91');
  t('num 127',  hex(serializeScriptNum(127n)),  '7f');
  t('num -127', hex(serializeScriptNum(-127n)), 'ff');
  t('num 128',  hex(serializeScriptNum(128n)),  '8000');
  t('num -128', hex(serializeScriptNum(-128n)), '8080');
  t('num 255',  hex(serializeScriptNum(255n)),  'ff00');
  t('num -255', hex(serializeScriptNum(-255n)), 'ff80');

  // ── Fixed 8-byte script numbers ──
  t('fixed8 0',     hex(serializeScriptNumFixed8(0n)),     '0000000000000000');
  t('fixed8 1',     hex(serializeScriptNumFixed8(1n)),     '0100000000000000');
  t('fixed8 -1',    hex(serializeScriptNumFixed8(-1n)),    '0100000000000080');
  t('fixed8 -5',    hex(serializeScriptNumFixed8(-5n)),    '0500000000000080');
  t('fixed8 500',   hex(serializeScriptNumFixed8(500n)),   'f401000000000000');
  t('fixed8 max',   hex(serializeScriptNumFixed8(I64_MAX)), 'ffffffffffffff7f');

  // ── i64::MIN rejection ──
  try { serializeScriptNum(I64_MIN); t('i64min reject', 'no error', 'error'); }
  catch (e) { t('i64min reject', 'error', 'error'); }
  try { serializeScriptNumFixed8(I64_MIN); t('i64min fixed8 reject', 'no error', 'error'); }
  catch (e) { t('i64min fixed8 reject', 'error', 'error'); }

  // ── Push encoding: minimal vs explicit ──
  const mk = (fn, data) => { const b = new ScriptBuf(); fn.call(b, data); return hex(b.build()); };
  t('min []',        mk(ScriptBuf.prototype.pushMinimal, Buffer.alloc(0)),  '00');       // OP_0
  t('min [0x00]',    mk(ScriptBuf.prototype.pushMinimal, Buffer.from([0])), '0100');     // OP_DATA_1 00
  t('min [0x01]',    mk(ScriptBuf.prototype.pushMinimal, Buffer.from([1])), '51');       // OP_1
  t('min [0x02]',    mk(ScriptBuf.prototype.pushMinimal, Buffer.from([2])), '52');       // OP_2
  t('min [0x81]',    mk(ScriptBuf.prototype.pushMinimal, Buffer.from([0x81])), '4f');    // OP_1NEGATE
  t('min [0x11]',    mk(ScriptBuf.prototype.pushMinimal, Buffer.from([0x11])), '0111');  // OP_DATA_1 11
  t('expl [0x01]',   mk(ScriptBuf.prototype.pushExplicit, Buffer.from([1])), '0101');   // OP_DATA_1 01
  t('expl [0x00]',   mk(ScriptBuf.prototype.pushExplicit, Buffer.from([0])), '0100');   // OP_DATA_1 00
  t('min 4B',        mk(ScriptBuf.prototype.pushMinimal, Buffer.from([1,2,3,4])), '0401020304');

  // ── Canonical argent test vector ──
  // entry step(int n, byte[4] hash, bool flag, byte b), tag 2c49ed65
  // args [17, [1,2,3,4], true, 1] → 011104010203045151042c49ed65
  {
    const entry = { name: 'step', tag: Buffer.from('2c49ed65', 'hex'),
      params: [
        { name: 'n',    type: { kind: 'int' },         typeName: 'int' },
        { name: 'hash', type: { kind: 'fixed_bytes', len: 4 }, typeName: 'byte[4]' },
        { name: 'flag', type: { kind: 'bool' },        typeName: 'bool' },
        { name: 'b',    type: { kind: 'byte' },        typeName: 'byte' },
      ] };
    const buf = new ScriptBuf();
    encodeSigArg(buf, entry.params[0].type, 17n, 'n', () => null);
    encodeSigArg(buf, entry.params[1].type, Buffer.from([1,2,3,4]), 'hash', () => null);
    encodeSigArg(buf, entry.params[2].type, true, 'flag', () => null);
    encodeSigArg(buf, entry.params[3].type, 1, 'b', () => null);
    buf.pushMinimal(entry.tag);
    t('canonical vector', hex(buf.build()), '011104010203045151042c49ed65');
  }

  // ── Int array encoding: single push, 8-byte elements concatenated ──
  {
    const buf = new ScriptBuf();
    encodeSigArg(buf, { kind: 'dynamic_array', item: { kind: 'int' } }, [1n, 2n, 3n], 'arr', () => null);
    t('int[] [1,2,3]', hex(buf.build()), '18' + hex(serializeScriptNumFixed8(1n)) + hex(serializeScriptNumFixed8(2n)) + hex(serializeScriptNumFixed8(3n)));
    // 0x18 = 24 = OP_DATA_24 (3 × 8 bytes)
  }

  // ── Struct arg: one push per field ──
  {
    const stateStruct = { fields: [
      { name: 'a', type: { kind: 'int' } },
      { name: 'b', type: { kind: 'bool' } },
    ] };
    const resolve = n => n === 'MyStruct' ? stateStruct : null;
    const buf = new ScriptBuf();
    encodeSigArg(buf, { kind: 'struct', name: 'MyStruct' }, { a: 5n, b: true }, 's', resolve);
    // int 5 → OP_5 (minimal: 5 is in 1..=16, same path as rusty-kaspa add_data)
    // bool true → OP_1 = "51"
    t('struct {int,bool}', hex(buf.build()), '5551');
  }

  // ── Struct array: column-grouped ──
  {
    const stateStruct = { fields: [
      { name: 'owner', type: { kind: 'fixed_bytes', len: 1 } },
      { name: 'amount', type: { kind: 'int' } },
    ] };
    const resolve = n => n === 'S' ? stateStruct : null;
    const buf = new ScriptBuf();
    encodeSigArg(buf,
      { kind: 'dynamic_array', item: { kind: 'struct', name: 'S' } },
      [{ owner: Buffer.from([0xaa]), amount: 1n }, { owner: Buffer.from([0xbb]), amount: 2n }],
      'states', resolve);
    // Column 1 (owner): [0xaa, 0xbb] concatenated → OP_DATA_2 aabb = "02aabb"
    // Column 2 (amount): 8+8=16 bytes → OP_DATA_16 + fixed8(1) + fixed8(2) = "10" + "0100000000000000" + "0200000000000000"
    t('struct[] column-grouped', hex(buf.build()),
      '02aabb' + '10' + hex(serializeScriptNumFixed8(1n)) + hex(serializeScriptNumFixed8(2n)));
  }

  // ── Byte 0 edge case ──
  {
    const buf = new ScriptBuf();
    encodeSigArg(buf, { kind: 'byte' }, 0, 'b', () => null);
    t('byte 0 → OP_DATA_1 00', hex(buf.build()), '0100');
  }

  // ── Int 0 edge case (different from byte 0!) ──
  {
    const buf = new ScriptBuf();
    encodeSigArg(buf, { kind: 'int' }, 0n, 'n', () => null);
    t('int 0 → OP_0', hex(buf.build()), '00');
  }

  console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
  process.exit(fail ? 1 : 0);
}
