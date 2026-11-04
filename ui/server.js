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

class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }

// ── JSON → typed values (BigInt for ints, Buffer for byte types) ─────────────────────────────
const hexToBuf = (v, ctx) => {
    if (typeof v !== 'string') throw new HttpError(400, ctx + ': expected a hex string');
    const h = v.replace(/^0x/i, '');
    if (!/^([0-9a-fA-F]{2})*$/.test(h)) throw new HttpError(400, ctx + ': not valid hex');
    return Buffer.from(h, 'hex');
};
function fromJson(type, v, resolveStruct, ctx) {
    if (type.kind !== 'string' && (v === '' || v === undefined || v === null)) throw new HttpError(400, ctx + ': required');
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

// ── source analysis: constructor detection, lint, samples, JSON matching ────────────────────
const stripComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))   // keep line numbers stable
    .replace(/\/\/[^\n]*/g, '');

function parseConstructors(source) {
    const clean = stripComments(source);
    const out = [];
    for (const m of clean.matchAll(/\bcontract\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
        const params = m[2].split(',').map(x => x.trim()).filter(Boolean).map(x => {
            const parts = x.split(/\s+/);
            return { type: parts.slice(0, -1).join(' '), name: parts[parts.length - 1] };
        });
        if (params.some(p => !p.type || !/^[A-Za-z_]\w*$/.test(p.name))) throw new HttpError(400, 'could not parse constructor of ' + m[1]);
        out.push({ name: m[1], params });
    }
    return out;
}

const KNOWN_TYPES = /^(int|bool|byte|string|pubkey|sig|datasig|bytes|byte\[\d*\]|int\[\d*\]|bool\[\d*\])$/;
function lintSource(source, ctors) {
    const out = [];
    const clean = stripComments(source);
    const lineOf = idx => clean.slice(0, idx).split('\n').length;
    if (!/\bpragma\s+silverscript\b/.test(clean)) out.push({ level: 'warn', msg: 'no "pragma silverscript ^x.y.z;" line; silverc may reject the file' });
    if (!ctors.length) out.push({ level: 'error', msg: 'no "contract Name(...)" declaration found' });
    if (ctors.length > 1) out.push({ level: 'warn', msg: ctors.length + ' contracts found; constructor fields use the first (' + ctors[0].name + ')' });
    // bracket balance, ignoring string literals
    const stack = []; const pairs = { ')': '(', ']': '[', '}': '{' };
    let line = 1, inStr = false, bad = null;
    for (let i = 0; i < clean.length && !bad; i++) {
        const ch = clean[i];
        if (ch === '\n') line++;
        else if (ch === '"' && clean[i - 1] !== '\\') inStr = !inStr;
        else if (!inStr) {
            if ('([{'.includes(ch)) stack.push({ ch, line });
            else if (pairs[ch]) { const top = stack.pop(); if (!top || top.ch !== pairs[ch]) bad = { line, msg: 'unexpected "' + ch + '"' + (top ? ' (opened as "' + top.ch + '" on line ' + top.line + ')' : ' with nothing open') }; }
        }
    }
    if (!bad && stack.length) { const t = stack[stack.length - 1]; bad = { line: t.line, msg: '"' + t.ch + '" opened here is never closed (' + stack.length + ' unclosed)' }; }
    if (bad) out.push({ level: 'error', line: bad.line, msg: bad.msg });
    for (const c of ctors) {
        const seen = new Set();
        for (const p of c.params) {
            if (seen.has(p.name)) out.push({ level: 'error', msg: c.name + ': duplicate constructor parameter "' + p.name + '"' });
            seen.add(p.name);
            if (!KNOWN_TYPES.test(p.type)) out.push({ level: 'warn', msg: c.name + ': parameter "' + p.name + '" has type "' + p.type + '", not one the codec knows (int, bool, byte, byte[N], string, pubkey, ...)' });
            const uses = (clean.match(new RegExp('\\b' + p.name + '\\b', 'g')) || []).length;
            if (uses < 2) out.push({ level: 'warn', msg: c.name + ': constructor parameter "' + p.name + '" is never used', line: lineOf(clean.indexOf(p.name)) });
        }
    }
    if (!out.some(x => x.level === 'error')) out.push({ level: 'ok', msg: 'structure looks sound (pre-flight only; silverc is the authority on the language)' });
    return out;
}

function sampleFor(p, i) {
    const t = p.type;
    const rep = n => (((i + 1) * 17) & 255).toString(16).padStart(2, '0').repeat(n);
    let m;
    if ((m = /^byte\[(\d+)\]$/.exec(t))) return Number(m[1]) <= 4096 ? rep(Number(m[1])) : '';
    if (t === 'byte') return '00';
    if (t === 'pubkey') return rep(32);
    if (t === 'int') return /bips|bps/i.test(p.name) ? '500' : '1';
    if (t === 'bool') return 'false';
    if (t === 'string') return 'sample';
    if (t === 'byte[]' || t === 'bytes') return '00';
    return '';
}

function flattenLeaves(v, key, out) {
    if (v !== null && typeof v === 'object') {
        if (Array.isArray(v)) v.forEach(x => flattenLeaves(x, key, out));
        else for (const [k, x] of Object.entries(v)) flattenLeaves(x, k, out);
    } else if (key !== null && ['string', 'number', 'boolean'].includes(typeof v)) out.push({ key, value: v });
}
function fillFromJson(params, obj) {
    const leaves = []; flattenLeaves(obj, null, leaves);
    const byKey = new Map();
    for (const l of leaves) { const k = l.key.toLowerCase(); if (!byKey.has(k)) byKey.set(k, l); }
    const values = {}, report = [];
    for (const p of params) {
        const names = [p.name, p.name.replace(/^(init|initial)_/, '')].map(x => x.toLowerCase());
        const hit = names.map(n => byKey.get(n)).find(Boolean);
        if (!hit) { report.push({ name: p.name, status: 'missing', note: 'no key named ' + names.join(' or ') + ' in the JSON' }); continue; }
        let v = String(hit.value).trim(), note = null;
        const t = p.type; let m;
        if (t === 'int') { if (!/^-?\d+$/.test(v)) note = 'not an integer'; else if (!Number.isSafeInteger(Number(v))) note = 'outside ±2^53: the compile helper refuses it (rounding guard)'; }
        else if (t === 'bool') { if (v !== 'true' && v !== 'false') note = 'not true/false'; }
        else if ((m = /^byte\[(\d+)\]$/.exec(t))) { v = v.replace(/^0x/i, ''); if (!/^([0-9a-fA-F]{2})*$/.test(v) || v.length !== 2 * Number(m[1])) note = 'expected ' + m[1] + ' bytes (' + 2 * Number(m[1]) + ' hex chars)'; }
        else if (t === 'byte') { if (/^\d+$/.test(v) && Number(v) < 256) v = Number(v).toString(16).padStart(2, '0'); else { v = v.replace(/^0x/i, ''); if (!/^[0-9a-fA-F]{2}$/.test(v)) note = 'expected one byte'; } }
        if (note) report.push({ name: p.name, status: 'invalid', path: hit.key, value: String(hit.value), note });
        else { values[p.name] = v; report.push({ name: p.name, status: 'filled', path: hit.key, value: v }); }
    }
    return { values, report };
}

function classifyCompileError(msg, src) {
    const hints = [];
    const lines = src.split('\n');
    let m;
    if ((m = /argument count mismatch: expected (\d+), got (\d+)/.exec(msg)))
        hints.push('silverc expects ' + m[1] + ' constructor argument(s) and received ' + m[2] + '. Use "Detect constructor" to list them.');
    const seen = new Set();
    for (const x of msg.matchAll(/(?:line\s+|:)(\d+)(?::(\d+))?/g)) {
        const n = Number(x[1]);
        if (n >= 1 && n <= lines.length && !seen.has(n) && seen.size < 3) { seen.add(n); hints.push('line ' + n + ': ' + lines[n - 1].trim().slice(0, 140)); }
    }
    if (/silverc failed/.test(msg)) {
        hints.push('The text above is silverc\'s own message; it is the authority on language and argument errors.');
        return { step: 'silverc', hints };
    }
    if (/exceeding PUSHDATA2|sigscript/.test(msg)) hints.push('The contract is too large to spend: split data into chunks or shrink the program.');
    else hints.push('silverc produced an artifact but the fail-closed checks rejected it. Do not use that artifact. Run "silly check" and report the source with the silverc revision.');
    return { step: 'verify', hints };
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
    'POST /api/ctor': b => {
        const src = String(b.source || '');
        if (src.length > MAX_SOURCE) throw new HttpError(413, 'source too large');
        const contracts = parseConstructors(src);
        contracts.forEach(c => c.params.forEach((p, i) => { p.sample = sampleFor(p, i); }));
        return { contracts, lint: lintSource(src, contracts) };
    },
    'POST /api/fill': b => {
        if (!Array.isArray(b.params) || b.params.length > 64) throw new HttpError(400, 'params must be an array');
        const params = b.params.map(p => ({ name: String(p.name || ''), type: String(p.type || '') }));
        let obj;
        try { obj = typeof b.json === 'string' ? JSON.parse(b.json) : b.json; } catch { throw new HttpError(400, 'the pasted text is not valid JSON'); }
        if (obj === null || typeof obj !== 'object') throw new HttpError(400, 'expected a JSON object');
        return fillFromJson(params, obj);
    },
    'POST /api/compile': b => {
        const src = String(b.source || '');
        if (!src.trim()) throw new HttpError(400, 'source is empty');
        if (src.length > MAX_SOURCE) throw new HttpError(413, 'source too large');
        if (b.args !== undefined && !Array.isArray(b.args)) throw new HttpError(400, 'args must be a JSON array (constructor arguments, in order)');
        const log = [];
        const stop = (msg, hints, lint) => { throw new HttpError(400, msg, { log, hints: hints || [], lint: lint || [] }); };

        let ctors = [];
        try { ctors = parseConstructors(src); } catch (e) { log.push({ step: 'parse', level: 'error', msg: e.message }); stop(e.message); }
        const lint = lintSource(src, ctors);
        for (const l of lint) log.push({ step: 'lint', level: l.level, msg: (l.line ? 'line ' + l.line + ': ' : '') + l.msg });
        const firstErr = lint.find(l => l.level === 'error');
        if (firstErr) stop('source check failed: ' + firstErr.msg, [], lint);

        const given = b.args || [];
        const c = ctors[0];
        if (given.length !== c.params.length) {
            const msg = c.name + ' takes ' + c.params.length + ' constructor argument(s) (' + c.params.map(p => p.name).join(', ') + '), got ' + given.length;
            log.push({ step: 'args', level: 'error', msg });
            stop(msg, ['Use "Detect constructor", then fill every field.'], lint);
        }
        log.push({ step: 'args', level: 'ok', msg: given.length + ' constructor argument(s) match the header' });

        if (!findSilverc()) { log.push({ step: 'silverc', level: 'error', msg: 'not found' }); stop('silverc not found. Run: silly setup', ['Run: silly setup'], lint); }

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-ui-'));
        const savedLog = console.log; console.log = () => {};   // compile() reports via console; the log array replaces it
        try {
            const sil = path.join(dir, 'contract.sil'), out = path.join(dir, 'contract.json');
            fs.writeFileSync(sil, src);
            let loaded;
            try { loaded = compile(sil, given, out); }
            catch (e) {
                const cls = classifyCompileError(e.message, src);
                log.push({ step: cls.step, level: 'error', msg: e.message });
                stop(e.message, cls.hints, lint);
            }
            log.push({ step: 'silverc', level: 'ok', msg: 'compiled' });
            const summaries = Object.values(loaded.contracts).map(summarize);
            for (const sm of summaries) log.push({ step: 'verify', level: 'ok', msg: sm.name + ': ' + sm.entries.length + ' entries, bytecode ' + sm.bytecode_bytes + ' B, state ' + sm.state_span.len + ' B, template ' + sm.template_hash.slice(0, 16) + '…; tags, template hash and state span re-derived' });
            return { artifact: JSON.parse(fs.readFileSync(out, 'utf8')), contracts: summaries, log, lint };
        } finally { console.log = savedLog; fs.rmSync(dir, { recursive: true, force: true }); }
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
        const fail = (e) => send(e.status || 500, JSON.stringify(Object.assign({ error: e.status ? e.message : 'internal error' }, e.status ? e.extra : {})));
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
