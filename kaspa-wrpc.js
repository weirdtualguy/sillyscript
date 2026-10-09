// kaspa-wrpc.js — wRPC provider for covenant transaction broadcasting
//
// WHY THIS EXISTS:
//   [PIN] Testnet REST lacks compute_budget → v1 covenant txs always die
//   with "script-units limit=9999". wRPC full nodes work.
//
// wRPC WIRE FORMAT [PIN gauntlet-B4 — from kit's proven implementation]:
//   - Method: 'submitTransaction' (NOT 'submitTransactionRequest')
//   - Response txId: (j.params || j.result || {}).transactionId
//   - value (NOT amount) — serialized via __BIGINT__ marker + regex strip
//   - scriptPublicKey: flat '0000' + hex
//   - mass: 0, storageMass: 0 — REQUIRED on outputs and tx level
//   - covenant: explicit null when absent (NOT omitted)
//   - allowOrphan: TRUE (public nodes don't chain mempool)
//   - Rotate on BOTH errors AND rejections (txId=null → next endpoint)
//
// ENDPOINTS [PIN — from kit]:
//   testnet: electron-10.kaspa.stream + vector-10.kaspa.green
//   mainnet: env var MAINNET_WRPC only (no hardcoded hosts)

const { KaspaRestProvider } = require('./provider');

// wRPC endpoints — from the kit's proven config
const WRPC_ENDPOINTS = {
    mainnet: [], // no public default: set PC_MAINNET_WRPC (comma-separated list allowed)
    testnet: [
        'wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json',
        'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json',
    ],
};

// Lazy-load WebSocket: ws package (Node.js) > browser native > unavailable
function getWebSocket() {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        try { return require('ws'); } catch (e) { /* not installed */ }
    }
    if (typeof WebSocket !== 'undefined') return WebSocket;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BigInt serialization: __BIGINT__ marker + regex strip (preserves exact u64)
// ─────────────────────────────────────────────────────────────────────────────

function serializeBigInt(v) {
    return '__BIGINT__' + BigInt(v).toString();
}

function serializeWrpcTx(tx) {
    return JSON.stringify(toWrpcFormat(tx)).replace(/"__BIGINT__(\d+)"/g, '$1');
}

