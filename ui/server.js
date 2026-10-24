// ui/server.js — sillyscript local UI: zero-dependency HTTP server, loopback only.
//
// Scope: inspect/verify artifacts, encode entry calls, derive state transitions and addresses,
// compute dispatch tags, browse docs, compile via silverc. It never reads, asks for, or stores a
// private key, and makes no outbound network requests. Signing and broadcasting stay in the CLI.
//
//   silly ui [--port 8787]
//   const { createServer } = require('./ui/server');  // tests

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { blake3 } = require('@noble/hashes/blake3');
const { loadArtifact, typeName, dispatchTypeName } = require('../sil-abi');
const { buildSigScript, buildCompleteSigScript, buildRedeem } = require('../sil-encoder');
const { p2shSpk, p2shAddress } = require('../kaspa-crypto');
const { compile, findSilverc } = require('../silly-compile');
const PKG = require('../package.json');

const ROOT = path.join(__dirname, '..');
const MAX_BODY = 2 * 1024 * 1024;
const MAX_SOURCE = 200 * 1024;
const DOC_ROOTS = ['README.md', 'SAFETY.md', 'SECURITY.md', 'SillyBible.md', 'platform-pins.md', 'Files-Manifest.md'];

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ── JSON → typed values (BigInt for ints, Buffer for byte types) ─────────────────────────────
const hexToBuf = (v, ctx) => {
    if (typeof v !== 'string') throw new HttpError(400, ctx + ': expected a hex string');
    const h = v.replace(/^0x/i, '');
    if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new HttpError(400, ctx + ': not valid hex');
    return Buffer.from(h, 'hex');
};
function fromJson(type, v, resolveStruct, ctx) {
    switch (type.kind) {
        case 'int': case 'temporal': {
            if (typeof v === 'number' && !Number.isSafeInteger(v)) throw new HttpError(400, ctx + ': use a decimal string for large integers');
            if (!/^-?\d+$/.test(String(v).trim())) throw new HttpError(400, ctx + ': expected an integer');
            return BigInt(String(v).trim());
        }
        case 'bool':
            if (typeof v === 'boolean') return v;
            if (v === 'true' || v === 'false') return v === 'true';
            throw new HttpError(400, ctx + ': expected true or false');
        case 'byte': {
            const n = typeof v === 'string' ? Number(v) : v;
            if (!Number.isInteger(n) || n < 0 || n > 255) throw new HttpError(400, ctx + ': expected 0-255');
            return n;
        }
        case 'string': if (typeof v !== 'string') throw new HttpError(400, ctx + ': expected a string'); return v;
        case 'bytes': case 'fixed_bytes': case 'pubkey': case 'sig': case 'datasig': return hexToBuf(v, ctx);
        case 'fixed_array': case 'dynamic_array':
            if (!Array.isArray(v)) throw new HttpError(400, ctx + ': expected a JSON array');
            return v.map((x, i) => fromJson(type.item, x, resolveStruct, ctx + '[' + i + ']'));
        case 'struct': {
            const st = resolveStruct(type.name);
            if (!st || !st.fields) throw new HttpError(400, ctx + ': unknown struct ' + type.name);
            if (v === null || typeof v !== 'object') throw new HttpError(400, ctx + ': expected an object');
            const o = {};
            for (const f of st.fields) {
                if (!(f.name in v)) throw new HttpError(400, ctx + ': missing field ' + f.name);
                o[f.name] = fromJson(f.type, v[f.name], resolveStruct, ctx + '.' + f.name);
            }
            return o;
        }
        default: throw new HttpError(400, ctx + ': unsupported type ' + type.kind);
    }
}
const jsonSafe = v => JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : (x && x.type === 'Buffer' && Array.isArray(x.data)) ? Buffer.from(x.data).toString('hex') : x));
const addresses = redeem => ({ mainnet: p2shAddress('kaspa', redeem), testnet: p2shAddress('kaspatest', redeem), script_public_key: p2shSpk(redeem).toString('hex') });

