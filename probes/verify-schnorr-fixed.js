// verify-schnorr-fixed.js — extract pubkey from UTXO script, verify sig
const { kaspaSighashV1 } = require('../kaspa-sighash');
const { schnorr } = require('@noble/curves/secp256k1');

const GENESIS_TXID = 'f6ebb717e04384770a833e87c8c7b5c3b8ff57adf4c1cda0f6c1aa097af2dc55';
const COV_ID = '63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb';
const REST = 'https://api.kaspa.org';

async function fetchTx(txid) {
    const res = await fetch(`${REST}/transactions/${txid}`);
    if (!res.ok) throw new Error(`REST ${res.status}`);
    return res.json();
}

(async () => {
    const tx = await fetchTx(GENESIS_TXID);
    const inp0 = tx.inputs[0];
    const prevTxId = inp0.previous_outpoint_hash;
    const prevIndex = parseInt(inp0.previous_outpoint_index);
    const sigScript = Buffer.from(inp0.signature_script, 'hex');
    const sig64 = sigScript.subarray(1, 65);

    const prevTx = await fetchTx(prevTxId);
    const prevOut = prevTx.outputs[prevIndex];
    const utxoScript = prevOut.script_public_key;
    const utxoAmount = BigInt(prevOut.amount);

    // ── Extract the pubkey from the UTXO's P2PK script ──
    // P2PK script: OP_DATA_32 (0x20) + pubkey[32] + OP_CHECKSIG (0xac)
    const utxoScriptBuf = Buffer.from(utxoScript, 'hex');
    let pubkey;
    if (utxoScriptBuf.length === 34 && utxoScriptBuf[0] === 0x20 && utxoScriptBuf[33] === 0xac) {
        pubkey = utxoScriptBuf.subarray(1, 33);  // bytes 1..32
        console.log('pubkey extracted from P2PK script:', pubkey.toString('hex'));
    } else {
        console.log('UTXO script is not P2PK — length:', utxoScriptBuf.length);
        // Try the known mainnet key from HANDOFF as fallback
        pubkey = Buffer.from('25aafe02662998a62b4b4c1a887005ea8c604705c0a3cb29c3f63dfb85332f8b', 'hex');
        console.log('using known mainnet key:            ', pubkey.toString('hex'));
    }

    // Build sighash inputs/outputs
    const inputs = [{
        txId: prevTxId,
        index: prevIndex,
        sequence: 0,
        spk: utxoScript,
        amount: utxoAmount,
    }];

    const outputs = tx.outputs.map((out, i) => ({
        amount: BigInt(out.amount),
        scriptPublicKey: out.script_public_key,
        ...(i === 0 ? { covenant: { authorizingInput: 0, covenantId: COV_ID } } : {}),
    }));

    const sighash = kaspaSighashV1(inputs, outputs, 0);
    console.log('sighash:', sighash.toString('hex'));

    const valid = schnorr.verify(sig64, sighash, pubkey);
    console.log('schnorr verify:', valid ? '*** PASS ***' : '*** FAIL ***');

    if (!valid) {
        // Try without covenant binding
        const outputsNoCov = tx.outputs.map(out => ({
            amount: BigInt(out.amount),
            scriptPublicKey: out.script_public_key,
        }));
        const sighash2 = kaspaSighashV1(inputs, outputsNoCov, 0);
        const valid2 = schnorr.verify(sig64, sighash2, pubkey);
        console.log('without covenant:', valid2 ? '*** PASS ***' : 'FAIL');
    }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
