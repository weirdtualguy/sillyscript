// verify-tags.js — canonical dispatch-tag + template-hash verifier (all artifact eras)
// [REF c7d17a1] schema-1: tag = blake3(name(t1,...))[0..4], structs as {fields}, dims after
// [REF 28a16f0] old-format: same formula over the artifact's stored type_name strings
const { blake3 } = require('@noble/hashes/blake3');
const fs = require('fs');
const tag = s => Buffer.from(blake3(Buffer.from(s, 'utf8'))).subarray(0, 4).toString('hex');
const num8le = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const thash = (p, s) => Buffer.from(blake3(Buffer.concat([num8le(p.length), p, num8le(s.length), s]))).toString('hex');
function scalar(t) {
  switch (t.kind) {
    case 'int': return 'int'; case 'temporal': return 'temporal';
    case 'bool': return 'bool'; case 'byte': return 'byte';
    case 'bytes': return 'byte[]'; case 'string': return 'string';
    case 'pubkey': return 'pubkey'; case 'sig': return 'sig'; case 'datasig': return 'datasig';
    case 'fixed_bytes': return 'byte[' + t.len + ']';
    default: return null;
  }
}
function dispatchTypeName(t, resolve) {
  const s = scalar(t);
  if (s !== null) return s;
  switch (t.kind) {
    case 'struct': {
      const st = resolve(t.name);
      if (!st) throw new Error('unknown struct ' + t.name);
      return '{' + st.fields.map(f => dispatchTypeName(f.type, resolve)).join(',') + '}';
    }
    case 'fixed_array': return dispatchTypeName(t.item, resolve) + '[' + t.len + ']';
    case 'dynamic_array': return dispatchTypeName(t.item, resolve) + '[]';
    default: throw new Error('bad type ' + JSON.stringify(t));
  }
}
let fails = 0;
for (const path of process.argv.slice(2)) {
  if (!fs.existsSync(path)) { console.log('SKIP  ' + path); continue; }
  const a = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (a.schema_version === undefined) {          // OLD format: derive-only (pre-#232, tags not stored)
    console.log('\n' + path + '  [old format: ' + (a.contract_name || '?') + ']');
    for (const e of (a.abi || [])) {
      const sig = e.name + '(' + e.inputs.map(i => i.type_name).join(',') + ')';
      console.log('   derive  ' + sig + '  ->  ' + tag(sig));
    }
    continue;
  }
  console.log('\n' + path);                       // NEW format: full verification
  for (const [cn, c] of Object.entries(a.contracts)) {
    const resolve = n => n === 'State' ? { fields: c.runtime_state.fields } : (a.structs || {})[n];
    for (const [en, e] of Object.entries(c.entries)) {
      const sig = en + '(' + e.params.map(p => dispatchTypeName(p.type, resolve)).join(',') + ')';
      const got = tag(sig), ok = got === e.dispatch_tag;
      if (!ok) fails++;
      console.log((ok ? 'PASS' : 'FAIL') + '  ' + cn + '::' + en + '  ' + sig + '  ->  ' + got + (ok ? '' : '  (want ' + e.dispatch_tag + ')'));
    }
    const bc = Buffer.from(c.compiled.bytecode), sp = c.compiled.state_span;
    const th = thash(bc.subarray(0, sp.offset), bc.subarray(sp.offset + sp.len));
    const ok = th === Buffer.from(c.compiled.template_hash).toString('hex');
    if (!ok) fails++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + cn + ' template_hash  ' + th.slice(0, 16) + '...');
  }
}
console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
process.exit(fails ? 1 : 0);