function load(body) {
    let a = body.artifact;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch { throw new HttpError(400, 'artifact is not valid JSON'); } }
    if (!a || typeof a !== 'object') throw new HttpError(400, 'artifact is required');
    try { return loadArtifact(a); } catch (e) { throw new HttpError(400, 'artifact rejected (fail-closed): ' + e.message); }
}
function pick(loaded, name) {
    const names = Object.keys(loaded.contracts);
    const n = name || names[0];
    const c = loaded.contracts[n];
    if (!c) throw new HttpError(400, 'no contract ' + JSON.stringify(n) + ' (have: ' + names.join(', ') + ')');
    return c;
}
function summarize(c) {
    let state = null;
    try { state = jsonSafe(c.decodeState()); } catch { /* non-fixed state: leave null */ }
    return {
        name: c.name,
        bytecode_bytes: c.bytecode.length,
        state_span: c.stateSpan,
        template_hash: c.templateHash.toString('hex'),
        fields: c.fields.map(f => ({ name: f.name, type: typeName(f.type) })),
        state,
        entries: Object.values(c.entries).map(e => ({
            name: e.name, tag: e.tag.toString('hex'),
            signature: e.name + '(' + e.params.map(p => dispatchTypeName(p.type, c.resolveStruct)).join(',') + ')',
            params: e.params.map(p => ({ name: p.name, type: typeName(p.type), kind: p.type.kind })),
        })),
        addresses: addresses(c.bytecode),
    };
}

// ── docs allowlist ───────────────────────────────────────────────────────────────────────────
function listDocs() {
    const out = DOC_ROOTS.filter(f => fs.existsSync(path.join(ROOT, f)));
    const walk = d => {
        for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
            const rel = d + '/' + e.name;
            if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.md')) out.push(rel);
        }
    };
    if (fs.existsSync(path.join(ROOT, 'docs'))) walk('docs');
    return out;
}

// ── routes ───────────────────────────────────────────────────────────────────────────────────
const routes = {
    'GET /api/status': () => ({
        version: PKG.version, node: process.version, platform: process.platform,
        silverc: !!findSilverc(), mainnet_note: 'Mainnet is not proven end-to-end; read SAFETY.md.',
    }),
    'GET /api/docs': () => ({ docs: listDocs() }),
    'GET /api/doc': (_b, url) => {
        const p = url.searchParams.get('path') || '';
        if (!listDocs().includes(p)) throw new HttpError(404, 'not a listed document');
        return { path: p, text: fs.readFileSync(path.join(ROOT, p), 'utf8') };
    },
    'POST /api/artifact': b => {
        const l = load(b);
        return { contracts: Object.values(l.contracts).map(summarize) };
    },
    'POST /api/encode': b => {
        const c = pick(load(b), b.contract);
        const e = c.entries[b.entry];
        if (!e) throw new HttpError(400, 'no entry ' + JSON.stringify(b.entry) + ' (have: ' + Object.keys(c.entries).join(', ') + ')');
        const raw = Array.isArray(b.args) ? b.args : [];
        if (raw.length !== e.params.length) throw new HttpError(400, 'entry ' + e.name + ' takes ' + e.params.length + ' argument(s), got ' + raw.length);
        const args = e.params.map((p, i) => fromJson(p.type, raw[i], c.resolveStruct, p.name));
        try {
            const partial = buildSigScript(c, e.name, args);
            const full = buildCompleteSigScript(c, e.name, args, c.bytecode);
            return { entry: e.name, tag: e.tag.toString('hex'), args_and_tag_hex: partial.toString('hex'), signature_script_hex: full.toString('hex'), signature_script_bytes: full.length };
        } catch (err) { throw new HttpError(400, err.message); }
    },
    'POST /api/state': b => {
        const c = pick(load(b), b.contract);
        const vals = {};
        for (const f of c.fields) {
            if (!b.state || !(f.name in b.state)) throw new HttpError(400, 'state is missing field ' + f.name);
            vals[f.name] = fromJson(f.type, b.state[f.name], c.resolveStruct, f.name);
        }
        try {
            const redeem = buildRedeem(c, vals);
            return { redeem_hex: redeem.toString('hex'), redeem_bytes: redeem.length, addresses: addresses(redeem), same_length_as_current: redeem.length === c.bytecode.length };
        } catch (err) { throw new HttpError(400, err.message); }
    },
    'POST /api/tag': b => {
        const sig = String(b.signature || '');
        if (!/^[A-Za-z_][A-Za-z0-9_]*\([^\s]*\)$/.test(sig)) throw new HttpError(400, 'signature must look like name(type,type) with no spaces; records render as {t1,t2}');
        const h = Buffer.from(blake3(Buffer.from(sig, 'utf8')));
        return { signature: sig, tag: h.subarray(0, 4).toString('hex'), blake3: h.toString('hex') };
    },
    'POST /api/address': b => {
        const r = hexToBuf(b.redeem_hex, 'redeem_hex');
        if (!r.length) throw new HttpError(400, 'redeem script is empty');
        return { redeem_bytes: r.length, addresses: addresses(r) };
    },
    'POST /api/compile': b => {
        const src = String(b.source || '');
        if (!src.trim()) throw new HttpError(400, 'source is empty');
        if (src.length > MAX_SOURCE) throw new HttpError(413, 'source too large');
        if (!findSilverc()) throw new HttpError(400, 'silverc not found. Run: silly setup');
        if (b.args !== undefined && !Array.isArray(b.args)) throw new HttpError(400, 'args must be a JSON array (constructor arguments, in order)');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-ui-'));
        try {
            const sil = path.join(dir, 'contract.sil'), out = path.join(dir, 'contract.json');
            fs.writeFileSync(sil, src);
            let loaded;
            try { loaded = compile(sil, b.args || [], out); } catch (e) { throw new HttpError(400, e.message); }
            return { artifact: JSON.parse(fs.readFileSync(out, 'utf8')), contracts: Object.values(loaded.contracts).map(summarize) };
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    },
};

function readBody(req) {
    return new Promise((resolve, reject) => {
        let n = 0, over = false; const chunks = [];
        req.on('data', c => {
            n += c.length;
            if (over) return;                       // discard the rest; the 413 goes out first
            if (n > MAX_BODY) { over = true; chunks.length = 0; reject(new HttpError(413, 'request too large')); } else chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) return resolve({});
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'body is not valid JSON')); }
        });
        req.on('error', reject);
    });
}

