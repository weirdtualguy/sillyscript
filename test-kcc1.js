// test-kcc1.js — KCC-1 (Covenant Concepts, Byte Layouts, and ABI; Status: Final)
// conformance vectors, section 6, run against the sillyscript codec.
// Vectors are transcribed from the spec text; section numbers are cited per test.
// Not covered: 6.12 (hash-committed virtual elements) and variable-width state (string, T[]) — see KCC-CONFORMANCE.md.

const { blake3 } = require('@noble/hashes/blake3');
const { typeName, dispatchTag, templateHash } = require('./sil-abi');
const { ScriptBuf, serializeScriptNum, serializeScriptNumFixed8, encodeState, buildRedeem, buildSigScript, buildCompleteSigScript } = require('./sil-encoder');
const { p2shSpk } = require('./kaspa-crypto');

let pass = 0, fail = 0;
const hex = b => Buffer.from(b).toString('hex');
const rep = (byte, n) => Buffer.alloc(n, byte);
const t = (name, got, want) => {
    const ok = got === want;
    if (ok) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + '\n        got  ' + got + '\n        want ' + want); }
};
const minimal = b => hex(new ScriptBuf().pushMinimal(Buffer.from(b)).build());
const explicit = b => hex(new ScriptBuf().pushExplicit(Buffer.from(b)).build());

const T = {
    int: { kind: 'int' }, bool: { kind: 'bool' }, byte: { kind: 'byte' }, string: { kind: 'string' },
    pubkey: { kind: 'pubkey' }, sig: { kind: 'sig' }, datasig: { kind: 'datasig' },
    fb: n => ({ kind: 'fixed_bytes', len: n }),
    arr: (item, n) => ({ kind: 'fixed_array', item, len: n }),
    dyn: item => ({ kind: 'dynamic_array', item }),
    rec: name => ({ kind: 'struct', name }),
};