// wRPC v2.1.0 ground-truth schema [PIN gauntlet-B4]
function toWrpcFormat(tx) {
    return {
        version: tx.version || 1,
        inputs: (tx.inputs || []).map(inp => ({
            previousOutpoint: { transactionId: inp.txId, index: inp.index },
            signatureScript: inp.sigScript || inp.signatureScript || '',
            sequence: typeof inp.sequence === 'bigint'
                ? serializeBigInt(inp.sequence)
                : inp.sequence || 0,
            sigOpCount: 0,
            ...(inp.computeBudget !== undefined ? { computeBudget: inp.computeBudget } : {}),
        })),
        outputs: (tx.outputs || []).map(out => ({
            value: serializeBigInt(out.amount),
            scriptPublicKey: '0000' + (out.script || out.scriptPublicKey || ''),
            mass: 0,
            storageMass: 0,
            covenant: out.covenant ? {
                authorizingInput: out.covenant.authorizingInput,
                covenantId: out.covenant.covenantId,
            } : null,
        })),
        lockTime: tx.lockTime || 0,
        subnetworkId: tx.subnetworkId || '00'.repeat(20),
        gas: tx.gas || 0,
        payload: tx.payload || '',
        mass: 0,
        storageMass: 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proven wRPC broadcast with endpoint rotation [PIN — from kit]
// ─────────────────────────────────────────────────────────────────────────────

// The submitTransaction frame. allowOrphan is strict: only true allows orphans (audit S20)
function buildSubmitRequest(rpcTx, allowOrphan = true) {
    return { id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: allowOrphan === true } };
}

async function wrpcBroadcast(wrpcUrls, rpcTx, { timeout = 15000, allowOrphan = true } = {}) {
    let WsCtor;
    try { WsCtor = require('ws'); }
    catch (e) { throw new Error('ws package not installed: npm i ws'); }

    return new Promise(resolve => {
        let lastMsg = 'all endpoints failed';
        const tryUrl = k => {
            if (k >= wrpcUrls.length) { resolve({ txId: null, msg: lastMsg }); return; }
            const ws = new WsCtor(wrpcUrls[k], {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
            });
            const t = setTimeout(() => {
                console.error('  [wRPC] timeout [' + wrpcUrls[k] + ']');
                ws.terminate();
                tryUrl(k + 1);
            }, timeout);
            ws.on('open', () => ws.send(JSON.stringify(buildSubmitRequest(rpcTx, allowOrphan))));
            ws.on('message', d => {
                const s = d.toString();
                clearTimeout(t);
                let txId = null, msg = '';
                try {
                    const j = JSON.parse(s);
                    txId = (j.params || j.result || {}).transactionId || null;
                    msg = (j.error && j.error.message) || s.substring(0, 240);
                } catch (e) { msg = s.substring(0, 240); }
                ws.close();
                if (txId) resolve({ txId, msg });
                else {
                    lastMsg = msg;
                    tryUrl(k + 1);  // rotate on REJECTION too
                }
            });
            ws.on('error', e => {
                clearTimeout(t);
                lastMsg = e.message || 'network error';
                tryUrl(k + 1);
            });
        };
        tryUrl(0);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// KaspaWrpcProvider — wRPC for broadcast, REST for reads
// ─────────────────────────────────────────────────────────────────────────────

class KaspaWrpcProvider extends KaspaRestProvider {
    constructor(networkOrUrl = 'mainnet', opts = {}) {
        super(networkOrUrl, opts);
        this.wrpcTimeout = opts.wrpcTimeout || 15000;
        this.wrpcEndpoints = this._buildWrpcEndpoints(opts);
    }

    _buildWrpcEndpoints(opts) {
        const endpoints = [];

        if (opts.wrpcEndpoint) {
            endpoints.push(opts.wrpcEndpoint);
            return endpoints;
        }

        // Env vars for custom nodes
        const envVar = this.networkName === 'mainnet' ? 'PC_MAINNET_WRPC' : 'PC_TN10_WRPC';
        for (const ep of String(process.env[envVar] || '').split(',').map(s => s.trim()).filter(Boolean))
            if (endpoints.includes(ep) === false) endpoints.push(ep);

        // Known-good public endpoints (from kit's proven config)
        const defaults = WRPC_ENDPOINTS[this.networkName] || [];
        for (const ep of defaults) {
            if (!endpoints.includes(ep)) endpoints.push(ep);
        }

        return endpoints;
    }

    async broadcast(tx, { allowOrphan = true } = {}) {
        // Serialize with BigInt markers, strip them, parse back to get real numbers
        const wrpcTxStr = serializeWrpcTx(tx);
        const wrpcTxObj = JSON.parse(wrpcTxStr);

        const result = await wrpcBroadcast(this.wrpcEndpoints, wrpcTxObj, {
            timeout: this.wrpcTimeout,
            allowOrphan,
        });

        if (!result.txId) {
            throw new Error('KaspaWrpcProvider: wRPC broadcast failed: ' + result.msg);
        }
        return { txId: result.txId };
    }

    async healthCheck() {
        const WS = getWebSocket();
        if (!WS) throw new Error('No WebSocket available');
        return new Promise((resolve, reject) => {
            const ws = new WS(this.wrpcEndpoints[0], {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
            });
            const t = setTimeout(() => { ws.terminate(); reject(new Error('timeout')); }, 10000);
            ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'getInfo', params: {} })));
            ws.on('message', d => {
                clearTimeout(t); ws.close();
                try { resolve(JSON.parse(d.toString()).result); }
                catch (e) { reject(new Error('bad response')); }
            });
            ws.on('error', e => { clearTimeout(t); reject(e); });
        });
    }
}

module.exports = { KaspaWrpcProvider, toWrpcFormat, serializeWrpcTx, serializeBigInt, WRPC_ENDPOINTS, wrpcBroadcast, getWebSocket, buildSubmitRequest };

// ─────────────────────────────────────────────────────────────────────────────
// Self-test
// ─────────────────────────────────────────────────────────────────────────────