function createServer() {
    const page = fs.readFileSync(path.join(__dirname, 'index.html'));
    let port = 0;
    const server = http.createServer(async (req, res) => {
        const send = (status, body, type) => {
            res.writeHead(status, {
                'Content-Type': type || 'application/json; charset=utf-8',
                'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
                ...(status === 413 ? { Connection: 'close' } : {}),
                'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            });
            res.end(body);
        };
        const fail = (e) => send(e.status || 500, JSON.stringify({ error: e.status ? e.message : 'internal error' }));
        try {
            // DNS-rebinding and cross-site defence: only our own loopback origin may talk to us.
            const host = String(req.headers.host || '');
            if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) throw new HttpError(403, 'bad host');
            const url = new URL(req.url, 'http://' + host);
            if (req.method === 'GET' && url.pathname === '/') return send(200, page, 'text/html; charset=utf-8');
            const handler = routes[req.method + ' ' + url.pathname];
            if (!handler) throw new HttpError(404, 'not found');
            let body = {};
            if (req.method === 'POST') {
                const origin = req.headers.origin;
                if (origin && origin !== 'http://' + host) throw new HttpError(403, 'bad origin');
                if (!/^application\/json/i.test(String(req.headers['content-type'] || ''))) throw new HttpError(415, 'content-type must be application/json');
                body = await readBody(req);
            }
            send(200, JSON.stringify(handler(body, url)));
        } catch (e) { if (!(e instanceof HttpError)) console.error('[silly ui]', e); fail(e); }
    });
    server.listenLoopback = (p = 8787) => new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(p, '127.0.0.1', () => { port = server.address().port; resolve(port); });
    });
    return server;
}

async function start(p) {
    const server = createServer();
    const port = await server.listenLoopback(p);
    console.log('sillyscript UI: http://127.0.0.1:' + port + '   (loopback only; Ctrl+C to stop)');
    return server;
}

module.exports = { createServer, start, fromJson };