// 6.1 Hash function: BLAKE3, 32 bytes, unkeyed and keyed (Key32 = key || 00^(32-len))
{
    const key32 = Buffer.concat([Buffer.from('KCC-1'), Buffer.alloc(27)]);
    t('6.1 unkeyed, empty input', hex(blake3(Buffer.alloc(0))), 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262');
    t('6.1 unkeyed, "KCC-1"', hex(blake3(Buffer.from('KCC-1'))), '4573a3e94e92dee5d41e7ba2c77d6f70a54829760d21c11ca25705374aa7f777');
    t('6.1 keyed (key "KCC-1"), empty input', hex(blake3(Buffer.alloc(0), { key: key32 })), 'e98d9a91064b431e242efd29780956e5736812bdb4cd6f2a7e388e80bb61f3fb');
}

// 6.2 Canonical type names
{
    const rows = [[T.int, 'int'], [T.bool, 'bool'], [T.byte, 'byte'], [T.string, 'string'], [T.pubkey, 'pubkey'],
        [T.sig, 'sig'], [T.datasig, 'datasig'], [T.fb(32), 'byte[32]'], [T.arr(T.bool, 3), 'bool[3]'],
        [T.dyn(T.int), 'int[]'], [T.rec('Transfer'), 'Transfer']];
    for (const [ty, want] of rows) t('6.2 TypeName ' + want, typeName(ty), want);
}

// 6.3 Data pushes
{
    const rows = [
        ['empty', Buffer.alloc(0), '00', '00'],
        ['01', Buffer.from('01', 'hex'), '51', '0101'],
        ['10', Buffer.from('10', 'hex'), '60', '0110'],
        ['81', Buffer.from('81', 'hex'), '4f', '0181'],
        ['11', Buffer.from('11', 'hex'), '0111', '0111'],
    ];
    for (const [n, p, m, e] of rows) {
        t('6.3 PushMinimal ' + n, minimal(p), m);
        t('6.3 PushExplicit ' + n, explicit(p), e);
    }
    const big = [[75, '4b'], [76, '4c4c'], [255, '4cff'], [256, '4d0001'], [65535, '4dffff'], [65536, '4e00000100']];
    for (const [n, pre] of big) {
        const p = rep(0xab, n);
        const want = pre + hex(p);
        t('6.3 PushMinimal ab^' + n, minimal(p), want);
        t('6.3 PushExplicit ab^' + n, explicit(p), want);
    }
}

// 6.4 Scalar encodings (standalone argument / state payload)
{
    t('6.4 int 17 argument', minimal(serializeScriptNum(17n)), '0111');
    t('6.4 int 17 state payload', hex(serializeScriptNumFixed8(17n)), '1100000000000000');
    t('6.4 int -5 argument', minimal(serializeScriptNum(-5n)), '0185');
    t('6.4 int -5 state payload', hex(serializeScriptNumFixed8(-5n)), '0500000000000080');
    const view = (params) => ({ entry: () => ({ params, tag: Buffer.from('00000000', 'hex') }), resolveStruct: () => null, bytecode: Buffer.from('51', 'hex') });
    const arg = (type, value) => hex(buildSigScript(view([{ name: 'x', type }]), 'e', [value])).slice(0, -10); // strip 04<tag>
    t('6.4 bool false argument', arg(T.bool, false), '00');
    t('6.4 bool true argument', arg(T.bool, true), '51');
    t('6.4 byte 01 argument', arg(T.byte, 1), '51');
    t('6.4 string Kaspa argument', arg(T.string, 'Kaspa'), '054b61737061');
    const st = (type, value) => hex(encodeState({ fields: [{ name: 'x', type }] }, { x: value }));
    t('6.4 bool false state', st(T.bool, false), '0100');
    t('6.4 bool true state', st(T.bool, true), '0101');
    // 6.4 string state payload is intentionally absent: sillyscript encodes fixed-width state only (see KCC-CONFORMANCE.md, gap G1)
}

// 6.5 Composite encodings
{
    const records = {
        Pair: { fields: [{ name: 'count', type: T.int }, { name: 'enabled', type: T.bool }] },
        Point: { fields: [{ name: 'id', type: T.fb(2) }, { name: 'enabled', type: T.bool }] },
    };
    const view = (params) => ({ entry: () => ({ params, tag: Buffer.from('00000000', 'hex') }), resolveStruct: n => records[n], bytecode: Buffer.from('51', 'hex') });
    const arg = (type, value) => hex(buildSigScript(view([{ name: 'x', type }]), 'e', [value])).slice(0, -10);
    t('6.5 bool[3] (f,t,t)', arg(T.arr(T.bool, 3), [false, true, true]), '03000101');
    t('6.5 bool[] (f,t)', arg(T.dyn(T.bool), [false, true]), '020001');
    t('6.5 record Pair(17,true) lowering', arg(T.rec('Pair'), { count: 17n, enabled: true }), '011151');
    t('6.5 Point[] field grouping', arg(T.dyn(T.rec('Point')), [
        { id: Buffer.from('aabb', 'hex'), enabled: true }, { id: Buffer.from('ccdd', 'hex'), enabled: false }]), '04aabbccdd020100');
}

// 6.6 Dispatch tags
{
    t('6.6 step(int,byte[4],bool,byte)', hex(dispatchTag('step', [T.int, T.fb(4), T.bool, T.byte], () => null)), '2c49ed65');
    const recs = { CoffeeOrder: { fields: [{ name: 'recipe_code', type: T.fb(4) }, { name: 'sugar_level', type: T.byte }, { name: 'with_milk', type: T.bool }] } };
    t('6.6 dispense({byte[4],byte,bool}[])', hex(dispatchTag('dispense', [T.dyn(T.rec('CoffeeOrder'))], n => recs[n])), '676b1a86');
}

// 6.7 P2SH envelope (R = 51, step invocation)
{
    const R = Buffer.from('51', 'hex');
    t('6.7 scriptPublicKey.script', hex(p2shSpk(R)), 'aa20ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d87');
    const view = { entry: () => ({ params: [{ name: 'a', type: T.int }, { name: 'b', type: T.fb(4) }, { name: 'c', type: T.bool }, { name: 'd', type: T.byte }], tag: Buffer.from('2c49ed65', 'hex') }), resolveStruct: () => null, bytecode: R };
    t('6.7 signature_script', hex(buildCompleteSigScript(view, 'step', [17n, Buffer.from('01020304', 'hex'), true, 1], R)), '011104010203045151042c49ed650151');
}

// 6.8 State encoding
{
    const fields = [{ name: 'key', type: T.pubkey }, { name: 'counter', type: T.int }, { name: 'enabled', type: T.bool }];
    t('6.8 44-byte encoded state', hex(encodeState({ fields }, { key: rep(7, 32), counter: -5n, enabled: true })),
        '2007070707070707070707070707070707070707070707070707070707070707070805000000000000800101');
}

// 6.9 Template hashes
{
    const rows = [['', '', 'e572dff82304700b856a555ac3a4558d0df3646a3727816500270a93c66aac1e'],
        ['61', '6263', '405e183e2494cdbe2df89349cc0ffa5b77fb885ad97a1d5660ecd0692ef8142a'],
        ['6162', '63', 'a0968c014f3fc7bd1a7d9a8d1ad1177eb379bd2f05e56309eb4e20347c5e7eba'],
        ['00ff', '100080', '6616a66757315de0221cb2acba729113cebde31f8d3ca7fa93878a0584b96905']];
    for (const [p, s, want] of rows)
        t('6.9 template hash prefix=' + (p || 'empty') + ' suffix=' + (s || 'empty'), hex(templateHash(Buffer.from(p, 'hex'), Buffer.from(s, 'hex'))), want);
}

// 6.10 Template views over R = 5102aabb010102ccdd75 (state.start=1, state.len=8)
{
    const R = Buffer.from('5102aabb010102ccdd75', 'hex');
    const views = [[1, 5, '2e2c28131760a1c0942842f8b54fe686321d0080f5161fa803e27af6a15799a4'],
        [4, 5, '0eb10580bcb608ab9efab6e256d4bac6671d724a72951a058d37b42fa205c1ee'],
        [4, 2, '7b96ebb8023373bfe7aa81f7db8e0e0d9ce492d2b0382fb5586ac60beea8ed12']];
    for (const [start, len, want] of views)
        t('6.10 view start=' + start + ' len=' + len, hex(templateHash(R.subarray(0, start), R.subarray(start + len))), want);
}

// 6.11 Continuation program: view b, true -> false
{
    const view = { fields: [{ name: 'b', type: T.bool }], prefix: Buffer.from('5102aabb', 'hex'), suffix: Buffer.from('02ccdd75', 'hex') };
    const Rn = buildRedeem(view, { b: false });
    t('6.11 R_next', hex(Rn), '5102aabb010002ccdd75');
    t('6.11 next scriptPublicKey.script', hex(p2shSpk(Rn)), 'aa20964c61dd43eec7b7565229a15df15e1d8e9afbbedcc019eaa1eda7b86d9831ac87');
}

console.log('\n' + (fail ? fail + ' FAIL, ' + pass + ' pass' : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
