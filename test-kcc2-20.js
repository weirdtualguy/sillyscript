// test-kcc2-20.js — KCC-2 (Authority Schemes) section 4.1 and KCC-20 (Fungible Token
// Covenant) codec vectors, run against the sillyscript codec. Both specs: Status Final.
// Contract-level behaviour (borrow-threshold accept/reject cases, transfer rejects) needs a
// compiled KCC-20 program and the VM; those cases are out of scope here (see KCC-CONFORMANCE.md).

const { blake3 } = require('@noble/hashes/blake3');
const { dispatchTag } = require('./sil-abi');
const { ScriptBuf, encodeState, buildSigScript } = require('./sil-encoder');
const { p2shSpk } = require('./kaspa-crypto');

let pass = 0, fail = 0;
const hex = b => Buffer.from(b).toString('hex');
const rep = (h, n) => Buffer.from(h.repeat(n), 'hex');
const cat = (...p) => Buffer.concat(p.map(x => typeof x === 'string' ? Buffer.from(x, 'hex') : x));
const t = (name, got, want) => {
    if (got === want) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + '\n        got  ' + got + '\n        want ' + want); }
};
const H = b => hex(blake3(b));

// ── KCC-2 §4.1 ──
{
    const G = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    t('KCC-2 p2pkh-schnorr: Hash(pubkey)', H(Buffer.from(G, 'hex')), 'f9f2a0b353f482f415281da3a00929d08a7d9a6498054f5ef6623b5580e607f7');
    t('KCC-2 p2pkh-ecdsa: Hash(compressed pubkey)', H(Buffer.from('02' + G, 'hex')), '1a15d6547364ad963c3b840e885639bb8136a4de757c0e7cf63f5de2f1cfbdbe');
    t('KCC-2 p2sh: Blake2b(R=51)', hex(p2shSpk(Buffer.from('51', 'hex')).subarray(2, 34)), 'ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d');
    const cid = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    const val = Buffer.from(cid, 'hex');
    t('KCC-2 argument encoding is 20 || value (PushMinimal)', hex(new ScriptBuf().pushMinimal(val).build()), '20' + cid);
    t('KCC-2 state encoding is 20 || value (PushExplicit)', hex(new ScriptBuf().pushExplicit(val).build()), '20' + cid);
}

// ── KCC-20 ──
const I = { kind: 'int' }, B = { kind: 'byte' }, F32 = { kind: 'fixed_bytes', len: 32 };
const KCC20State = { fields: [
    { name: 'amount', type: I }, { name: 'owner', type: F32 }, { name: 'owner_scheme', type: B },
    { name: 'borrow_scheme', type: B }, { name: 'borrow_guard', type: F32 }, { name: 'extension_commitment', type: F32 }] };
const resolve = n => (n === 'KCC20State' ? KCC20State : null);
const stateArr = { kind: 'dynamic_array', item: { kind: 'struct', name: 'KCC20State' } };

t('KCC-20 dispatch tag transfer(KCC20State[],byte[])', hex(dispatchTag('transfer', [stateArr, { kind: 'bytes' }], resolve)), '79c71c23');
t('KCC-20 dispatch tag transfer_delegator(byte[])', hex(dispatchTag('transfer_delegator', [{ kind: 'bytes' }], resolve)), 'fd3ef14a');

{
    const guard = cat('f401000000000000', rep('00', 24));
    const enc = encodeState({ fields: KCC20State.fields }, {
        amount: 1000n, owner: rep('11', 32), owner_scheme: 1, borrow_scheme: 1, borrow_guard: guard, extension_commitment: rep('00', 32) });
    t('KCC-20 EncodeState length', String(enc.length), '112');
    t('KCC-20 EncodeState bytes', hex(enc),
        hex(cat('08', 'e803000000000000', '20', rep('11', 32), '0101', '0101', '20', guard, '20', rep('00', 32))));
}

{
    const view = { entry: () => ({ params: [{ name: 'next_states', type: stateArr }, { name: 'witness', type: { kind: 'bytes' } }], tag: Buffer.from('79c71c23', 'hex') }),
        resolveStruct: resolve, bytecode: Buffer.from('51', 'hex') };
    const next = [
        { amount: 600n, owner: rep('22', 32), owner_scheme: 0, borrow_scheme: 0, borrow_guard: rep('00', 32), extension_commitment: rep('00', 32) },
        { amount: 400n, owner: rep('33', 32), owner_scheme: 1, borrow_scheme: 1, borrow_guard: rep('00', 32), extension_commitment: rep('00', 32) }];
    const witness = cat('00', rep('44', 65));
    const got = hex(buildSigScript(view, 'transfer', [next, witness]));
    const want = hex(cat('10', '5802000000000000', '9001000000000000', '40', rep('22', 32), rep('33', 32), '02', '00', '01', '02', '00', '01',
        '40', rep('00', 64), '40', rep('00', 64), '42', witness, '04', '79c71c23'));
    t('KCC-20 transfer arguments (grouped fields, witness, tag)', got, want);
}

// owner-authentication witnesses are opaque bytes to the codec; check the hashes the vectors pin
t('KCC-20 P2PKHHash(22^32)', H(rep('22', 32)), '7caa514a05535fd97887e483ce6f1fc36ef7026435c47521b04549d9af4837bf');
t('KCC-20 P2PKHHash(02||55^32)', H(cat('02', rep('55', 32))), 'ed887ad164d313eeeac970912504a81156274732ab09c0c0559ff59160abddf9');
{
    const x1 = blake3(cat(rep('a0', 32), rep('b1', 32)));
    const x2 = blake3(cat(x1, rep('b2', 32)));
    const x3 = blake3(cat(x2, rep('b3', 32)));
    t('KCC-20 hash chain x_1', hex(x1), '7c39893345dd20342a5b0b5dd3459276e4fee0cfab947e720b18be5af5500f99');
    t('KCC-20 hash chain x_2', hex(x2), 'c1addceaf72a21a322c888e10e2f34445b063c3ca61fe7a1614f2d382961f0ee');
    t('KCC-20 hash chain x_3 (initial borrow_guard)', hex(x3), '46530c9d75f7a5a1ce01b4e04cd8833f5f30c2482f99d855e3841279a8bcb8cc');
    t('KCC-20 Hash(x_1 || b3^32)', H(cat(x1, rep('b3', 32))), '54b9c2f64c32236324a93ad2d57da6c73d5ff733ef133b69e0da978f5ba00a00');
}

console.log('\n' + (fail ? fail + ' FAIL, ' + pass + ' pass' : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
