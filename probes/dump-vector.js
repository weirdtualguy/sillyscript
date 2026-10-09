// dump-vector.js — freeze a chain-verified mainnet genesis into a fixture for the offline gate (needs network).
// Usage: node probes/dump-vector.js > test-vectors/x.json.tmp && mv test-vectors/x.json.tmp test-vectors/x.json
// stdout gets the fixture ONLY if the covenant ID recomputes AND the on-chain signature verifies.
const { kaspaSighashV1 } = require('../kaspa-sighash');
const { covenantId, extractPubkeyFromP2PK } = require('../kaspa-crypto');
const { schnorr } = require('@noble/curves/secp256k1');

const TXID = process.argv[2] || 'f6ebb717e04384770a833e87c8c7b5c3b8ff57adf4c1cda0f6c1aa097af2dc55';
const COV_ID = process.argv[3] || '63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb';
const REST = process.env.REST || 'https://api.kaspa.org';
const log = (...a) => console.error(...a);

async function fetchTx(id) {
  const res = await fetch(REST + '/transactions/' + id);
  if (res.ok === false) throw new Error('REST ' + res.status + ' for ' + id);
  return res.json();
}

(async () => {
  const tx = await fetchTx(TXID);
  const inp0 = tx.inputs[0];
  const prevIndex = parseInt(inp0.previous_outpoint_index, 10);
  const out0 = tx.outputs[0];
  const outData = [{ index: out0.index, value: BigInt(out0.amount), scriptVersion: 0, script: Buffer.from(out0.script_public_key, 'hex') }];
  const computedCov = covenantId(Buffer.from(inp0.previous_outpoint_hash, 'hex'), prevIndex, outData).toString('hex');
  if (computedCov !== COV_ID) throw new Error('covenant id mismatch: computed ' + computedCov);
  log('covenant id recomputes:', computedCov);

  const prevTx = await fetchTx(inp0.previous_outpoint_hash);
  const prevOut = prevTx.outputs[prevIndex];
  const inputs = tx.inputs.map(inp => ({
    txId: inp.previous_outpoint_hash, index: parseInt(inp.previous_outpoint_index, 10),
    sequence: BigInt(inp.sequence || 0), spk: '', amount: 0n,
  }));
  inputs[0].spk = prevOut.script_public_key;
  inputs[0].amount = BigInt(prevOut.amount);
  const outputs = tx.outputs.map((out, i) => ({
    amount: BigInt(out.amount), scriptPublicKey: out.script_public_key,
    ...(i === 0 ? { covenant: { authorizingInput: 0, covenantId: COV_ID } } : {}),
  }));
  const sighash = kaspaSighashV1(inputs, outputs, 0);

  const sigScript = Buffer.from(inp0.signature_script, 'hex');
  if (sigScript.length !== 66 || sigScript[0] !== 0x41) throw new Error('unexpected sigscript, length ' + sigScript.length);
  const sig64 = sigScript.subarray(1, 65);
  const pubkey = extractPubkeyFromP2PK(Buffer.from(prevOut.script_public_key, 'hex'));
  if (schnorr.verify(sig64, sighash, pubkey) === false) throw new Error('on-chain signature does not verify against the recomputed sighash');
  log('sighash verifies the on-chain signature:', sighash.toString('hex'));

  console.log(JSON.stringify({
    name: 'mainnet-genesis-' + TXID.slice(0, 8), network: 'mainnet', txid: TXID,
    sighashHex: sighash.toString('hex'), signatureHex: sig64.toString('hex'),
    pubkeyHex: Buffer.from(pubkey).toString('hex'), hashType: sigScript[65],
    covenant: {
      expectedId: COV_ID, authPrevTxId: inp0.previous_outpoint_hash, authPrevIndex: prevIndex,
      outputs: outData.map(o => ({ index: o.index, value: String(o.value), script: o.script.toString('hex') })),
    },
    inputs: inputs.map(i => ({ txId: i.txId, index: i.index, sequence: String(i.sequence), spk: i.spk, amount: String(i.amount) })),
    outputs: outputs.map(o => ({ amount: String(o.amount), scriptPublicKey: o.scriptPublicKey, covenant: o.covenant || null })),
  }, null, 2));
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
