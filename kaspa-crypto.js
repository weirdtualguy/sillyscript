// kaspa-crypto.js — Kaspa cryptographic primitives (kaspa-platform-kit) v2
//
// PRODUCTION-VALIDATED against mainnet genesis f6ebb717...:
//   covenant ID computed from REST data matched on-chain 63fccd99...
//   sighash + schnorr verified against the genesis signature
//
// [PIN] REST txids are INTERNAL byte order — hex-decode directly, NEVER reverse
// [PIN] P2SH spk = aa20 + blake2b32(redeem) + 87  (35 B, NO version prefix)
// [PIN] P2PK spk = 20 + pubkey[32] + ac  (34 B)
// [PIN] verification pubkey comes from the UTXO's P2PK script (script[1..33])

const { blake2b } = require('@noble/hashes/blake2b');

// ─── Keyed BLAKE2b ───

const keyedBlake2b = (data, keyStr, dkLen = 32) =>
  Buffer.from(blake2b(Buffer.isBuffer(data) ? data : Buffer.from(data),
    { key: Buffer.from(keyStr, 'utf8'), dkLen }));

const sighashHash  = preimage => keyedBlake2b(preimage, 'TransactionSigningHash');
const covenantHash = preimage => keyedBlake2b(preimage, 'CovenantID');

// ─── Bech32 (Kaspa variant: CashAddr checksum, no BIP-173 hrp expansion) ───

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const POLYMOD_GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

function conv8to5(bytes) {
  let acc = 0n, bits = 0; const out = [];
  for (const b of bytes) {
    acc = (acc << 8n) | BigInt(b); bits += 8;
    while (bits >= 5) { bits -= 5; out.push(Number((acc >> BigInt(bits)) & 31n)); }
  }
  if (bits > 0) out.push(Number((acc << BigInt(5 - bits)) & 31n));
  return out;
}

function conv5to8(values) {
  let acc = 0n, bits = 0; const out = [];
  for (const v of values) {
    acc = (acc << 5n) | BigInt(v); bits += 5;
    while (bits >= 8) { bits -= 8; out.push(Number((acc >> BigInt(bits)) & 255n)); }
  }
  return out;
}

function bech32Polymod(values) {
  let c = 1n;
  for (const d of values) {
    const top = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    for (let i = 0; i < 5; i++) if ((top >> BigInt(i)) & 1n) c ^= POLYMOD_GEN[i];
  }
  return c;
}

function encodeAddress(hrp, version, payload) {
  if (payload.length !== 32) throw new Error('payload must be 32 bytes, got ' + payload.length);
  const data = conv8to5([version, ...payload]);
  const prefix5 = [...hrp].map(c => c.charCodeAt(0) & 0x1f);
  const chk = bech32Polymod([...prefix5, 0, ...data, 0,0,0,0,0,0,0,0]) ^ 1n;
  const chkVal = chk & 0xffffffffffn;
  const chkBytes = Buffer.alloc(5);
  for (let i = 0; i < 5; i++) chkBytes[i] = Number((chkVal >> BigInt(8 * (4 - i))) & 0xffn);
  const all = [...data, ...conv8to5(chkBytes)];
  return hrp + ':' + all.map(d => BECH32_CHARSET[d]).join('');
}

function decodeAddress(addr) {
  const colonIdx = addr.indexOf(':');
  if (colonIdx < 0) throw new Error('no separator ":"');
  const hrp = addr.slice(0, colonIdx);
  const data = [...addr.slice(colonIdx + 1)].map(c => {
    const idx = BECH32_CHARSET.indexOf(c);
    if (idx < 0) throw new Error("invalid char '" + c + "'");
    return idx;
  });
  if (data.length < 9) throw new Error('too short');
  const prefix5 = [...hrp].map(c => c.charCodeAt(0) & 0x1f);
  if (bech32Polymod([...prefix5, 0, ...data]) !== 1n) throw new Error('bad checksum');
  const bytes = Buffer.from(conv5to8(data.slice(0, -8)));
  if (bytes.length !== 33) throw new Error('decoded ' + bytes.length + ' bytes, expected 33');
  return { hrp, version: bytes[0], payload: bytes.subarray(1) };
}

