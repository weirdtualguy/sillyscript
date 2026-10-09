// kaspa-sighash.js — v1 transaction signing hash (kaspa-platform-kit)
//
// Direct port of the PROVEN kaspa-sighash-v1.ts (mainnet-verified).
// Structure:
//   H = keyed blake2b(key='TransactionSigningHash', dkLen=32)
//
//   Preimage field order:
//     u16le(version)                          = 1
//     H(prev_outpoints)                       = H(concat(txid[32B] + u32le(index)) per input)
//     H(sequences)                            = H(concat(u64le(sequence)) per input)
//     [sig_op_counts_hash: SKIPPED for v1]
//     txid[32B]                               = the signing input's prev txid (hex-decoded)
//     u32le(prev_index)                       = the signing input's prev outpoint index
//     u16le(script_version)                   = 0 (hardcoded — all Kaspa scripts are v0)
//     u64le(len) + script                     = the UTXO's scriptPublicKey
//     u64le(amount)                           = the UTXO's value
//     u64le(sequence)                         = the input's sequence
//     [per-input sig_op_count: SKIPPED for v1]
//     H(outputs_v1)                           = per-output: u64le(amount) + u16le(0) +
//                                               u64le(len)+script + u8(covenant_flag) +
//                                               [u16le(authInput) + 32B(covId) if covenant]
//     u64le(lockTime)                         = 0
//     20B subnetworkId                        = all zeros (native)
//     u64le(gas)                              = 0 (native)
//     32B payload_hash                        = all zeros (native, empty payload)
//     u8(hash_type)                           = 1 (SIGHASH_ALL)
//
// [PIN] txids are hex-decoded from REST as-is — NO byte reversal.
//       Proven: this exact code path signed mainnet tx f6ebb717...
// [PIN] sigOpCount and computeBudget are NOT in the v1 preimage.
// [PIN] outputs hash commits covenant bindings: u8 flag + u16 authInput + 32B id.

const { blake2b } = require('@noble/hashes/blake2b');

const SIGHASH_KEY = Buffer.from('TransactionSigningHash', 'utf8');
const ZERO32 = Buffer.alloc(32, 0);
const TX_VERSION = 1;

function H(d) {
    return Buffer.from(blake2b(
        Buffer.isBuffer(d) ? d : Buffer.from(d),
        { dkLen: 32, key: SIGHASH_KEY }
    ));
}

const u8  = v => Buffer.from([v & 0xff]);
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const varB = b => Buffer.concat([u64(b.length), b]);
// Strict: Buffer.from(str, 'hex') silently truncates at the first bad character (audit S22)
const hx = h => {
    if (h instanceof Uint8Array) return Buffer.from(h);
    const s = h || '';
    if (typeof s !== 'string' || s.length % 2 !== 0 || /^[0-9a-fA-F]*$/.test(s) === false)
        throw new Error('kaspa-sighash: invalid hex field');
    return Buffer.from(s, 'hex');
};
const hx32 = (h, what) => {
    const b = hx(h);
    if (b.length !== 32) throw new Error('kaspa-sighash: ' + what + ' must be 32 bytes, got ' + b.length);
    return b;
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-hashes
// ─────────────────────────────────────────────────────────────────────────────

const previousOutputsHash = inputs =>
    H(Buffer.concat(inputs.map(i => Buffer.concat([hx32(i.txId, 'input txId'), u32(i.index)]))));

const sequencesHash = inputs =>
    H(Buffer.concat(inputs.map(i => u64(i.sequence || 0))));

// Outputs hash with covenant bindings (v1 format)
const outputsHashV1 = outputs =>
    H(Buffer.concat(outputs.map(o => {
        const parts = [u64(o.amount), u16(0), varB(hx(o.scriptPublicKey))];
        if (o.covenant) {
            parts.push(u8(1), u16(o.covenant.authorizingInput), hx32(o.covenant.covenantId, 'covenantId'));
        } else {
            parts.push(u8(0));
        }
        return Buffer.concat(parts);
    })));

// ─────────────────────────────────────────────────────────────────────────────
// Main sighash computation
// ─────────────────────────────────────────────────────────────────────────────

// inputs: [{ txId: string(hex), index: number, sequence: number,
//            spk: string(hex), amount: bigint }]
// outputs: [{ amount: bigint, scriptPublicKey: string(hex),
//             covenant?: { authorizingInput: number, covenantId: string(hex) } }]
// inputIndex: which input is being signed
// gas: bigint (0 for native)
function kaspaSighashV1(inputs, outputs, inputIndex, gas = 0n) {
    const inp = inputs[inputIndex];
    const P = [];
    P.push(u16(TX_VERSION));
    P.push(previousOutputsHash(inputs));
    P.push(sequencesHash(inputs));
    // sig_op_counts_hash: skipped for v1 (only in v0 preimage)
    P.push(hx32(inp.txId, 'input txId'));
    P.push(u32(inp.index));
    P.push(u16(0));                    // script version of the UTXO being spent
    P.push(varB(hx(inp.spk)));
    P.push(u64(inp.amount));
    P.push(u64(inp.sequence));
    // per-input sig-op-count: skipped for v1
    P.push(outputsHashV1(outputs));
    P.push(u64(0));                    // lockTime
    P.push(Buffer.alloc(20, 0));       // subnetworkId (native = all zeros)
    P.push(u64(gas));                  // gas (native = 0)
    P.push(ZERO32);                    // payload_hash (native + empty payload)
    P.push(u8(1));                     // hash_type = SIGHASH_ALL

    return H(Buffer.concat(P));
}

module.exports = { kaspaSighashV1, outputsHashV1, previousOutputsHash, sequencesHash };

// ─────────────────────────────────────────────────────────────────────────────
// Self-test (structural — matches the TS dummy)
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module && process.argv.includes('--test')) {
    let pass = 0, fail = 0;
    const t = (label, cond, detail) => {
        if (cond) pass++; else fail++;
        console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : ''));
    };

    const dummyInputs = [{
        txId: '00'.repeat(32),
        index: 0,
        sequence: 0,
        spk: '2033fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68ac',
        amount: 100000000000n,
    }];
    const dummyOutputs = [{
        amount: 99999500000n,
        scriptPublicKey: 'aa20' + '11'.repeat(32) + '87',
    }];
    const hash = kaspaSighashV1(dummyInputs, dummyOutputs, 0);

    t('sighash length = 32', hash.length === 32);
    t('sighash deterministic',
        hash.equals(kaspaSighashV1(dummyInputs, dummyOutputs, 0)));

    // Covenant output changes the hash
    const covOutputs = [{
        amount: 99999500000n,
        scriptPublicKey: 'aa20' + '11'.repeat(32) + '87',
        covenant: { authorizingInput: 0, covenantId: 'ab'.repeat(32) },
    }];
    const hash2 = kaspaSighashV1(dummyInputs, covOutputs, 0);
    t('covenant binding changes sighash', !hash.equals(hash2));

    // Strict hex fields (audit S22)
    {
        const thr = f => { try { f(); return false; } catch (e) { return /kaspa-sighash/.test(e.message); } };
        t('rejects 63-char txId', thr(() => kaspaSighashV1([{ ...dummyInputs[0], txId: '0'.repeat(63) }], dummyOutputs, 0)));
        t('rejects non-hex txId', thr(() => kaspaSighashV1([{ ...dummyInputs[0], txId: 'zz'.repeat(32) }], dummyOutputs, 0)));
        t('rejects short covenantId', thr(() => kaspaSighashV1(dummyInputs, [{ ...covOutputs[0], covenant: { authorizingInput: 0, covenantId: 'ab'.repeat(31) } }], 0)));
        t('rejects odd-length spk hex', thr(() => kaspaSighashV1([{ ...dummyInputs[0], spk: 'abc' }], dummyOutputs, 0)));
        t('uppercase covenantId hashes identically', kaspaSighashV1(dummyInputs, [{ ...covOutputs[0], covenant: { authorizingInput: 0, covenantId: 'AB'.repeat(32) } }], 0).equals(hash2));
    }

    // Chain-anchored: the recomputed sighash must verify the ON-CHAIN signature of mainnet genesis f6ebb717 (audit S27)
    {
        const fs = require('fs'), path = require('path');
        const fp = path.join(__dirname, 'test-vectors', 'mainnet-genesis-f6ebb717.json');
        const present = fs.existsSync(fp);
        t('mainnet vector fixture present (probes/dump-vector.js writes it)', present);
        if (present) {
            const v = JSON.parse(fs.readFileSync(fp, 'utf8'));
            const { schnorr } = require('@noble/curves/secp256k1');
            const vin = v.inputs.map(i => ({ txId: i.txId, index: i.index, sequence: BigInt(i.sequence), spk: i.spk, amount: BigInt(i.amount) }));
            const vout = v.outputs.map(o => ({ amount: BigInt(o.amount), scriptPublicKey: o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) }));
            const h = kaspaSighashV1(vin, vout, 0);
            const sig = Buffer.from(v.signatureHex, 'hex'), pk = Buffer.from(v.pubkeyHex, 'hex');
            t('mainnet genesis: sighash equals the frozen value', h.toString('hex') === v.sighashHex);
            t('mainnet genesis: on-chain signature verifies', schnorr.verify(sig, h, pk));
            const bumped = vout.map((o, i) => i === 0 ? { ...o, amount: o.amount + 1n } : o);
            t('mainnet genesis: 1 sompi changes the sighash and breaks the signature', schnorr.verify(sig, kaspaSighashV1(vin, bumped, 0), pk) === false);
            t('mainnet genesis: pubkey is the one in the spent UTXO script', require('./kaspa-crypto').extractPubkeyFromP2PK(Buffer.from(vin[0].spk, 'hex')).toString('hex') === v.pubkeyHex);
        }
    }

    // Different input index changes the hash (signing different input)
    const inputs2 = [...dummyInputs, { ...dummyInputs[0], index: 1 }];
    const hash3 = kaspaSighashV1(inputs2, dummyOutputs, 1);
    t('different input → different sighash', !hash.equals(hash3));

    console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
    process.exit(fail ? 1 : 0);
}
