// genesis-verify.js — Verify a .sil source / compiled artifact matches an on-chain covenant.
//
// Answers one question: does this readable source, compiled and state-initialized,
// produce the script and covenant ID that the chain says it does? The verdict's
// covenant ID is read FROM THE CHAIN (the genesis tx's own covenant_id field),
// never from the publisher's claim.
//
// Composition only — zero new crypto, zero new encoding (Bible 0.1):
//   loadArtifact (via Contract) — fail-closed artifact gate (sil-abi.js)
//   Contract.nextScriptPubKey   — state-layer check (sil-encoder, pins 2.3)
//   contract.scriptPubKey       — expected genesis spk (p2shSpk, 35B, no version prefix)
//   covenantId (kaspa-crypto)   — KIP-20 preimage, mainnet-validated
//   KaspaRestProvider           — raw REST JSON retrieval (provider.js)
//
// Covenant ID preimage (pins 3.2, EMPIRICALLY CONFIRMED on two DISCRIMINATING
// testnet-10 vectors, probes/resolve-authindex.js, 2026-10-07):
//   authTxid  = authorizing input's PREVIOUS OUTPOINT txid, hex-decoded AS-IS
//   authIndex = authorizing input's PREVIOUS OUTPOINT index (u32le) — NOT the
//               input's position; the POSITION is the binding field
//               covenant_authorizing_input, used only to LOCATE the input
//   then u64le(count) + per output: u32le(tx index) + u64le(value) + u16le(0)
//   + u64le(len) + raw script bytes (35B P2SH, no version prefix)
//
// Layers (first failure wins):
//   state     — initialState contradicts the artifact's baked genesis state
//               (pins 1.7: ctor args bake at compile, bytecode IS the genesis
//               redeem; 2.3 canonicality makes the comparison exact). Chain-independent.
//   script    — artifact's baked spk differs from the deployed group's spk(s).
//   consensus — ID recomputed from (authorizing outpoint, DEPLOYED outputs)
//               differs from the tx's own covenant_id. Amounts are not
//               source-derivable, so this layer runs over the chain's outputs —
//               that is what keeps script and consensus separable.
//
// Fail-closed (Bible 0.2): structural problems THROW; comparison failures
// RETURN { verified: false, layer, ... } with detail.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Contract } = require('./contract');
const { KaspaRestProvider, MockProvider } = require('./provider');
const { covenantId } = require('./kaspa-crypto');
const { compile } = require('./silly-compile');

// Chain-verified test vectors (testnet-10, probes/resolve-authindex.js, 2026-10-07;
// incident 12: chain values, never self-output). Both DISCRIMINATE the authIndex
// semantics: authInputPos=0, prevOutpointIndex=2. Both geneses carry the SAME
// output script but DIFFERENT covenant IDs (different authorizing outpoints).
const PINNED_VECTORS = [
    {
        txid: 'bd4085b147152238bb7a0d49273e1eaee9cfcea223dd090b5fad7bdf68db6491',
        onChainId: 'b324dc5b823a425a2c54e475b44de3620451be16d9179e6c89255c27e3f71912',
        authInputPos: 0,
        prevOutpointHash: 'b4d8aed6e2250c78401932aad7eb453d8ed3350b97ca826c9e6fa29ca4869cf4',
        prevOutpointIndex: 2,
        outputs: [{ index: 0, value: '100000000',
            script: 'aa2089c2bdd88645cc4c1505bb8a4122ba00a855a4a538852bc011facbf9fa55811387' }],
    },
    {
        txid: '60579a71260a6b893bbc376af4625b585299e2e5286072aad476a0527db774bc',
        onChainId: '230551a6c0e73fb2f91af0270a40baa656f015157c30b9d256831887b5b7730a',
        authInputPos: 0,
        prevOutpointHash: '6a7b7bcd203d7928956e90d06057f00a4b81d84260dbedb2daa194d02ce220fa',
        prevOutpointIndex: 2,
        outputs: [{ index: 0, value: '100000000',
            script: 'aa2089c2bdd88645cc4c1505bb8a4122ba00a855a4a538852bc011facbf9fa55811387' }],
    },
];

const normHex = s => String(s).toLowerCase();

function hexBuf(s, what) {
    if (typeof s !== 'string' || s.length === 0 || s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s))
        throw new Error(`verifyGenesis: ${what} is not a non-empty hex string`);
    return Buffer.from(s, 'hex');
}