// ─── Script public keys (chain-exact formats) ───

// P2SH spk: aa20 + blake2b32(redeem) + 87  (35 bytes) [PIN mainnet]
// Bytes in: Buffer/Uint8Array or an even-length hex string. Never UTF-8 (audit S18).
const toBytes = (x, what) => {
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (typeof x === 'string' && x.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(x)) return Buffer.from(x, 'hex');
  throw new Error(what + ': expected bytes or an even-length hex string');
};
const p2shSpk = redeem => {
  const r = toBytes(redeem, 'p2shSpk redeem');
  if (r.length === 0) throw new Error('p2shSpk: empty redeem script');
  return Buffer.concat([Buffer.from('aa20', 'hex'), Buffer.from(blake2b(r, { dkLen: 32 })), Buffer.from('87', 'hex')]);
};

// P2PK spk: 20 + pubkey[32] + ac  (34 bytes)
const p2pkSpk = pubkey32 => {
  const k = toBytes(pubkey32, 'p2pkSpk pubkey');
  if (k.length !== 32) throw new Error('p2pkSpk: pubkey must be 32 bytes (x-only), got ' + k.length);
  return Buffer.concat([Buffer.from('20', 'hex'), k, Buffer.from('ac', 'hex')]);
};

// Extract pubkey from a P2PK script [PIN mainnet wrong-key incident]
function extractPubkeyFromP2PK(spk) {
  const s = Buffer.isBuffer(spk) ? spk : Buffer.from(spk, 'hex');
  if (s.length !== 34 || s[0] !== 0x20 || s[33] !== 0xac)
    throw new Error('not a P2PK script (len=' + s.length + ')');
  return s.subarray(1, 33);
}

const p2shAddress = (hrp, redeem) => encodeAddress(hrp, 8, p2shSpk(redeem).subarray(2, 34));
const p2pkAddress = (hrp, pubkey32) => encodeAddress(hrp, 0, pubkey32);

// ─── Covenant ID (KIP-20) — mainnet-verified ───

function covenantId(authTxid, authIndex, outputs) {
  if (authTxid.length !== 32) throw new Error('authTxid must be 32 bytes');
  const parts = [authTxid];
  const idxBuf = Buffer.alloc(4); idxBuf.writeUInt32LE(authIndex); parts.push(idxBuf);
  const cntBuf = Buffer.alloc(8); cntBuf.writeBigUInt64LE(BigInt(outputs.length)); parts.push(cntBuf);
  for (const out of outputs) {
    const oIdx = Buffer.alloc(4); oIdx.writeUInt32LE(out.index); parts.push(oIdx);
    const valBuf = Buffer.alloc(8); valBuf.writeBigUInt64LE(BigInt(out.value)); parts.push(valBuf);
    const verBuf = Buffer.alloc(2); verBuf.writeUInt16LE(out.scriptVersion || 0); parts.push(verBuf);
    const script = Buffer.isBuffer(out.script) ? out.script : Buffer.from(out.script);
    const lenBuf = Buffer.alloc(8); lenBuf.writeBigUInt64LE(BigInt(script.length)); parts.push(lenBuf);
    parts.push(script);
  }
  return covenantHash(Buffer.concat(parts));
}

// ─── Self-test ───

if (require.main === module && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const t = (label, cond, detail) => {
    if (cond) pass++; else fail++;
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
  };

  { // bech32 round-trips
    const pk = Buffer.from('ec7a4c67eb8c26c145519cbee601ee8dfe3ada9eb5e47d81b6d4d0f8d5094294', 'hex');
    for (const hrp of ['kaspa', 'kaspatest']) {
      const addr = encodeAddress(hrp, 0, pk);
      const dec = decodeAddress(addr);
      t('bech32 P2PK round-trip ' + hrp, dec.hrp === hrp && dec.version === 0 && dec.payload.equals(pk));
      t('bech32 P2PK len ' + hrp, hrp === 'kaspa' ? addr.length === 67 : addr.length === 71, 'len=' + addr.length);
    }
    const sh = Buffer.from('63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb', 'hex');
    const dec = decodeAddress(encodeAddress('kaspa', 8, sh));
    t('bech32 P2SH round-trip', dec.version === 8 && dec.payload.equals(sh));
  }
  { // tamper
    const addr = encodeAddress('kaspatest', 0, Buffer.alloc(32, 0x42));
    const tampered = addr.slice(0, -1) + BECH32_CHARSET[(BECH32_CHARSET.indexOf(addr[addr.length-1]) + 1) % 32];
    let threw = false;
    try { decodeAddress(tampered); } catch (e) { threw = true; }
    t('bech32 tamper rejected', threw);
  }
  { // script formats
    const spk = p2shSpk(Buffer.alloc(100, 0xaa));
    t('P2SH spk len=35', spk.length === 35, 'len=' + spk.length);
    t('P2SH spk prefix=aa20', spk.subarray(0, 2).toString('hex') === 'aa20');
    t('P2SH spk suffix=87', spk.subarray(34).toString('hex') === '87');
    const pk = p2pkSpk(Buffer.alloc(32, 0x42));
    t('P2PK spk len=34', pk.length === 34);
    t('P2PK spk prefix=20', pk.subarray(0, 1).toString('hex') === '20');
    t('P2PK spk suffix=ac', pk.subarray(33).toString('hex') === 'ac');
    t('P2PK pubkey extract', extractPubkeyFromP2PK(pk).equals(Buffer.alloc(32, 0x42)));
  }
  { // covenant ID
    const authTxid = Buffer.alloc(32, 0x4d);
    const script = Buffer.from([0xaa, 0xbb]);
    const out = [{ index: 0, value: 1000n, scriptVersion: 0, script }];
    const c1 = covenantId(authTxid, 0, out);
    t('covenant ID len=32', c1.length === 32);
    t('covenant ID deterministic', c1.equals(covenantId(authTxid, 0, [{ index: 0, value: 1000n, scriptVersion: 0, script }])));
    t('covenant ID value-sensitive', !c1.equals(covenantId(authTxid, 0, [{ index: 0, value: 2000n, scriptVersion: 0, script }])));
    t('covenant ID script-sensitive', !c1.equals(covenantId(authTxid, 0, [{ index: 0, value: 1000n, scriptVersion: 0, script: Buffer.from([0xcc]) }])));
  }
  { // input handling + chain-anchored bech32 (audit S18)
    const thr = f => { try { f(); return false; } catch (e) { return true; } };
    t('p2shSpk hex string == bytes', p2shSpk('aabbcc').equals(p2shSpk(Buffer.from('aabbcc', 'hex'))));
    t('p2pkSpk accepts Uint8Array', p2pkSpk(new Uint8Array(32).fill(1)).length === 34);
    t('p2pkSpk hex string (64 chars) -> 34B', p2pkSpk('ab'.repeat(32)).length === 34);
    t('p2pkSpk rejects 33-byte key', thr(() => p2pkSpk(Buffer.alloc(33, 1))));
    t('p2pkSpk rejects non-hex string', thr(() => p2pkSpk('zz'.repeat(32))));
    t('p2shSpk rejects empty redeem', thr(() => p2shSpk(Buffer.alloc(0))));
    const chainSpk = Buffer.from('aa2089c2bdd88645cc4c1505bb8a4122ba00a855a4a538852bc011facbf9fa55811387', 'hex');
    t('bech32 matches chain address (counter genesis bd4085b1)', encodeAddress('kaspatest', 8, chainSpk.subarray(2, 34)) === 'kaspatest:pzyu90wcsezucnq4qkac5sfzhgq2s4dy55ug227qz8avh7062kq3xmcqz9dcu');
  }
  { // keyed hashes
    t('keyed blake2b dkLen=32', keyedBlake2b(Buffer.from('test'), 'CovenantID').length === 32);
    t('keys differ', !keyedBlake2b(Buffer.from('test'), 'CovenantID').equals(keyedBlake2b(Buffer.from('test'), 'TransactionSigningHash')));
  }

  console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL ' + pass + ' PASS');
  process.exit(fail ? 1 : 0);
}

module.exports = {
  keyedBlake2b, sighashHash, covenantHash,
  encodeAddress, decodeAddress,
  p2shSpk, p2pkSpk, p2shAddress, p2pkAddress,
  extractPubkeyFromP2PK, covenantId,
};