if (process.argv.includes('--test')) {
    let pass = 0, fail = 0;
    const t = (label, cond, detail) => {
        if (cond) pass++; else fail++;
        console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
    };

    // BigInt serialization
    t('BigInt 0', serializeBigInt(0n) === '__BIGINT__0');
    t('BigInt 1 KAS', serializeBigInt(100000000n) === '__BIGINT__100000000');
    t('BigInt SEQUENCE_DISABLE', serializeBigInt(0x8000000000000000n) === '__BIGINT__9223372036854775808');

    // toWrpcFormat structure (gauntlet-B4)
    {
        const tx = {
            version: 1,
            inputs: [{
                txId: 'ab'.repeat(32), index: 0, amount: 1000000000n,
                spk: '20' + '33'.repeat(32) + 'ac',
                sigScript: '41' + 'aa'.repeat(65) + '01',
                sequence: 0n, sigOpCount: 0, computeBudget: 60,
            }],
            outputs: [{
                amount: 990000000n,
                script: 'aa20' + '11'.repeat(32) + '87',
                covenant: { authorizingInput: 0, covenantId: '77'.repeat(32) },
            }],
        };

        const w = toWrpcFormat(tx);

        t('wRPC value is BigInt-marker', String(w.outputs[0].value).startsWith('__BIGINT__'));
        t('wRPC value content', w.outputs[0].value === '__BIGINT__990000000');
        t('wRPC spk 0000 prefix', w.outputs[0].scriptPublicKey.startsWith('0000aa20'));
        t('wRPC mass=0', w.outputs[0].mass === 0);
        t('wRPC storageMass=0', w.outputs[0].storageMass === 0);
        t('wRPC covenant present', w.outputs[0].covenant !== null);
        t('wRPC covenantId', w.outputs[0].covenant.covenantId === '77'.repeat(32));
        t('wRPC tx-level mass=0', w.mass === 0);
        t('wRPC tx-level storageMass=0', w.storageMass === 0);
        t('wRPC input computeBudget', w.inputs[0].computeBudget === 60);
        t('wRPC input sequence marker', w.inputs[0].sequence === '__BIGINT__0');

        // Non-covenant output must be explicit null
        const tx2 = { version: 1, inputs: [], outputs: [{ amount: 100n, script: '20' + '44'.repeat(32) + 'ac' }] };
        const w2 = toWrpcFormat(tx2);
        t('wRPC non-covenant is null', w2.outputs[0].covenant === null);
    }

    // serializeWrpcTx: markers stripped, valid JSON
    {
        const tx = {
            version: 1,
            inputs: [{ txId: 'ab'.repeat(32), index: 0, sequence: 0n }],
            outputs: [{ amount: 100000000n, script: 'aa20' + '11'.repeat(32) + '87' }],
        };
        const str = serializeWrpcTx(tx);
        t('serialized is string', typeof str === 'string');
        t('no __BIGINT__ markers remain', !str.includes('__BIGINT__'));
        t('valid JSON after strip', (() => { try { JSON.parse(str); return true; } catch (e) { return false; } })());

        const parsed = JSON.parse(str);
        t('parsed value is number', typeof parsed.outputs[0].value === 'number');
        t('parsed value = 100000000', parsed.outputs[0].value === 100000000);
        t('parsed sequence = 0', parsed.inputs[0].sequence === 0);
    }

    // Large BigInt round-trip (SEQUENCE_DISABLE)
    {
        const tx = {
            version: 1,
            inputs: [{ txId: 'ab'.repeat(32), index: 0, sequence: 0x8000000000000000n }],
            outputs: [{ amount: 100n, script: 'aa20' + '11'.repeat(32) + '87' }],
        };
        const parsed = JSON.parse(serializeWrpcTx(tx));
        t('SEQUENCE_DISABLE survives serialization', parsed.inputs[0].sequence === 9223372036854775808);
    }

    // submitTransaction frame: allowOrphan is honored and strict (audit S20)
    {
        const fr = buildSubmitRequest({ x: 1 }, false);
        t('submit frame honors allowOrphan=false', fr.params.allowOrphan === false);
        t('submit frame defaults allowOrphan=true', buildSubmitRequest({ x: 1 }).params.allowOrphan === true);
        t('submit frame shape', fr.id === 1 && fr.method === 'submitTransaction' && fr.params.transaction.x === 1);
    }

    // PC_*_WRPC resolution: one variable, comma list, read at construct time (audit S25)
    {
        const saved = process.env.PC_MAINNET_WRPC;
        process.env.PC_MAINNET_WRPC = ' wss://a.example/w , wss://b.example/w ';
        const mp = new KaspaWrpcProvider('mainnet');
        t('PC_MAINNET_WRPC comma list parsed in order', mp.wrpcEndpoints.length === 2 && mp.wrpcEndpoints[0] === 'wss://a.example/w' && mp.wrpcEndpoints[1] === 'wss://b.example/w');
        delete process.env.PC_MAINNET_WRPC;
        t('mainnet without PC_MAINNET_WRPC has no endpoints (broadcast fails closed)', new KaspaWrpcProvider('mainnet').wrpcEndpoints.length === 0);
        if (saved === undefined) delete process.env.PC_MAINNET_WRPC; else process.env.PC_MAINNET_WRPC = saved;
        const childLen = require('child_process').execFileSync(process.execPath, ['-e', "process.env.MAINNET_WRPC = 'wss://legacy.example/w'; console.log(require('./kaspa-wrpc').WRPC_ENDPOINTS.mainnet.length);"], { cwd: __dirname, encoding: 'utf8' }).trim();
        t('legacy MAINNET_WRPC is no longer read at module load', childLen === '0');
    }

    // Endpoints
    {
        const tn = new KaspaWrpcProvider('testnet');
        t('testnet has wRPC endpoints', tn.wrpcEndpoints.length >= 1);
        t('testnet includes electron-10', tn.wrpcEndpoints.some(e => e.includes('electron-10')));
        t('NO seeders in endpoints', !tn.wrpcEndpoints.some(e => e.includes('seeder')));
        t('NO api-tn10 REST host in wRPC list', !tn.wrpcEndpoints.some(e => e.includes('api-tn10')));
    }

    console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nALL ' + pass + ' PASS');
    process.exit(fail ? 1 : 0);
}
