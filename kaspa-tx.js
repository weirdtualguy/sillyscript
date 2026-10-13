// kaspa-tx.js — Transaction builder, signer, and submitter (sillyscript)
//
// The vertical: ABI -> encoder -> crypto -> sighash -> THIS -> chain.

const { schnorr } = require('@noble/curves/secp256k1');
const { kaspaSighashV1 } = require('./kaspa-sighash');
const { covenantId, p2shSpk, p2pkSpk } = require('./kaspa-crypto');
const { buildCompleteSigScript } = require('./sil-encoder');

// Script formats owned by kaspa-crypto.js (single source of truth)

const { KaspaRestProvider, NETWORKS, toRestFormat, FEE_REGEX } = require('./provider');

let defaultProvider = null;
function getDefaultProvider() {
    if (!defaultProvider) defaultProvider = new KaspaRestProvider('mainnet');
    return defaultProvider;
}
function setDefaultProvider(p) {
    defaultProvider = p;
}
function resolveProvider(opts = {}) {
    if (opts.provider) return opts.provider;
    if (opts.rest) return new KaspaRestProvider(opts.rest, { network: opts.network });
    return getDefaultProvider();
}

// FEE_REGEX: single definition in provider.js (audit S20)
const RELAY_FLOOR_RATE = 100; // sompi per gram
const GRAMS_PER_COMPUTE_BUDGET_UNIT = 100;
const SEQUENCE_DISABLE = 0x8000000000000000n; // Bit 63 disables sequence locks

function estimateMass(tx) {
    let sizeBytes = 0;
    for (const inp of tx.inputs || []) {
        sizeBytes += 36 + 8 + ((inp.sigScript || '').length / 2) + 8 + 8 + 1 + 2;
    }
    for (const out of tx.outputs || []) {
        sizeBytes += 8 + 2 + ((out.script || out.scriptPublicKey || '').length / 2) + 32 + 8;
    }
    const computeBudgetMass = (tx.inputs || []).reduce((sum, inp) => {
        const budget = Number(inp.computeBudget || 0);
        return budget > 0 ? sum + budget : sum;
    }, 0) * GRAMS_PER_COMPUTE_BUDGET_UNIT;
    return sizeBytes * 2 + computeBudgetMass;
}

// Storage mass (KIP-9 family). [PIN] TN10 dust probe 2026-10-11: node-reported masses 985104 and
// 511443 match this formula exactly for two 1 KAS inputs; limit 500000 as quoted by the node.
// [PIN] TN10 2026-10-12, unequal inputs: 2in/2out node mass 915851 = sum(floor(C/in)) (harmonic);
// 2in/3out 1085254 and 3in/2out 1401735 = n*floor(C/floor(sum(in)/n)) (mean). Harmonic only for 2in/2out;
// every other shape uses the mean form (never below the harmonic form, so unverified shapes over-estimate).
// [PIN] TN10 2026-10-12: a covenant-bound output weighs 4x (floor(4C/amount)) and forces the mean form (2in/2out:
// 5699243 at 700000, 4429408 at 900000). Plain P2SH outputs are value-only. Covenant carriers carry covenant: null before binding.
// [TODO-verify] consensus vs mempool layer of the limit; 1-output multi-input and larger shapes.
const STORAGE_MASS_C = 1000000000000n;
const STORAGE_MASS_LIMIT = 500000n;
const STORAGE_MASS_COV_WEIGHT = 4n;
function storageMass(inputs, outputs) {
    if (!inputs || !outputs || inputs.length === 0 || outputs.length === 0)
        throw new Error('storageMass: need at least one input and one output');
    let outTerm = 0n, sumIn = 0n, inHarm = 0n, hasCov = false;
    for (const o of outputs) {
        if (typeof o.amount !== 'bigint' || o.amount <= 0n) throw new Error('storageMass: output amount must be a positive BigInt');
        const isCov = o.covenant !== undefined;   // covenant: null marks a carrier before binding
        if (isCov) hasCov = true;
        outTerm += (isCov ? STORAGE_MASS_COV_WEIGHT * STORAGE_MASS_C : STORAGE_MASS_C) / o.amount;
    }
    for (const i of inputs) {
        if (typeof i.amount !== 'bigint' || i.amount <= 0n) throw new Error('storageMass: input amount must be a positive BigInt');
        sumIn += i.amount;
        inHarm += STORAGE_MASS_C / i.amount;
    }
    const n = BigInt(inputs.length);
    const inTerm = (inputs.length === 2 && outputs.length === 2 && !hasCov) ? inHarm : n * (STORAGE_MASS_C / (sumIn / n));
    const m = outTerm - inTerm;
    return m > 0n ? m : 0n;
}

