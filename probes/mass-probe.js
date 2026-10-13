// probes/mass-probe.js - TN10 only. Storage-mass shape probe: spends --ins (wallet UTXOs picked by exact amount) and
// creates --outs plus auto change (fee --fee, default 5000000). Prints three predicted masses (repo, node-style, harmonic).
// Evidence for pins 4.9 (2026-10-12). Dry run unless --go. Use vectors whose mass exceeds 500000: the node rejects the tx
// and reports its mass, so nothing is spent. A vector under the limit WOULD broadcast a real self-send (fee only).
// Run from a directory holding the wallet .env (PC_NET, PC_PRIV), never from the repo:
//   cd ~/lifecycle-test2 && node ~/sillyscript/probes/mass-probe.js --ins 1950000,195510000 --outs 700000 [--go]
// --p2sh-out <i>: output i (index into --outs) pays a dummy P2SH hash (UNSPENDABLE if accepted); --go is refused unless
// every predicted mass is over the limit, so the node rejects it.
// --covenant-out <i>: also binds a genesis covenant to output i (must equal --p2sh-out), as deploy does.
const fs = require('fs');
const { schnorr } = require('@noble/curves/secp256k1');
const { KaspaRestProvider, KaspaWrpcProvider, buildTx, signP2PKInput, p2pkSpk, p2pkAddress, pickUtxosSafe, txFee } = require('../index');
const C = 1000000000000n;
const args = process.argv.slice(2);
const go = args.includes('--go');
const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const die = m => { console.error(m); process.exit(1); };
const parse = s => s.split(',').map(x => /^[0-9]+$/.test(x) ? BigInt(x) : die('bad number: ' + x));
if (!opt('--ins') || !opt('--outs')) die('usage: node mass-probe.js --ins a,b --outs x[,y] [--fee n] [--go]');
const INS = parse(opt('--ins')), OUTS = parse(opt('--outs'));
const FEE = BigInt(opt('--fee') || '5000000');
const PS = opt('--p2sh-out');
if (PS !== null && (!/^[0-9]+$/.test(PS) || Number(PS) >= OUTS.length)) die('--p2sh-out must be an index into --outs');
const P2SH_IDX = PS === null ? -1 : Number(PS);
const P2SH_SPK = 'aa20' + '11'.repeat(32) + '87';
const CV = opt('--covenant-out');
if (CV !== null && (!/^[0-9]+$/.test(CV) || Number(CV) !== P2SH_IDX)) die('--covenant-out must equal --p2sh-out');
const COV_IDX = CV === null ? -1 : Number(CV);
const env = {};
for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
  const t = l.trim(), e = t.indexOf('=');
  if (!t || t[0] === '#' || e < 0) continue;
  env[t.slice(0, e).trim()] = t.slice(e + 1).trim();
}
if ((env.PC_NET || 'testnet') !== 'testnet') die('REFUSED: testnet only');
const privKey = Buffer.from(env.PC_PRIV, 'hex');
const pubKey = Buffer.from(schnorr.getPublicKey(privKey));
const address = p2pkAddress('kaspatest', pubKey);
const spk = p2pkSpk(pubKey).toString('hex');
const clamp = x => x > 0n ? x : 0n;
(async () => {
  const rest = new KaspaRestProvider('testnet');
  let all;
  try { all = await pickUtxosSafe(address, 10n ** 18n, { provider: rest }); }
  catch (e) {
    const m = /have (\d+) from/.exec(e.message); if (!m) throw e;
    all = await pickUtxosSafe(address, BigInt(m[1]) - 3000000n, { provider: rest });
  }
  const pool = all.selected.slice(), sel = [];
  for (const a of INS) {
    const k = pool.findIndex(u => u.amount === a);
    if (k < 0) die('no UTXO of ' + a);
    sel.push(pool.splice(k, 1)[0]);
  }
  const sumIn = sel.reduce((s, u) => s + u.amount, 0n);
  const change = sumIn - FEE - OUTS.reduce((s, o) => s + o, 0n);
  if (change <= 0n) die('change <= 0');
  const outAmts = OUTS.concat([change]);
  const n = BigInt(sel.length);
  const outTerm = outAmts.reduce((s, o) => s + C / o, 0n);
  console.log('shape: ' + sel.length + ' in / ' + outAmts.length + ' out; inputs ' + INS.join(',') + '; outputs ' + outAmts.join(','));
  console.log('pred arithmetic (repo):  ' + clamp(outTerm - (C * n * n) / sumIn));
  console.log('pred arithmetic (node):  ' + clamp(outTerm - n * (C / (sumIn / n))));
  console.log('pred harmonic:           ' + clamp(outTerm - sel.reduce((s, u) => s + C / u.amount, 0n)));
  if (P2SH_IDX >= 0) {
    console.log('output[' + P2SH_IDX + '] is P2SH (dummy hash): UNSPENDABLE if accepted.');
    const preds = [clamp(outTerm - (C * n * n) / sumIn), clamp(outTerm - n * (C / (sumIn / n))), clamp(outTerm - sel.reduce((s, u) => s + C / u.amount, 0n))];
    if (go && preds.some(p => p <= 500000n)) die('REFUSED: a predicted mass is within the limit; the tx could be accepted and burn the P2SH output.');
  }
  const inputs = sel.map(u => ({ txId: u.txId, index: u.index, amount: u.amount, spk, sequence: 0n, sigOpCount: 0, computeBudget: 10 }));
  const tx = buildTx(inputs, outAmts.map((a, k) => ({ amount: a, script: k === P2SH_IDX ? P2SH_SPK : spk, ...(k === COV_IDX ? { covenant: null } : {}) })));
  if (COV_IDX >= 0) {
    const sgc = require('../index').setGenesisCovenant;
    if (typeof sgc !== 'function') die('setGenesisCovenant is not exported by ../index');
    console.log('Covenant ID: ' + sgc(tx, COV_IDX, 0));
  }
  if (txFee(tx) !== FEE) die('FATAL: fee ' + txFee(tx) + ' != ' + FEE);
  for (let i = 0; i < inputs.length; i++) signP2PKInput(tx, i, privKey);
  if (!go) { console.log('DRY RUN - nothing sent.'); return; }
  console.log('Broadcasting...');
  let r;
  try { r = await new KaspaWrpcProvider('testnet').broadcast(tx); }
  catch (e) { console.log('RESULT: REJECTED (thrown)\nMESSAGE: ' + e.message); return; }
  if (!r || !r.txId) { console.log('RESULT: REJECTED\nMESSAGE: ' + JSON.stringify(r)); return; }
  console.log('RESULT: ACCEPTED txId ' + r.txId + ' (check explorer before the next probe)');
})().catch(e => { console.error('PROBE FAILED: ' + e.message); process.exit(1); });
