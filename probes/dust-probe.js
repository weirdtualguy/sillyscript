// probes/dust-probe.js - TN10 only. One P2PK self-send of --amount sompi (+ >=1 KAS change).
// Evidence for pins 4.9 (storage mass, 2026-10-11). Default: dry run (prints, sends nothing).
// --go broadcasts ONE amount per run; wait for confirmation before the next. Writes no record.
// Run from a directory holding the wallet .env (PC_NET, PC_PRIV), never from the repo:
//   cd ~/lifecycle-test2 && node ~/sillyscript/probes/dust-probe.js --amount 1950000 [--go]
const fs = require('fs');
const { schnorr } = require('@noble/curves/secp256k1');
const {
  KaspaRestProvider, KaspaWrpcProvider, buildTx, signP2PKInput, p2pkSpk, p2pkAddress, pickUtxosSafe, txFee,
} = require('../index');

function loadEnv() {
  const env = {};
  if (!fs.existsSync('.env')) return env;
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

function loadKeys(env, net) {
  const PC_PRIV = env.PC_PRIV;
  if (!PC_PRIV || PC_PRIV.length !== 64 || !/^[0-9a-fA-F]+$/.test(PC_PRIV)) {
    console.error('ERROR: PC_PRIV must be set in ./.env (64 hex chars).');
    process.exit(1);
  }
  const privKey = Buffer.from(PC_PRIV, 'hex');
  const pubKey = Buffer.from(schnorr.getPublicKey(privKey));
  const address = p2pkAddress(net === 'mainnet' ? 'kaspa' : 'kaspatest', pubKey);
  return { privKey, pubKey, address };
}

const args = process.argv.slice(2);
const ai = args.indexOf('--amount');
const go = args.includes('--go');
if (ai < 0 || !/^[0-9]+$/.test(args[ai + 1] || '')) {
  console.error('usage: node dust-probe.js --amount <sompi> [--go]');
  process.exit(1);
}
const AMOUNT = BigInt(args[ai + 1]);
const FEE = 3100000n;
const KEEP = 100000000n;   // change stays >= 1 KAS (size already accepted on-chain)

async function main() {
  const env = loadEnv();
  const net = env.PC_NET || 'testnet';
  if (net !== 'testnet') { console.error('REFUSED: testnet only (PC_NET=' + net + ')'); process.exit(1); }
  const { privKey, pubKey, address } = loadKeys(env, net);
  const rest = new KaspaRestProvider(net);
  const spk = p2pkSpk(pubKey).toString('hex');

  const { selected, totalInput } = await pickUtxosSafe(address, AMOUNT + FEE + KEEP, { provider: rest });
  if (totalInput < AMOUNT + FEE + KEEP) {
    console.error('Insufficient: need ' + (AMOUNT + FEE + KEEP) + ', have ' + totalInput);
    process.exit(1);
  }
  const change = totalInput - AMOUNT - FEE;
  const inputs = selected.map(u => ({
    txId: u.txId, index: u.index, amount: u.amount, spk,
    sequence: 0n, sigOpCount: 0, computeBudget: 10,
  }));
  const outputs = [{ amount: AMOUNT, script: spk }, { amount: change, script: spk }];
  const tx = buildTx(inputs, outputs);
  const fee = txFee(tx);
  if (fee !== FEE) { console.error('FATAL: fee ' + fee + ' != ' + FEE); process.exit(1); }
  for (let i = 0; i < inputs.length; i++) signP2PKInput(tx, i, privKey);

  console.log('network:  ' + net);
  console.log('address:  ' + address);
  console.log('inputs:   ' + inputs.length + ' (' + totalInput + ' sompi)');
  console.log('probe:    out[0] = ' + AMOUNT + ' sompi (P2PK, self)');
  console.log('change:   out[1] = ' + change + ' sompi');
  console.log('fee:      ' + fee + ' sompi');
  if (!go) { console.log('\nDRY RUN - nothing sent. Add --go to broadcast.'); return; }

  console.log('\nBroadcasting...');
  let result;
  try {
    result = await new KaspaWrpcProvider(net).broadcast(tx);
  } catch (e) {
    console.log('RESULT: REJECTED (thrown)');
    console.log('MESSAGE: ' + e.message);
    console.log('Classify layer (consensus vs mempool policy) from this text before concluding.');
    return;
  }
  if (!result || !result.txId) {
    console.log('RESULT: REJECTED');
    console.log('MESSAGE: ' + JSON.stringify(result));
    console.log('Classify layer (consensus vs mempool policy) from this text before concluding.');
    return;
  }
  console.log('RESULT: ACCEPTED txId ' + result.txId);
  try {
    const conf = await rest.waitForConfirmation(result.txId, { timeout: 120000 });
    console.log('CONFIRMED block ' + conf.blockHash + ' accepted=' + conf.isAccepted);
  } catch (e) {
    console.log('Confirmation wait failed: ' + e.message + ' (check txId on explorer before next probe)');
  }
}
main().catch(e => { console.error('PROBE FAILED: ' + e.message); process.exit(1); });