function proactiveFee(tx) {
    return BigInt(Math.ceil(estimateMass(tx) * RELAY_FLOOR_RATE));
}

async function fetchUtxos(address, opts = {}) {
    const p = resolveProvider(opts);
    return p.getUtxos(address, opts);
}

async function pickUtxo(address, opts = {}) {
    const minAmount = opts.minAmount || 0n;
    const utxos = await fetchUtxos(address, opts);
    const eligible = utxos.filter(u => u.amount >= minAmount && !u.isCoinbase);
    if (eligible.length === 0)
        throw new Error(`No eligible UTXO for ${address} (min ${minAmount}, ${utxos.length} total)`);
    return eligible[0];
}

// Multi-UTXO selection with DAA-score ordering [PIN F-05: oldest first avoids
// orphan-window rejections]. Accumulates until target + fee buffer met.
// Returns { selected: [...], totalInput: bigint }.
async function pickUtxosSafe(address, targetAmount, opts = {}) {
    const feeBuffer = opts.feeBuffer || 3000000n;
    const target = BigInt(targetAmount) + BigInt(feeBuffer);
    const utxos = await fetchUtxos(address, opts);
    const eligible = utxos
        .filter(u => !u.isCoinbase && u.amount > 0n)
        .sort((a, b) => a.daaScore - b.daaScore);

    let total = 0n;
    const selected = [];
    for (const u of eligible) {
        selected.push(u);
        total += u.amount;
        if (total >= target) break;
    }

    if (total < target) {
        throw new Error(
            'pickUtxosSafe: insufficient funds. Need ' + target + ' sompi ' +
            '(incl. ' + feeBuffer + ' fee buffer), have ' + total +
            ' from ' + eligible.length + ' UTXOs for ' + address
        );
    }

    return { selected, totalInput: total };
}

function buildTx(inputs, outputs, { lockTime = 0 } = {}) {
    for (const inp of inputs) {
        if (inp.computeBudget === undefined) {
            const isP2SH = inp.spk.startsWith('aa20');
            inp.computeBudget = isP2SH ? 60 : 10;
        }
        if (inp.sequence === undefined) inp.sequence = 0n;
        if (inp.sigOpCount === undefined) inp.sigOpCount = 0;
    }
    for (let di = 0; di < outputs.length; di++) {
        if (outputs[di].amount <= 0n) {
            console.warn('buildTx WARNING: output[' + di + '] = ' + outputs[di].amount + ' sompi is not positive');
        }
    }
    if (inputs.every(i => typeof i.amount === 'bigint' && i.amount > 0n) && outputs.every(o => typeof o.amount === 'bigint' && o.amount > 0n)) {
        const sm = storageMass(inputs, outputs);
        if (sm > STORAGE_MASS_LIMIT)
            console.warn('buildTx WARNING: storage mass ' + sm + ' exceeds the ' + STORAGE_MASS_LIMIT + ' limit; the node rejects this tx (probe 2026-10-11)');
    }
    const totalIn = inputs.reduce((s, i) => s + i.amount, 0n);
    const totalOut = outputs.reduce((s, o) => s + o.amount, 0n);
    return { version: 1, lockTime, inputs, outputs, _totalIn: totalIn, _totalOut: totalOut, _fee: totalIn - totalOut };
}

const txFee = tx =>
    tx.inputs.reduce((s, i) => s + i.amount, 0n) -
    tx.outputs.reduce((s, o) => s + o.amount, 0n);

// Signatures commit to the covenant binding: binding after signing silently invalidates them (audit S21)
function assertUnsigned(tx, what) {
    if (tx.inputs.some(i => i.sigScript !== undefined && i.sigScript !== null && i.sigScript !== ''))
        throw new Error(what + ': inputs are already signed; bind covenants before signing');
}

function setGenesisCovenant(tx, outputIndex, authInputIndex) {
    const out = tx.outputs[outputIndex];
    const authInput = tx.inputs[authInputIndex];
    if (out === undefined) throw new Error('setGenesisCovenant: no output ' + outputIndex);
    if (authInput === undefined) throw new Error('setGenesisCovenant: no input ' + authInputIndex);
    assertUnsigned(tx, 'setGenesisCovenant');
    tx.outputs.forEach((o, i) => {
        if (i !== outputIndex && o.covenant && o.covenant.authorizingInput === authInputIndex)
            throw new Error('setGenesisCovenant: output ' + i + ' is already bound to input ' + authInputIndex +
                '; a multi-output genesis needs the group ID over all outputs, which this helper does not compute');
    });
    const covId = covenantId(
        Buffer.from(authInput.txId, 'hex'),
        authInput.index,
        [{ index: outputIndex, value: out.amount, scriptVersion: 0, script: Buffer.from(out.script, 'hex') }]
    );
    out.covenant = { authorizingInput: authInputIndex, covenantId: covId.toString('hex') };
    return out.covenant.covenantId;
}

function setContinuationCovenant(tx, outputIndex, authInputIndex, covenantIdHex) {
    if (tx.outputs[outputIndex] === undefined) throw new Error('setContinuationCovenant: no output ' + outputIndex);
    if (tx.inputs[authInputIndex] === undefined) throw new Error('setContinuationCovenant: no input ' + authInputIndex);
    if (typeof covenantIdHex !== 'string' || /^[0-9a-fA-F]{64}$/.test(covenantIdHex) === false)
        throw new Error('setContinuationCovenant: covenantId must be 64 hex chars');
    assertUnsigned(tx, 'setContinuationCovenant');
    tx.outputs[outputIndex].covenant = { authorizingInput: authInputIndex, covenantId: covenantIdHex };
}

function buildSighashData(tx) {
    return {
        inputs: tx.inputs.map(i => ({
            txId: i.txId, index: i.index, sequence: i.sequence,
            spk: i.spk, amount: i.amount,
        })),
        outputs: tx.outputs.map(o => ({
            amount: o.amount, scriptPublicKey: o.script,
            ...(o.covenant ? { covenant: o.covenant } : {}),
        })),
    };
}

function signP2PKInput(tx, inputIndex, privKey) {
    const { inputs, outputs } = buildSighashData(tx);
    const hash = kaspaSighashV1(inputs, outputs, inputIndex);
    const sig = schnorr.sign(hash, privKey);
    tx.inputs[inputIndex].sigScript = '41' + Buffer.from(sig).toString('hex') + '01';
    return tx;
}

function signCovenantInput(tx, inputIndex, privKey, contractView, entryName, args, redeemScript) {
    const redeem = Buffer.isBuffer(redeemScript) ? redeemScript : Buffer.from(redeemScript, 'hex');
    // F1 gate (audit S15): the redeem must be this contract's template AND hash to the spk being spent
    contractView.verifyRedeem(redeem);
    const spent = tx.inputs[inputIndex] && tx.inputs[inputIndex].spk;
    if (String(spent).toLowerCase() !== p2shSpk(redeem).toString('hex'))
        throw new Error('signCovenantInput: input ' + inputIndex + ' spk does not match the P2SH script of the supplied redeem script (wrong contract state?)');
    const entry = contractView.entry(entryName);
    const sigParamIdxs = entry.params.map((p, i) => p.type.kind === 'sig' ? i : -1).filter(i => i >= 0);

    if (sigParamIdxs.length > 1) {
        throw new Error(
            'signCovenantInput: entry has ' + sigParamIdxs.length + ' sig params (positions ' +
            sigParamIdxs.join(', ') + '). Multi-sig entries need manual signing: sign each ' +
            'param with its own key, then pass the completed args array.'
        );
    }

    if (sigParamIdxs.length === 1) {
        const sigParamIdx = sigParamIdxs[0];
        const { inputs, outputs } = buildSighashData(tx);
        const hash = kaspaSighashV1(inputs, outputs, inputIndex);
        const sig = Buffer.from(schnorr.sign(hash, privKey));
        // sig params are 65 bytes: 64-byte schnorr + 1-byte hash type (SIGHASH_ALL = 0x01)
        const sig65 = Buffer.concat([sig, Buffer.from([0x01])]);
        const newArgs = [...args];
        newArgs[sigParamIdx] = sig65;
        tx.inputs[inputIndex].sigScript = buildCompleteSigScript(contractView, entryName, newArgs, redeem).toString('hex');
    } else {
        tx.inputs[inputIndex].sigScript = buildCompleteSigScript(contractView, entryName, args, redeem).toString('hex');
    }
    return tx;
}