const fmtState = s => (s === null || s === undefined) ? '(none)'
    : '{ ' + Object.entries(s).map(([k, v]) =>
        `${k}: ${typeof v === 'bigint' ? v.toString() + 'n' : JSON.stringify(v)}`).join(', ') + ' }';

// Covenant group extraction (pins 4.1 retrieval schema).
function extractCovenantGroup(tx, targetIdHex) {
    const cov = (tx.outputs || []).filter(o => o.covenant_id !== undefined && o.covenant_id !== null);
    if (cov.length === 0)
        throw new Error('verifyGenesis: no covenant outputs in tx (covenant_id absent on every output) — not a covenant genesis, or retrieval schema drift (pins 4.1)');

    let selected, targetId;
    if (targetIdHex) {
        targetId = normHex(targetIdHex);
        selected = cov.filter(o => normHex(o.covenant_id) === targetId);
        if (selected.length === 0) {
            const present = [...new Set(cov.map(o => normHex(o.covenant_id)))].join(', ');
            throw new Error(`verifyGenesis: covenant ID ${targetId} not present in tx — present: [${present}] (wrong genesis tx, or wrong covenant ID)`);
        }
    } else {
        const ids = [...new Set(cov.map(o => normHex(o.covenant_id)))];
        if (ids.length > 1)
            throw new Error(`verifyGenesis: tx carries multiple covenant groups [${ids.join(', ')}] — pass covenantIdHex to select one`);
        selected = cov;
        targetId = ids[0];
    }

    const outputs = selected
        .map(o => ({
            index: parseInt(o.index, 10),            // NUMBER observed; parseInt safe for both
            value: BigInt(o.amount),                 // NUMBER (testnet) or STRING (mainnet) — BigInt handles both
            script: hexBuf(o.script_public_key, 'output script_public_key'),
        }))
        .sort((a, b) => a.index - b.index);          // preimage is tx-index ordered

    const authVals = [...new Set(selected
        .map(o => o.covenant_authorizing_input)
        .filter(v => v !== undefined && v !== null)
        .map(v => parseInt(v, 10)))];
    if (authVals.length > 1)
        throw new Error(`verifyGenesis: covenant group outputs disagree on covenant_authorizing_input [${authVals.join(', ')}] — ambiguous retrieval, failing closed`);
    const authInputPos = (authVals.length === 1 && Number.isInteger(authVals[0])) ? authVals[0] : null;

    return { outputs, covenantId: targetId, authInputPos };
}

// Consensus recomputation for one candidate input.
function computeCovenantIdForInput(tx, outData, pos) {
    const inp = (tx.inputs || [])[pos];
    if (typeof inp !== 'object' || inp === null || typeof inp.previous_outpoint_hash !== 'string' || inp.previous_outpoint_hash.length !== 64)
        throw new Error(`verifyGenesis: input ${pos} has no valid previous_outpoint_hash`);
    if (inp.previous_outpoint_index === undefined || inp.previous_outpoint_index === null)
        throw new Error(`verifyGenesis: input ${pos} has no previous_outpoint_index`);
    const prevIndex = parseInt(inp.previous_outpoint_index, 10); // STRING (4.1 + observed)
    if (!Number.isInteger(prevIndex))
        throw new Error(`verifyGenesis: input ${pos} has an unparseable previous_outpoint_index`);
    return {
        authInputPos: pos,
        outpoint: { txid: inp.previous_outpoint_hash, index: prevIndex },
        id: covenantId(
            hexBuf(inp.previous_outpoint_hash, 'previous_outpoint_hash'), // AS-IS, never reversed
            prevIndex,
            outData,
        ).toString('hex'),
    };
}

// Consensus layer: recompute from DEPLOYED outputs + authorizing outpoint, compare
// to the tx's OWN covenant_id. Primary: the binding field locates the input.
// Fallback (field absent — schema drift): brute-force inputs; exactly one must match.
function consensusCheck(tx, group) {
    const outData = group.outputs.map(o =>
        ({ index: o.index, value: o.value, scriptVersion: 0, script: o.script }));
    const chainId = group.covenantId;

    if (group.authInputPos !== null) {
        const r = computeCovenantIdForInput(tx, outData, group.authInputPos);
        const ok = r.id === chainId;
        return { ...r, chainId, ok, viaField: true, reason: ok ? null
            : "recomputed covenant ID does not match the tx's own covenant_id — preimage inputs differ (authorizing outpoint or group selection)" };
    }

    const matches = [];
    for (let i = 0; i < (tx.inputs || []).length; i++) {
        try { if (computeCovenantIdForInput(tx, outData, i).id === chainId) matches.push(i); }
        catch (e) { /* input without parseable outpoint — skip */ }
    }
    if (matches.length === 1) {
        const r = computeCovenantIdForInput(tx, outData, matches[0]);
        return { ...r, chainId, ok: true, viaField: false, reason: null };
    }
    return { authInputPos: null, outpoint: null, id: null, chainId, ok: false, viaField: false,
        reason: matches.length === 0
            ? 'no input reproduces the on-chain covenant_id — tx inconsistent with the 3.2 preimage, or retrieval data corrupt'
            : 'multiple inputs reproduce the covenant_id — ambiguous, failing closed' };
}

// Report builder (handoff step-7 format).
function buildMessage(r) {
    const L = [];
    if (r.verified) {
        L.push('✅ GENESIS VERIFIED');
        L.push(`   Contract:        ${r.contractName} (${r.network})`);
        L.push(`   Address:         ${r.contractAddress}`);
        L.push(`   Genesis tx:      ${r.genesisTxId}`);
        if (r.authorizingOutpoint)
            L.push(`   Authorizing:     input ${r.authorizingInput} spending ${r.authorizingOutpoint.txid.slice(0, 16)}...:${r.authorizingOutpoint.index}`);
        if (r.stateCheck)
            L.push(`   Initial state:   ${r.stateCheck.provided} (matches baked genesis state)`);
        L.push(`   Expected script: ${r.expectedScript.slice(0, 16)}...`);
        L.push(`   On-chain script: ${r.onChainScript.slice(0, 16)}...  (MATCH)`);
        L.push(`   Expected ID:     ${r.expectedCovenantId}`);
        L.push(`   On-chain ID:     ${r.onChainCovenantId}  (MATCH - read from the chain tx, never the publisher's claim)`);
    } else {
        L.push('❌ GENESIS VERIFICATION FAILED');
        L.push(`   Layer: ${r.layer}`);
        if (r.layer === 'state' && r.stateCheck) {
            L.push(`   Provided state:  ${r.stateCheck.provided}`);
            L.push(`   Baked state:     ${r.stateCheck.baked}`);
            L.push(`   Reason: ${r.stateCheck.reason}`);
        } else if (r.layer === 'script') {
            L.push(`   Expected script: ${r.expectedScript}`);
            for (const o of r.groupOutputs)
                L.push(`   Output ${o.index}: ${o.script}${o.scriptMatch ? '  (match)' : '  (MISMATCH)'}`);
            L.push('   The source/state does not produce the on-chain script. Possible causes:');
            L.push('   wrong source file, wrong constructor args, or different compiler revision.');
        } else {
            L.push(`   Computed ID:     ${r.expectedCovenantId}`);
            L.push(`   On-chain ID:     ${r.onChainCovenantId}`);
            if (r.consensusReason) L.push(`   Reason: ${r.consensusReason}`);
        }
    }
    return L.join('\n');
}

