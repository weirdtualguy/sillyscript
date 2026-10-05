// validate-mainnet.js — verify covenant ID + sighash against mainnet genesis
// Handles api.kaspa.org flattened snake_case format

const { covenantId } = require('../kaspa-crypto');
const { kaspaSighashV1 } = require('../kaspa-sighash');

const GENESIS_TXID = 'f6ebb717e04384770a833e87c8c7b5c3b8ff57adf4c1cda0f6c1aa097af2dc55';
const EXPECTED_COV_ID = '63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb';
const WALLET_PUBKEY = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const REST = 'https://api.kaspa.org';

async function fetchTx(txid) {
    const res = await fetch(`${REST}/transactions/${txid}`);
    if (!res.ok) throw new Error(`REST ${res.status} for ${txid}`);
    return res.json();
}

async function main() {
    console.log('=== Fetching mainnet genesis tx:', GENESIS_TXID.slice(0, 16) + '...');
    const tx = await fetchTx(GENESIS_TXID);

    // ── Test 1: Covenant ID ──
    console.log('\n── Covenant ID validation ──');
    console.log('  expected:', EXPECTED_COV_ID);

    // Output 0 is the covenant carrier (confirmed by debug output)
    const out0 = tx.outputs[0];
    const script = out0.script_public_key;  // 35 bytes: aa20<hash>87
    const value = BigInt(out0.amount);
    const outputIndex = out0.index;  // 0
    console.log('  output 0: value=' + value + ' script len=' + (script.length / 2));

    // Input 0's previous outpoint (flattened fields)
    const inp0 = tx.inputs[0];
    const prevTxId = inp0.previous_outpoint_hash;
    const prevIndex = parseInt(inp0.previous_outpoint_index);  // it's a STRING "0"
    console.log('  auth input: prevTxId=' + prevTxId.slice(0, 16) + '... index=' + prevIndex);

    // Try both txid byte orders
    const txidAsIs = Buffer.from(prevTxId, 'hex');
    const txidReversed = Buffer.from(prevTxId, 'hex').reverse();

    const outData = [{
        index: outputIndex,
        value: value,
        scriptVersion: 0,
        script: Buffer.from(script, 'hex')
    }];

    const covAsIs = covenantId(txidAsIs, prevIndex, outData).toString('hex');
    const covRev = covenantId(txidReversed, prevIndex, outData).toString('hex');

    console.log('  computed (txid as-is):    ', covAsIs);
    console.log('  computed (txid reversed): ', covRev);
    const asIsMatch = covAsIs === EXPECTED_COV_ID;
    const revMatch = covRev === EXPECTED_COV_ID;
    console.log('  as-is match:  ', asIsMatch ? '*** PASS ***' : 'no');
    console.log('  reversed match:', revMatch ? '*** PASS ***' : 'no');

    // ── Test 2: Sighash + signature verification ──
    console.log('\n── Sighash verification ──');

    // Fetch the previous tx to get the UTXO data
    console.log('  fetching prev tx for UTXO data...');
    const prevTx = await fetchTx(prevTxId);
    const prevOut = prevTx.outputs[prevIndex];
    const utxoScript = prevOut.script_public_key;
    const utxoAmount = BigInt(prevOut.amount);
    console.log('  UTXO: amount=' + utxoAmount + ' script len=' + (utxoScript.length / 2));

    // Build sighash inputs/outputs using the ACTUAL field names
    const inputs = tx.inputs.map(inp => ({
        txId: inp.previous_outpoint_hash,
        index: parseInt(inp.previous_outpoint_index),
        sequence: inp.sequence || 0,
        spk: '',
        amount: 0n,
    }));
    // Fill in the signing input's UTXO data
    inputs[0].spk = utxoScript;
    inputs[0].amount = utxoAmount;

    // Build outputs — covenant binding on output 0
    const outputs = tx.outputs.map((out, i) => ({
        amount: BigInt(out.amount),
        scriptPublicKey: out.script_public_key,
        ...(i === 0 ? { covenant: { authorizingInput: 0, covenantId: EXPECTED_COV_ID } } : {}),
    }));

    // Compute sighash
    const sighash = kaspaSighashV1(inputs, outputs, 0);
    console.log('  sighash:', sighash.toString('hex'));

    // Extract and verify the signature
    const sigScriptHex = tx.inputs[0].signature_script;
    if (sigScriptHex) {
        const sigScript = Buffer.from(sigScriptHex, 'hex');
        console.log('  sigscript length:', sigScript.length, 'bytes');

        if (sigScript.length === 66 && sigScript[0] === 0x41) {
            const sig64 = sigScript.subarray(1, 65);
            const hashType = sigScript[65];
            console.log('  sig (schnorr 64B):', sig64.toString('hex').slice(0, 24) + '...');
            console.log('  hashType:', hashType);

            try {
                const { schnorr } = require('@noble/secp256k1');
                const pubkey = Buffer.from(WALLET_PUBKEY, 'hex');
                const valid = schnorr.verify(sig64, sighash, pubkey);
                console.log('  schnorr verify:', valid ? '*** PASS ***' : '*** FAIL ***');
                if (!valid) {
                    console.log('  note: noble/secp256k1 schnorr uses SHA-256 for the challenge;');
                    console.log('  Kaspa may use BLAKE2b — if FAIL, the sig scheme differs');
                }
            } catch (e) {
                console.log('  schnorr verify error:', e.message);
            }
        } else {
            console.log('  unexpected sigscript format, length:', sigScript.length);
        }
    } else {
        console.log('  no signature_script in REST response');
    }

    console.log('\nDone.');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