// toRestFormat is owned by provider.js (converts BigInt sequence correctly)

async function submitTx(tx, opts = {}) {
    const p = resolveProvider(opts);
    return p.broadcast(tx, opts);
}

async function submitWithFeeDiscovery(buildFn, submitOpts = {}, discoveryOpts = {}) {
    const p = resolveProvider(submitOpts);
    const combinedOpts = Object.assign({}, discoveryOpts, { allowOrphan: submitOpts.allowOrphan });
    return p.submitWithFeeDiscovery(buildFn, combinedOpts);
}

async function waitForConfirmation(txId, opts = {}) {
    const p = resolveProvider(opts);
    return p.waitForConfirmation(txId, opts);
}

async function signSubmitWait(buildFn, opts = {}) {
    const { rest, allowOrphan = false, confirmTimeout = 60000, feeOpts = {} } = opts;
    const { txId, fee } = await submitWithFeeDiscovery(buildFn, { rest, allowOrphan }, feeOpts);
    const confirmation = await waitForConfirmation(txId, { rest, timeout: confirmTimeout });
    return { txId, fee, ...confirmation };
}

const p2pkOutput = (amount, pubkey32) =>
    ({ amount, script: p2pkSpk(pubkey32).toString('hex') });

const p2shOutput = (amount, redeemScript) =>
    ({ amount, script: p2shSpk(redeemScript).toString('hex') });

const covenantOutput = (amount, redeemScript) =>
    ({ amount, script: p2shSpk(redeemScript).toString('hex') });


module.exports = {
    NETWORKS, fetchUtxos, pickUtxo, pickUtxosSafe,
    buildTx, txFee,
    setGenesisCovenant, setContinuationCovenant,
    signP2PKInput, signCovenantInput,
    toRestFormat, submitTx, submitWithFeeDiscovery,
    waitForConfirmation, signSubmitWait,
    p2pkOutput, p2shOutput, covenantOutput, p2pkSpk, p2shSpk,
    FEE_REGEX, SEQUENCE_DISABLE, estimateMass, proactiveFee, RELAY_FLOOR_RATE, storageMass, STORAGE_MASS_LIMIT,
    getDefaultProvider, setDefaultProvider, resolveProvider,
};

if (require.main === module && process.argv.includes('--test')) {
    let pass = 0, fail = 0;
    const t = (label, cond, detail) => {
        if (cond) pass++; else fail++;
        console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
    };

    // Transaction building
    {
        const inputs = [{ txId: 'ab'.repeat(32), index: 0, amount: 1000000000n, spk: '20' + '33'.repeat(32) + 'ac' }];
        const outputs = [
            { amount: 900000000n, script: 'aa20' + '11'.repeat(32) + '87' },
            { amount: 99000000n, script: '20' + '44'.repeat(32) + 'ac' },
        ];
        const tx = buildTx(inputs, outputs);
        t('buildTx fee = 1M sompi', txFee(tx) === 1000000n, `fee=${txFee(tx)}`);
        t('P2PK computeBudget = 10', inputs[0].computeBudget === 10);
        t('sigOpCount = 0', inputs[0].sigOpCount === 0);
        t('sequence = 0n', inputs[0].sequence === 0n);
    }
    {
        const inputs = [{ txId: 'cd'.repeat(32), index: 0, amount: 100000000n, spk: 'aa20' + '22'.repeat(32) + '87' }];
        const outputs = [{ amount: 99000000n, script: 'aa20' + '33'.repeat(32) + '87' }];
        buildTx(inputs, outputs);
        t('P2SH computeBudget = 60', inputs[0].computeBudget === 60);
    }
    // REST format
    {
        const inputs = [{
            txId: 'ef'.repeat(32), index: 0, amount: 1000000000n,
            spk: '20' + '55'.repeat(32) + 'ac',
            sigScript: '41' + 'aa'.repeat(65) + '01',
        }];
        const outputs = [{
            amount: 100000000n, script: 'aa20' + '66'.repeat(32) + '87',
            covenant: { authorizingInput: 0, covenantId: '77'.repeat(32) },
        }];
        const tx = buildTx(inputs, outputs);
        const rest = toRestFormat(tx);
        t('REST version = 1', rest.transaction.version === 1);
        t('REST amount is string', typeof rest.transaction.outputs[0].amount === 'string');
        t('REST spk is object', typeof rest.transaction.outputs[0].scriptPublicKey === 'object');
        t('REST spk version = 0', rest.transaction.outputs[0].scriptPublicKey.version === 0);
        t('REST covenant present', !!rest.transaction.outputs[0].covenant);
        t('REST sigOpCount = 0', rest.transaction.inputs[0].sigOpCount === 0);
        t('REST computeBudget present', rest.transaction.inputs[0].computeBudget !== undefined);
        t('REST allowOrphan = false', rest.allowOrphan === false);
        t('REST subnetworkId = 40 zeros', rest.transaction.subnetworkId === '0'.repeat(40));
    }
    // Fee regex
    {
        const m1 = 'Transaction rejected: required fee of 4490000 sompi'.match(FEE_REGEX);
        t('fee regex extracts', m1 && m1[1] === '4490000');
        t('FEE_REGEX is the provider regex (single source)', FEE_REGEX === require('./provider').FEE_REGEX);
        t('fee regex rejects non-fee', !'some other error'.match(FEE_REGEX));
    }
    // P2PK sign + verify round-trip
    {
        const privKey = Buffer.alloc(32, 7);
        const pubKey = Buffer.from(schnorr.getPublicKey(privKey));
        const inputs = [{ txId: '12'.repeat(32), index: 0, amount: 1000000000n, spk: p2pkSpk(pubKey).toString('hex') }];
        const outputs = [{ amount: 999000000n, script: p2pkSpk(Buffer.alloc(32, 9)).toString('hex') }];
        const tx = buildTx(inputs, outputs);
        signP2PKInput(tx, 0, privKey);
        const sigScript = Buffer.from(tx.inputs[0].sigScript, 'hex');
        t('sigScript len = 66', sigScript.length === 66, `len=${sigScript.length}`);
        t('sigScript[0] = 0x41', sigScript[0] === 0x41);
        t('sigScript[65] = 0x01', sigScript[65] === 0x01);
        const sig64 = sigScript.subarray(1, 65);
        const { inputs: shIn, outputs: shOut } = buildSighashData(tx);
        const hash = kaspaSighashV1(shIn, shOut, 0);
        t('P2PK sign-verify round-trip', schnorr.verify(sig64, hash, pubKey));
    }
    // Covenant ID determinism
    {
        const mk = () => buildTx(
            [{ txId: '34'.repeat(32), index: 0, amount: 1000000000n, spk: '20' + '56'.repeat(32) + 'ac' }],
            [{ amount: 100000000n, script: 'aa20' + '78'.repeat(32) + '87' }]
        );
        const tx1 = mk(), tx2 = mk();
        const c1 = setGenesisCovenant(tx1, 0, 0);
        const c2 = setGenesisCovenant(tx2, 0, 0);
        t('covenant ID deterministic', c1 === c2);
        t('covenant ID 64 hex chars', c1.length === 64);
        t('covenant binding set', tx1.outputs[0].covenant !== undefined);

        // Guards (audit S21)
        const thr = f => { try { f(); return null; } catch (e) { return e.message; } };
        t('genesis: missing output rejected', /no output/.test(thr(() => setGenesisCovenant(mk(), 5, 0))));
        t('genesis: missing input rejected', /no input/.test(thr(() => setGenesisCovenant(mk(), 0, 3))));
        const two = () => buildTx(
            [{ txId: '34'.repeat(32), index: 0, amount: 1000000000n, spk: '20' + '56'.repeat(32) + 'ac' }],
            [{ amount: 100000000n, script: 'aa20' + '78'.repeat(32) + '87' }, { amount: 100000000n, script: 'aa20' + '79'.repeat(32) + '87' }]
        );
        const txT = two(); setGenesisCovenant(txT, 0, 0);
        t('genesis: second output on the same input refused', /multi-output/.test(thr(() => setGenesisCovenant(txT, 1, 0))));
        const txS = mk(); txS.inputs[0].sigScript = '00';
        t('genesis: binding after signing refused', /already signed/.test(thr(() => setGenesisCovenant(txS, 0, 0))));
        t('continuation: binding after signing refused', /already signed/.test(thr(() => setContinuationCovenant(txS, 0, 0, c1))));
        t('continuation: malformed covenant id refused', /64 hex/.test(thr(() => setContinuationCovenant(mk(), 0, 0, 'ab'.repeat(31)))));
        const txC = mk(); setContinuationCovenant(txC, 0, 0, c1);
        t('continuation: valid id binds', txC.outputs[0].covenant.covenantId === c1 && txC.outputs[0].covenant.authorizingInput === 0);
    }
    // Script helpers
    {
        const out1 = p2pkOutput(1000000n, Buffer.alloc(32, 0x42));
        t('p2pkOutput script = 34B', out1.script.length === 68);
        const out2 = p2shOutput(1000000n, Buffer.alloc(100, 0xaa));
        t('p2shOutput script = 35B', out2.script.length === 70);
    }

    // Fee rail: the 5 KAS hard limit in every scaffold template (audit S10)
    {
        const fs = require('fs'), path = require('path');
        for (const f of ['deploy', 'interact', 'close']) {
            const src = fs.readFileSync(path.join(__dirname, 'bin', 'templates', f + '.js.txt'), 'utf8');
            t('fee hard limit = 5 KAS (' + f + ')', src.includes('actualFee > ' + (5n * 100000000n) + 'n') && src.includes('50000000000n') === false);
        }
    }

    // Mass & Sequence primitives
    {
        t('SEQUENCE_DISABLE bit 63 set', (SEQUENCE_DISABLE & (1n << 63n)) !== 0n);
        {
            // Storage mass: chain-anchored (TN10 dust probe 2026-10-11, two 1 KAS inputs)
            const mIn = [{ amount: 100000000n }, { amount: 100000000n }];
            const mOut = (a, c) => [{ amount: a }, { amount: c }];
            t('storage mass 1000000 probe = 985104 (node-reported)', storageMass(mIn, mOut(1000000n, 195900000n)) === 985104n);
            t('storage mass 1900000 probe = 511443 (node-reported)', storageMass(mIn, mOut(1900000n, 195000000n)) === 511443n);
            t('storage mass 1950000 probe within limit (node accepted)', storageMass(mIn, mOut(1950000n, 194950000n)) <= STORAGE_MASS_LIMIT);
            t('storage mass 1900000 probe over limit (node rejected)', storageMass(mIn, mOut(1900000n, 195000000n)) > STORAGE_MASS_LIMIT);
            let thr = false;
            try { storageMass(mIn, mOut(0n, 195000000n)); } catch (e) { thr = /storageMass/.test(e.message); }
            t('storage mass rejects a zero output', thr);
            const uIn = [{ amount: 1950000n }, { amount: 195510000n }];
            t('storage mass 2in/2out unequal = 915851 (node-reported)', storageMass(uIn, mOut(700000n, 191760000n)) === 915851n);
            t('storage mass 3in/2out unequal = 1401735 (node-reported)', storageMass([{ amount: 1950000n }, { amount: 99900000n }, { amount: 195510000n }], mOut(700000n, 291660000n)) === 1401735n);
            t('storage mass covenant 700000 = 5699243 (node-reported)', storageMass(uIn, [{ amount: 700000n, covenant: null }, { amount: 191760000n }]) === 5699243n);
            t('storage mass covenant 900000 = 4429408 (node-reported)', storageMass(uIn, [{ amount: 900000n, covenant: null }, { amount: 191560000n }]) === 4429408n);
            t('storage mass covenant: bound object weighs the same as null', storageMass(uIn, [{ amount: 700000n, covenant: { authorizingInput: 0, covenantId: '77'.repeat(32) } }, { amount: 191760000n }]) === 5699243n);
            t('storage mass 2in/3out unequal = 1085254 (node-reported)', storageMass(uIn, [{ amount: 1000000n }, { amount: 10000000n }, { amount: 181460000n }]) === 1085254n);
        }
        const tx = {
            inputs: [{ sigScript: '00', computeBudget: 10 }],
            outputs: [{ script: 'aa20' + '00'.repeat(32) + '87' }],
        };
        const mass = estimateMass(tx);
        const fee = proactiveFee(tx);
        t('estimateMass positive', mass > 0);
        t('proactiveFee positive', fee > 0n);
        t('mass includes compute budget', mass >= 1000);
    }

    console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
    process.exit(fail ? 1 : 0);
}