// Main. See header for layer semantics.
async function verifyGenesis(opts = {}) {
    const {
        sourcePath, artifactPath, initialState, constructorArgs,
        covenantIdHex, network = 'testnet', genesisTxId, contractName,
    } = opts;
    const provider = opts.provider || new KaspaRestProvider(network);

    const hasSource = sourcePath !== undefined && sourcePath !== null;
    const hasArtifact = artifactPath !== undefined && artifactPath !== null;
    if (hasSource === hasArtifact)
        throw new Error('verifyGenesis: pass exactly one of sourcePath or artifactPath');
    if (typeof genesisTxId !== 'string' || genesisTxId.length === 0)
        throw new Error('verifyGenesis: genesisTxId is required (UTXO-lookup path not implemented yet — pass the creating tx of the covenant output)');

    // 1. Resolve the artifact. Source path: compile via silly-compile (deploy.js.txt
    //    call shape: raw positional values; returns the loaded artifact object, but
    //    it also writes outputPath — we use our tmp path either way).
    //    Both branches run the Contract ctor -> loadArtifact fail-closed gate.
    let artifactPathFinal = artifactPath;
    let tmpArtifact = null;
    if (hasSource) {
        tmpArtifact = path.join(os.tmpdir(), `silly-verify-${process.pid}-${Date.now()}.json`);
        let out;
        try { out = await compile(sourcePath, constructorArgs || [], tmpArtifact); }
        catch (e) { try { fs.unlinkSync(tmpArtifact); } catch (e2) {} throw e; }  // verify-fail leaves the file silverc wrote
        artifactPathFinal = (typeof out === 'string' && out.length) ? out : tmpArtifact;
    }
    let contract;
    try {
        contract = new Contract(artifactPathFinal, { provider, ...(contractName ? { contractName } : {}) });
    } finally {
        if (tmpArtifact) { try { fs.unlinkSync(tmpArtifact); } catch (e) {} }
    }

    // 2. Expected script: the artifact's baked genesis redeem (pins 1.7).
    const expectedSpk = contract.scriptPubKey; // Buffer, 35B, no version prefix

    // 3. State layer (chain-independent).
    let stateCheck = null;
    if (initialState !== undefined && initialState !== null) {
        const fieldNames = contract.fields.map(f => f.name);
        const unknown = Object.keys(initialState).filter(k => fieldNames.indexOf(k) < 0);
        let ok = false, reason = null;
        if (unknown.length) {
            reason = `unknown state field(s) [${unknown.join(', ')}] — this artifact's state fields: [${fieldNames.join(', ')}]`;
        } else {
            try {
                ok = contract.nextScriptPubKey(initialState).equals(expectedSpk);
                if (ok === false) reason = `initialState ${fmtState(initialState)} does not reproduce the artifact's baked genesis state ${fmtState(contract.state)} — wrong initial state, or artifact compiled with different constructor args`;
            } catch (e) {
                reason = 'state encoding rejected the given values: ' + e.message;
            }
        }
        stateCheck = { provided: fmtState(initialState), baked: fmtState(contract.state), ok, reason };
    }

    // 4. Fetch the genesis tx from chain (fail-closed).
    const tx = await provider.getTransaction(genesisTxId);
    if (tx === null || tx === undefined)
        throw new Error(`verifyGenesis: genesis tx ${genesisTxId} not found (provider returned null) on ${network}`);
    if (tx.transaction_id && normHex(tx.transaction_id) !== normHex(genesisTxId))
        throw new Error('verifyGenesis: provider returned a different transaction than requested');

    // 5. Covenant group + the INDEPENDENT chain covenant ID.
    const group = extractCovenantGroup(tx, covenantIdHex);

    // 6. Consensus layer.
    const cons = consensusCheck(tx, group);

    // 7. Script layer: every group output must carry the expected spk.
    const groupDetail = group.outputs.map(o => ({
        index: o.index, value: o.value.toString(), script: o.script.toString('hex'),
        scriptMatch: o.script.equals(expectedSpk),
    }));
    const scriptOk = groupDetail.length > 0 && groupDetail.every(o => o.scriptMatch);

    // 8. Verdict — first failing layer wins; 'consensus' means all layers passed.
    const stateOk = stateCheck === null || stateCheck.ok;
    const verified = stateOk && scriptOk && cons.ok;
    const layer = (stateOk === false) ? 'state' : (scriptOk === false ? 'script' : 'consensus');

    const result = {
        verified,
        layer,
        genesisTxId, network,
        contractName: contract.name, contractAddress: contract.address,
        expectedScript: expectedSpk.toString('hex'),
        onChainScript: groupDetail.length ? groupDetail[0].script : null,
        expectedCovenantId: cons.id,
        onChainCovenantId: group.covenantId, // read from the chain tx — never the caller's claim
        authorizingInput: cons.authInputPos,
        authorizingOutpoint: cons.outpoint,
        groupOutputs: groupDetail,
        stateCheck,
        consensusViaBindingField: cons.viaField,
        consensusReason: cons.reason,
    };
    result.message = buildMessage(result);
    return result;
}

module.exports = { verifyGenesis, PINNED_VECTORS };

// ─────────────────────────────────────────────────────────────────────────────
// SELF-TEST: node genesis-verify.js --test
// Incident 12 rule: every positive consensus assertion is CHAIN-VERIFIED (the
// pinned vectors above), never the module's own output.
// ─────────────────────────────────────────────────────────────────────────────
if (require.main === module && process.argv.includes('--test')) {
    let pass = 0, fail = 0;
    const t = (label, cond, detail) => {
        if (cond) pass++; else fail++;
        console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
    };

    (async () => {
        // Chain-verified consensus vectors.
        for (const v of PINNED_VECTORS) {
            const outData = v.outputs.map(o => ({
                index: o.index, value: BigInt(o.value), scriptVersion: 0,
                script: Buffer.from(v ? o.script : '', 'hex'),
            }));
            const id = covenantId(Buffer.from(v.prevOutpointHash, 'hex'), v.prevOutpointIndex, outData).toString('hex');
            t(`chain vector ${v.txid.slice(0, 8)}: recomputed ID matches on-chain`, id === v.onChainId, `${id} vs ${v.onChainId}`);
            const idB = covenantId(Buffer.from(v.prevOutpointHash, 'hex'), v.authInputPos, outData).toString('hex');
            t(`chain vector ${v.txid.slice(0, 8)}: input-position interpretation excluded`, idB !== v.onChainId);
        }

        // REST-shaped mock tx from the pinned vector. Field types match the observed
        // testnet retrieval: amount NUMBER, output index NUMBER,
        // covenant_authorizing_input NUMBER, previous_outpoint_index STRING.
        // Synthetic (non-chain) fields are marked inert.
        const v = PINNED_VECTORS[0];
        const restTx = {
            transaction_id: v.txid,
            inputs: [
                { index: 0, previous_outpoint_hash: v.prevOutpointHash,
                  previous_outpoint_index: String(v.prevOutpointIndex) },
                { index: 1, previous_outpoint_hash: 'ab'.repeat(32),   // synthetic, inert
                  previous_outpoint_index: '2' },
            ],
            outputs: [
                { index: 0, amount: 100000000, script_public_key: v.outputs[0].script,
                  covenant_id: v.onChainId, covenant_authorizing_input: 0 },
                { index: 1, amount: 99000000,                            // synthetic change, inert
                  script_public_key: '20' + 'cd'.repeat(32) + 'ac' },
            ],
        };
        const vesting = path.join(__dirname, 'vesting.json');

        // Script-layer isolation: vesting's baked spk is NOT the chain's Counter spk,
        // but the consensus recomputation must still hit the CHAIN ID.
        {
            const mock = new MockProvider('testnet');
            mock.transactions.set(v.txid, restTx);
            const r = await verifyGenesis({
                artifactPath: vesting, initialState: { claimed_so_far: 0n },
                covenantIdHex: v.onChainId, genesisTxId: v.txid, provider: mock,
            });
            t('vesting vs Counter genesis: fails at script layer', r.verified === false && r.layer === 'script', `layer=${r.layer}`);
            t('consensus recomputation matches chain ID through full pipeline', r.expectedCovenantId === v.onChainId, `${r.expectedCovenantId}`);
            t('on-chain ID read from tx equals chain vector', r.onChainCovenantId === v.onChainId);
            t('state layer passed (claimed_so_far 0n is vesting baked state)', r.stateCheck !== null && r.stateCheck.ok === true);
            t('authorizing input located via binding field', r.authorizingInput === 0);
        }

        // State-layer failures (chain-independent). NOTE: these omit covenantIdHex,
        // covering the single-group inference path of extractCovenantGroup.
        {
            const mock = new MockProvider('testnet');
            mock.transactions.set(v.txid, restTx);
            const r = await verifyGenesis({
                artifactPath: vesting, initialState: { claimed_so_far: 777n },
                genesisTxId: v.txid, provider: mock,
            });
            t('wrong initial state: fails at state layer', r.verified === false && r.layer === 'state', `layer=${r.layer}`);
        }
        {
            const mock = new MockProvider('testnet');
            mock.transactions.set(v.txid, restTx);
            const r = await verifyGenesis({
                artifactPath: vesting, initialState: { claimed_so_far: 0n, bogus_field: 1 },
                genesisTxId: v.txid, provider: mock,
            });
            t('unknown state field: fails at state layer', r.verified === false && r.layer === 'state');
        }

        // Brute-force fallback: binding field stripped (schema drill).
        {
            const mock = new MockProvider('testnet');
            const noField = JSON.parse(JSON.stringify(restTx));
            delete noField.outputs[0].covenant_authorizing_input;
            mock.transactions.set(v.txid, noField);
            const r = await verifyGenesis({
                artifactPath: vesting, initialState: { claimed_so_far: 0n },
                genesisTxId: v.txid, provider: mock,
            });
            t('binding field absent: brute-force locates authorizer, consensus ok',
                r.authorizingInput === 0 && r.expectedCovenantId === v.onChainId && r.consensusViaBindingField === false);
        }

        // Targeting: an ID not present in the tx throws with present IDs listed.
        {
            const mock = new MockProvider('testnet');
            mock.transactions.set(v.txid, restTx);
            let threw = false, msg = '';
            try { await verifyGenesis({ artifactPath: vesting, covenantIdHex: 'ff'.repeat(32), genesisTxId: v.txid, provider: mock }); }
            catch (e) { threw = true; msg = e.message; }
            t('unknown covenant ID throws with present-IDs detail', threw && msg.includes('not present in tx'), msg);
        }

        // Tampered group value: recomputation breaks vs the CHAIN ID.
        {
            const mock = new MockProvider('testnet');
            const tampered = JSON.parse(JSON.stringify(restTx));
            tampered.outputs[0].amount = 100000001; // 1 sompi off the pinned value
            mock.transactions.set(v.txid, tampered);
            const r = await verifyGenesis({
                artifactPath: vesting, initialState: { claimed_so_far: 0n },
                genesisTxId: v.txid, provider: mock,
            });
            t('tampered output value: consensus recomputation breaks vs chain ID',
                r.expectedCovenantId !== v.onChainId);
        }

        // Fail-closed gates.
        {
            let threw = false;
            try { await verifyGenesis({ artifactPath: vesting, genesisTxId: v.txid, provider: new MockProvider('testnet') }); }
            catch (e) { threw = true; }
            t('genesis tx not found in provider throws', threw);
        }
        {
            let threw = false, msg = '';
            try { await verifyGenesis({ artifactPath: vesting }); }
            catch (e) { threw = true; msg = e.message; }
            t('missing genesisTxId throws (Path B not implemented)', threw && msg.includes('genesisTxId is required'));
        }
        {
            let threw = false;
            try { await verifyGenesis({ artifactPath: vesting, sourcePath: 'x.sil', genesisTxId: v.txid }); }
            catch (e) { threw = true; }
            t('both sourcePath and artifactPath throws', threw);
        }

        // OPTIONAL chain-anchored positive: the Counter artifact that deployed
        // bd4085b1 (cp ~/lifecycle-test/data/counter-abi.json ./ to enable).
        {
            const counterArtifact = path.join(__dirname, 'counter-abi.json');
            if (fs.existsSync(counterArtifact)) {
                const mock = new MockProvider('testnet');
                mock.transactions.set(v.txid, restTx);
                const r = await verifyGenesis({
                    artifactPath: counterArtifact, initialState: { count: 0n },
                    covenantIdHex: v.onChainId, genesisTxId: v.txid, provider: mock,
                });
                t('Counter artifact vs pinned chain genesis: VERIFIED', r.verified === true && r.layer === 'consensus',
                    `verified=${r.verified} layer=${r.layer}`);
                t('Counter expected script equals chain script', r.expectedScript === v.outputs[0].script);
            } else {
                console.log('  (counter-abi.json not present — chain-anchored positive skipped; copy from ~/lifecycle-test/data/)');
            }
        }


        // CLI regression (pins 11/S8): the async genesis command must not fall
        // through to the help fallback. A bogus artifact path rejects BEFORE any
        // network I/O, so this is fully offline: expect exit 1 + [!] error, and
        // NO help text. Without the S8 return, help wins the race and exit is 0.
        {
            const { execFileSync } = require('child_process');
            const cli = path.join(__dirname, 'bin', 'silly.js');
            let code = 0, out = "";
            try {
                out = execFileSync(process.execPath, [cli, 'genesis', 'verify', 'no-such-artifact.json',
                    '--covenant-id', 'aa'.repeat(32), '--genesis-txid', 'bb'.repeat(32)],
                    { encoding: 'utf8' });
            } catch (e) { code = e.status; out = (e.stdout || "") + (e.stderr || ""); }
            t('CLI: bogus artifact exits 1 with error (no help fall-through)',
                code === 1 && out.includes('[!]') && out.includes('sillyscript') === false,
                'exit=' + code + ' out=' + out.slice(0, 80));
        }

        // CLI state contract (handoff: --initial-state {count:0} arrives as JSON
        // Numbers). The state layer must accept integer Numbers and match the
        // baked genesis state (pins 11/S9 regression).
        {
            const mock = new MockProvider('testnet');
            mock.transactions.set(v.txid, restTx);
            const r = await verifyGenesis({
                artifactPath: vesting, initialState: { claimed_so_far: 0 },
                covenantIdHex: v.onChainId, genesisTxId: v.txid, provider: mock,
            });
            t('JSON-Number initial state passes state layer (CLI contract)',
                r.stateCheck !== null && r.stateCheck.ok === true,
                r.stateCheck ? r.stateCheck.reason : 'no stateCheck');
        }
        console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
        process.exit(fail ? 1 : 0);
    })().catch(e => { console.error('TEST ERROR:', e.message); process.exit(1); });
}
