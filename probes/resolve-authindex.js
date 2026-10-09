// probes/resolve-authindex.js v2 — settle §3.2 authIndex semantics against chain truth.
//
// v1 found testnet retrieval lacks covenant_authorizing_input. v2 therefore:
//   1. DUMPS raw schema first (pins §10.7 — match reality, never guess)
//   2. BRUTE-FORCES every input under BOTH interpretations:
//        A: authIndex = input's PREVIOUS OUTPOINT index (setGenesisCovenant, validate-mainnet,
//           handoff Step 5, "authorizing outpoint")   ← code-decisive favorite
//        B: authIndex = input's POSITION in the genesis tx (pins §3.2 wording, trap #6 prose)
//      The tx's OWN on-chain covenant_id judges. Unique match = verdict.
//   3. Emits a pinned, chain-verified vector for the genesis-verify unit tests (incident #12).
//
// Usage: node probes/resolve-authindex.js [txid ...]

const { covenantId } = require('../kaspa-crypto');
const { KaspaRestProvider } = require('../provider');

const DEFAULT_GENESISES = [
  'bd4085b147152238bb7a0d49273e1eaee9cfcea223dd090b5fad7bdf68db6491',
  '60579a71260a6b893bbc376af4625b585299e2e5286072aad476a0527db774bc',
];

(async () => {
  const txids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_GENESISES;
  const provider = new KaspaRestProvider(process.env.PC_NET || 'testnet'); // PC_NET=mainnet for mainnet txids
  const hops = {}; // continuation tracing: txid -> hops from the first requested tx

  for (const txid of txids) {
    console.log('\n=== genesis', txid);
    const tx = await provider.getTransaction(txid);
    if (!tx) { console.log('  NOT FOUND (404)'); continue; }

    // ── 1. Raw schema dump (always prints, even if analysis below throws) ──
    const outs = tx.outputs || [], ins = tx.inputs || [];
    console.log('  output keys:', Object.keys(outs[0] || {}).join(', '));
    console.log('  input  keys:', Object.keys(ins[0] || {}).join(', '));
    console.log('  sample output:', JSON.stringify(outs[0]));
    console.log('  sample input :', JSON.stringify(ins[0]));

    try {
      // ── 2. Covenant group ──
      const group = outs
        .filter(o => o.covenant_id !== undefined && o.covenant_id !== null)
        .map(o => ({
          index: parseInt(o.index, 10),
          value: BigInt(o.amount),
          scriptVersion: 0,
          script: Buffer.from(o.script_public_key, 'hex'),
          covenant_id: o.covenant_id,
          covenant_authorizing_input: o.covenant_authorizing_input,
        }))
        .sort((a, b) => a.index - b.index);
      if (group.length === 0) { console.log('  no covenant_id on any output'); continue; }
      const contIn = ins.filter(x => x.covenant_id !== undefined && x.covenant_id !== null);
      if (contIn.length > 0) {
        const parent = contIn[0].previous_outpoint_hash;
        hops[parent] = (hops[txid] || 0) + 1;
        if (parent && hops[parent] <= 200 && txids.indexOf(parent) < 0) {
          console.log('  CONTINUATION: tracing parent ' + parent + ' (hop ' + hops[parent] + ')');
          txids.push(parent);
        } else console.log('  CONTINUATION: not tracing further');
        continue;
      }

      const rawId = group[0].covenant_id;
      if (typeof rawId !== 'string') { console.log('  covenant_id not a flat string:', rawId); continue; }
      const onChainId = rawId.toLowerCase();
      console.log('  on-chain covenant_id        :', onChainId);
      console.log('  covenant_authorizing_input  :', group[0].covenant_authorizing_input);

      // ── 3. Brute-force every input under A and B ──
      const outData = group.map(({ index, value, scriptVersion, script }) =>
        ({ index, value, scriptVersion, script }));
      console.log('  inputs:', ins.length);
      const aMatch = [], bMatch = [];
      for (let i = 0; i < ins.length; i++) {
        const prevHashHex = ins[i].previous_outpoint_hash;
        if (typeof prevHashHex !== 'string' || prevHashHex.length !== 64) {
          console.log('  input ' + i + ': unexpected previous_outpoint_hash'); continue;
        }
        const prevIndex = parseInt(ins[i].previous_outpoint_index, 10); // STRING per §4.1
        const prevHash = Buffer.from(prevHashHex, 'hex');               // AS-IS, never reversed
        const idA = covenantId(prevHash, prevIndex, outData).toString('hex');
        const idB = covenantId(prevHash, i, outData).toString('hex');
        const hits = [];
        if (idA === onChainId) { aMatch.push(i); hits.push('A(prevIdx=' + prevIndex + ')'); }
        if (idB === onChainId) { bMatch.push(i); hits.push('B(inputPos=' + i + ')'); }
        console.log('  input ' + i + ': prevIdx=' + prevIndex +
          (prevIndex === i ? ' (degenerate)' : '') +
          (hits.length ? '   *** MATCH: ' + hits.join(', ') : ''));
      }

      if (aMatch.length === 1 && bMatch.length === 0)
        console.log('  VERDICT: A (previous outpoint index) — unique match, input', aMatch[0]);
      else if (bMatch.length === 1 && aMatch.length === 0)
        console.log('  VERDICT: B (input position) — unique match, input', bMatch[0]);
      else if (aMatch.length === 0 && bMatch.length === 0)
        console.log('  VERDICT: NEITHER — preimage/group assumption wrong beyond authIndex');
      else
        console.log('  VERDICT: AMBIGUOUS — A:', aMatch, 'B:', bMatch);

      if (group[0].covenant_authorizing_input !== undefined && group[0].covenant_authorizing_input !== null && aMatch.length === 1)
        console.log('  chain field vs brute force: ' + (parseInt(group[0].covenant_authorizing_input, 10) === aMatch[0] ? 'AGREE' : '*** DISAGREE ***'));

      // ── 4. Pinned chain-verified vector (for genesis-verify unit tests) ──
      const authPos = (group[0].covenant_authorizing_input !== undefined && group[0].covenant_authorizing_input !== null)
        ? parseInt(group[0].covenant_authorizing_input, 10)
        : (aMatch.length === 1 ? aMatch[0] : (bMatch.length === 1 ? bMatch[0] : null));
      if (authPos !== null && ins[authPos]) {
        console.log('  vector:', JSON.stringify({
          txid, onChainId, authInputPos: authPos,
          prevOutpointHash: ins[authPos].previous_outpoint_hash,
          prevOutpointIndex: parseInt(ins[authPos].previous_outpoint_index, 10),
          outputs: outData.map(o => ({ index: o.index, value: o.value.toString(),
            script: o.script.toString('hex') })),
        }));
      }
    } catch (e) {
      console.log('  analysis error:', e.message, '— schema dump above is ground truth');
    }
  }
  console.log('\nDone.');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });