// sil-abi.js — SilverScript ABI artifact loader & verifier
// sillyscript / codec seed · v2 (struct-aware dispatch tags)
//
// [REF c7d17a1] tag = blake3("name(t1,t2,...)")[0..4], unkeyed, where:
//   - scalars render as: int, temporal, bool, byte, string, pubkey, sig,
//     datasig, byte[] (dynamic), byte[N] (fixed)
//   - structs render as {field1,field2,...} — braces, comma-joined,
//     recursive, NO spaces; 'State' resolves to the contract's runtime_state;
//     other names resolve through the artifact's structs registry
//   - array dims append after the rendered base: [] or [N]
//   - param NAMES are invisible to the preimage; param ORDER is committed
//   - scalar-only signatures are identical across compiler revisions
//     28a16f0 (pre-#223) and c7d17a1 (post-#223); struct-bearing ones are
//     post-#223 only (pre-#223 used the struct's bare name)
// [REF c7d17a1] template_hash = blake3(ser8le(len prefix)|prefix|ser8le(len suffix)|suffix)
// [REF c7d17a1] bytecode layout: TOALTSTACK | one explicit push per state
//   field | FROMALTSTACK | dispatch cascade (DUP <tag> EQUAL IF DROP body ELSE ... )
// [REF argent codec] P2SH spk = 00 00 OP_BLAKE2B 0x20 blake2b32(redeem) OP_EQUAL (37 B with the 2-byte version prefix; the 35 B aa20<hash>87 form is what REST and kaspa-crypto.js use)
//
// VERIFIED: 24/24 dispatch tags + 6/6 template hashes across 6 production
// artifacts: pixel-token-abi, pixel-minter-abi (struct-bearing),
// factory-abi-v11, edition-abi-v4/v5/v6 (scalar-bearing).
//
// This module FAILS CLOSED: any artifact whose stored tags, template hash,
// or structure does not match its own declared data is rejected at load.
// Builders must go through entry() — tags are never hardcoded.

const { blake3 } = require('@noble/hashes/blake3');
const { p2shSpk } = require('./kaspa-crypto');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Type name rendering
// ---------------------------------------------------------------------------

// Plain rendering (display / error messages) — mirrors TypeRef::type_name()
function typeName(t) {
  switch (t.kind) {
    case 'int': return 'int';        case 'temporal': return 'temporal';
    case 'bool': return 'bool';      case 'byte': return 'byte';
    case 'bytes': return 'byte[]';   case 'string': return 'string';
    case 'pubkey': return 'pubkey';  case 'sig': return 'sig';
    case 'datasig': return 'datasig';
    case 'fixed_bytes': return 'byte[' + t.len + ']';
    case 'fixed_array': return typeName(t.item) + '[' + t.len + ']';
    case 'dynamic_array': return typeName(t.item) + '[]';
    case 'struct': return t.name;
    default: throw new Error('sil-abi: unknown type kind ' + JSON.stringify(t));
  }
}

// Dispatch-signature rendering [REF c7d17a1 write_dispatch_type_name]:
//   struct        -> '{' fields ','-joined recursive '}'  (no spaces)
//   array dims    -> appended after the rendered base: [] or [N]
//   scalars       -> identical to typeName()
// resolveStruct(name) must return { fields: [...] } for 'State' and every
// declared struct; unknown struct names throw.
function dispatchTypeName(t, resolveStruct) {
  switch (t.kind) {
    case 'struct': {
      const st = resolveStruct(t.name);
      if (!st || !st.fields) throw new Error("sil-abi: unknown struct '" + t.name + "' in dispatch type");
      return '{' + st.fields.map(f => dispatchTypeName(f.type, resolveStruct)).join(',') + '}';
    }
    case 'fixed_array':    return dispatchTypeName(t.item, resolveStruct) + '[' + t.len + ']';
    case 'dynamic_array':  return dispatchTypeName(t.item, resolveStruct) + '[]';
    default:               return typeName(t);
  }
}

// ---------------------------------------------------------------------------
// Hashes
// ---------------------------------------------------------------------------

const dispatchTag = (name, types, resolveStruct) =>
  Buffer.from(blake3(Buffer.from(
    name + '(' + types.map(t => dispatchTypeName(t, resolveStruct)).join(',') + ')',
    'utf8'
  ))).subarray(0, 4);

const num8le = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

const templateHash = (prefix, suffix) =>
  Buffer.from(blake3(Buffer.concat([num8le(prefix.length), prefix, num8le(suffix.length), suffix])));

// P2SH spk is owned by kaspa-crypto.js (aa20..87, 35 bytes — production-validated)

// ---------------------------------------------------------------------------
// Script parsing
// ---------------------------------------------------------------------------

function parsePushes(script) {
  const pushes = []; let o = 0;
  while (o < script.length) {
    const start = o, op = script[o]; o += 1;
    if (op === 0x00) { pushes.push({ start, data: script.subarray(o, o) }); continue; }
    let len;
    if (op >= 0x01 && op <= 0x4b) len = op;
    else if (op === 0x4c) { len = script.readUInt8(o);    o += 1; }
    else if (op === 0x4d) { len = script.readUInt16LE(o); o += 2; }
    else if (op === 0x4e) { len = script.readUInt32LE(o); o += 4; }
    else throw new Error('sil-abi: opcode 0x' + op.toString(16) + ' at ' + start + ' is not a push');
    if (o + len > script.length) throw new Error('sil-abi: push at ' + start + ' overruns script');
    pushes.push({ start, data: script.subarray(o, o + len) }); o += len;
  }
  return pushes;
}

function decodeScriptNum(buf) {  // sign-magnitude little-endian
  if (buf.length === 0) return 0n;
  const last = buf[buf.length - 1], neg = !!(last & 0x80);
  const mag = Buffer.from(buf); mag[mag.length - 1] = last & 0x7f;
  let v = 0n;
  for (let i = mag.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(mag[i]);
  return neg ? -v : v;
}

// ---------------------------------------------------------------------------
// Artifact loading & verification
// ---------------------------------------------------------------------------

function loadArtifact(pathOrObject) {
  // A path or an already-parsed artifact object: no temp files (Termux has no /tmp)
  const isPath = typeof pathOrObject === 'string';
  const a = isPath ? JSON.parse(fs.readFileSync(pathOrObject, 'utf8')) : pathOrObject;
  const path = isPath ? pathOrObject : 'artifact object';
  if (a === null || typeof a !== 'object')
    throw new Error('sil-abi: artifact must be a path or an object (' + path + ')');
  if (a.schema_version !== 1)
    throw new Error('sil-abi: schema_version ' + a.schema_version + ' unsupported (' + path + ')');
  const structs = a.structs || {};
  const contracts = {};
  for (const [name, c] of Object.entries(a.contracts))
    contracts[name] = new ContractView(name, c, structs);
  return { artifact: a, structs, contracts };
}

class ContractView {
  constructor(name, c, structs) {
    this.name = name;
    this.structs = structs;

    // --- bytecode & state span ---
    const raw = c.compiled.bytecode;
    if ((raw instanceof Uint8Array) === false &&
        (Array.isArray(raw) === false || raw.every(b => Number.isInteger(b) && b >= 0 && b <= 255) === false))
      throw new Error(name + ': compiled.bytecode must be an array of bytes 0-255');
    this.bytecode = Buffer.from(raw);
    const sp = c.compiled.state_span;
    if (sp.offset + sp.len > this.bytecode.length)
      throw new Error(name + ': state span exceeds bytecode');
    this.stateSpan = sp;
    this.prefix      = this.bytecode.subarray(0, sp.offset);
    this.stateScript = this.bytecode.subarray(sp.offset, sp.offset + sp.len);
    this.suffix      = this.bytecode.subarray(sp.offset + sp.len);

    // --- runtime state fields & struct resolution ---
    this.fields = c.runtime_state.fields;
    // 'State' is the contract's own runtime state; other names resolve
    // through the artifact's structs registry (mirrors the abi crate's
    // TypeContext::struct_by_name).
    this.resolveStruct = n => (n === 'State' ? { fields: this.fields } : structs[n]);

    // --- structural checks (stateful contracts only) ---
    if (this.fields.length > 0) {
      if (!(this.prefix.length === 1 && this.prefix[0] === 0x6b))   // OP_TOALTSTACK
        throw new Error(name + ': expected TOALTSTACK prefix');
      if (!(this.suffix.length >= 1 && this.suffix[0] === 0x6c))    // OP_FROMALTSTACK
        throw new Error(name + ': expected FROMALTSTACK suffix head');
    }

    // --- template hash: artifact must hash to its own declared value ---
    const th = templateHash(this.prefix, this.suffix);
    if (!th.equals(Buffer.from(c.compiled.template_hash)))
      throw new Error(name + ': template hash mismatch — artifact corrupted or tampered');
    this.templateHash = th;

    // --- entries: derive-and-assert every dispatch tag ---
    this.entries = {};
    for (const [en, e] of Object.entries(c.entries)) {
      const params = e.params.map(p => ({ name: p.name, type: p.type, typeName: typeName(p.type) }));
      const derived = dispatchTag(en, params.map(p => p.type), this.resolveStruct);
      if (!derived.equals(Buffer.from(e.dispatch_tag, 'hex')))
        throw new Error(
          name + '::' + en + ': dispatch tag drift (stored ' + e.dispatch_tag +
          ', derived ' + derived.toString('hex') + ') — preimage "' +
          en + '(' + params.map(p => dispatchTypeName(p.type, this.resolveStruct)).join(',') + ')". ' +
          'NEVER hardcode tags; regenerate the artifact or fix the derivation.'
        );
      this.entries[en] = { name: en, params, tag: derived };
    }

    // --- covenant declaration routing (mirrors the Rust resolution) ---
    this.covDeclToAbi = c.cov_decl_to_abi || {};
    this.delegateEntryAbi = c.delegate_entry_abi || null;
  }

  entry(name) {
    const e = this.entries[name];
    if (!e) throw new Error(this.name + ": no entry '" + name + "' (have: " + Object.keys(this.entries).join(', ') + ')');
    return e;
  }

  // Resolve a source covenant declaration to its public entrypoint.
  // is_leader=true (or no delegate) -> leader entry; otherwise the shared
  // delegate entry. Mirrors encode_contract_covenant_decl_sig_script.
  covenantEntry(declName, isLeader = true) {
    const entryName = this.covDeclToAbi[declName];
    if (!entryName) throw new Error(this.name + ": no covenant declaration '" + declName + "'");
    if (!isLeader && this.delegateEntryAbi) return this.entry(this.delegateEntryAbi);
    return this.entry(entryName);
  }

  redeemLength() { return this.bytecode.length; }

  // The redeem script is the LAST redeemLength() bytes of a sigscript
  // [REF state.rs: base = sigscript_len - bytecode_size].
  extractRedeem(sigscript) {
    const ss = Buffer.isBuffer(sigscript) ? sigscript : Buffer.from(sigscript, 'hex');
    if (ss.length < this.redeemLength())
      throw new Error(this.name + ': sigscript shorter than redeem');
    return ss.subarray(ss.length - this.redeemLength());
  }

  // F1 gate, artifact-driven: the redeem's template must hash to this
  // contract's template hash. Prefix/suffix must match; the state payload
  // in between is the live state and may differ from genesis.
  verifyRedeem(redeem) {
    const r = Buffer.isBuffer(redeem) ? redeem : Buffer.from(redeem, 'hex');
    if (r.length !== this.redeemLength())
      throw new Error(this.name + ': redeem length ' + r.length + ', expected ' + this.redeemLength());
    const p = r.subarray(0, this.stateSpan.offset);
    const s = r.subarray(this.stateSpan.offset + this.stateSpan.len);
    if (!templateHash(p, s).equals(this.templateHash))
      throw new Error(this.name + ': redeem template hash mismatch — wrong contract or wrong span');
    return true;
  }

  expectedSpk(redeem) { return p2shSpk(redeem); }

  // Decode a runtime state script into named values. Ints decode as BigInt —
  // callers must keep arithmetic in BigInt (the Number() double-rounding bug
  // on 61-bit serials is unrepresentable through this API).
  decodeState(stateScript = this.stateScript) {
    const pushes = parsePushes(stateScript);
    let i = 0; const out = {};
    for (const f of this.fields) {
      if (i >= pushes.length) throw new Error(this.name + ": state underflow at '" + f.name + "'");
      out[f.name] = this.decodeField(f.name, f.type, pushes[i++].data);
    }
    if (i !== pushes.length)
      throw new Error(this.name + ': ' + (pushes.length - i) + ' trailing state push(es)');
    return out;
  }

  decodeField(name, t, data) {
    switch (t.kind) {
      case 'int': case 'temporal':
        if (data.length !== 8) throw new Error(this.name + '.' + name + ': int push is ' + data.length + 'B, expected 8');
        return decodeScriptNum(data);
      case 'bool':
        if (data.length !== 1 || data[0] > 1) throw new Error(this.name + '.' + name + ': bad bool byte');
        return data[0] === 1;
      case 'byte':
        if (data.length !== 1) throw new Error(this.name + '.' + name + ': byte push is ' + data.length + 'B');
        return data[0];
      case 'fixed_bytes':
        if (data.length !== t.len) throw new Error(this.name + '.' + name + ': expected ' + t.len + 'B, got ' + data.length);
        return data.toString('hex');
      case 'pubkey': case 'sig': case 'datasig': {
        const want = this.fixedLen(t);
        if (data.length !== want) throw new Error(this.name + '.' + name + ': ' + t.kind + ' push is ' + data.length + 'B, expected ' + want);
        return data.toString('hex');
      }
      case 'bytes': return data.toString('hex');
      case 'string': return data.toString('utf8');
      case 'fixed_array': {
        const itemLen = this.fixedLen(t.item);
        if (data.length % itemLen) throw new Error(this.name + '.' + name + ': array not divisible by item size');
        const items = [];
        for (let o = 0; o < data.length; o += itemLen)
          items.push(this.decodeField(name, t.item, data.subarray(o, o + itemLen)));
        return items;
      }
      default:
        throw new Error(this.name + '.' + name + ": state kind '" + t.kind + "' not yet supported (structs need the structs registry)");
    }
  }

  fixedLen(t) {
    switch (t.kind) {
      case 'int': case 'temporal': return 8;
      case 'bool': case 'byte': return 1;
      case 'fixed_bytes': return t.len;
      case 'pubkey': return 32; case 'sig': return 65; case 'datasig': return 64;
      case 'fixed_array': return t.len * this.fixedLen(t.item);
      default: throw new Error('dynamic/struct item in fixed state: ' + typeName(t));
    }
  }
}

module.exports = {
  loadArtifact, typeName, dispatchTypeName, dispatchTag,
  templateHash, parsePushes, decodeScriptNum, num8le
};
