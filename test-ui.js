// test-ui.js — local UI server: loopback guards, fail-closed artifact loading, API parity with the library.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createServer } = require('./ui/server');
const { loadArtifact } = require('./sil-abi');
const { buildCompleteSigScript, buildRedeem } = require('./sil-encoder');
const { p2shAddress } = require('./kaspa-crypto');

let pass = 0, fail = 0;
const t = (name, ok, detail) => {
    if (ok) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
};

function call(port, method, url, body, headers) {
    return new Promise((resolve, reject) => {
        const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
        const req = http.request({ host: '127.0.0.1', port, method, path: url,
            headers: Object.assign({ Host: '127.0.0.1:' + port }, data !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
        res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* html */ } resolve({ status: res.statusCode, headers: res.headers, text: s, json: j }); }); });
        req.on('error', e => (e.code === 'ECONNRESET' || e.code === 'EPIPE') ? resolve({ status: 0, headers: {}, text: '', json: null }) : reject(e));
        if (data !== null) req.write(data);
        req.end();
    });
}

(async () => {
    const server = createServer();
    const port = await server.listenLoopback(0);
    const art = fs.readFileSync(path.join(__dirname, 'vesting.json'), 'utf8');
    const view = loadArtifact(JSON.parse(art)).contracts.VestingEscrow;

    t('binds loopback only', server.address().address === '127.0.0.1');

    let r = await call(port, 'GET', '/');
    t('GET / serves the page with a strict CSP', r.status === 200 && /<title>sillyscript/.test(r.text) && /default-src 'none'/.test(r.headers['content-security-policy']) && r.headers['x-content-type-options'] === 'nosniff');
    r = await call(port, 'GET', '/api/status', undefined, { Host: 'evil.example:' + port });
    t('foreign Host header rejected (DNS rebinding)', r.status === 403);
    r = await call(port, 'POST', '/api/tag', { signature: 'a()' }, { Origin: 'http://evil.example' });
    t('foreign Origin rejected on POST', r.status === 403);
    r = await call(port, 'POST', '/api/tag', '{}', { 'Content-Type': 'text/plain' });
    t('non-JSON content-type rejected', r.status === 415);
    r = await call(port, 'GET', '/nope');
    t('unknown route 404', r.status === 404);

    r = await call(port, 'GET', '/api/status');
    t('status reports version and silverc flag', r.status === 200 && typeof r.json.version === 'string' && typeof r.json.silverc === 'boolean');

    r = await call(port, 'POST', '/api/artifact', { artifact: art });
    const c = r.json && r.json.contracts && r.json.contracts[0];
    t('artifact: verified summary', r.status === 200 && c && c.name === 'VestingEscrow' && c.template_hash === view.templateHash.toString('hex'));
    t('artifact: tags match the library', c && c.entries.every(e => e.tag === view.entries[e.name].tag.toString('hex')) && c.entries.length === Object.keys(view.entries).length);
    t('artifact: addresses match the library', c && c.addresses.mainnet === p2shAddress('kaspa', view.bytecode) && c.addresses.testnet === p2shAddress('kaspatest', view.bytecode));
    t('artifact: decoded state returned', c && c.state && c.state.claimed_so_far === '0');

    const bad = JSON.parse(art);
    const ent = Object.values(bad.contracts)[0].entries;
    const first = Object.values(ent)[0];
    const tagKey = Object.keys(first).find(k => /tag/i.test(k));
    if (tagKey) { first[tagKey] = typeof first[tagKey] === 'string' ? '00000000' : [0, 0, 0, 0]; }
    r = await call(port, 'POST', '/api/artifact', { artifact: bad });
    t('artifact: tampered dispatch tag is rejected fail-closed', r.status === 400 && /fail-closed/.test(r.json.error), tagKey ? r.text.slice(0, 120) : 'no tag key found in artifact');
    r = await call(port, 'POST', '/api/artifact', { artifact: '{not json' });
    t('artifact: invalid JSON rejected', r.status === 400);

    const claim = { amount: '500000000', claim_time: '1728000000000' };
    r = await call(port, 'POST', '/api/encode', { artifact: art, contract: 'VestingEscrow', entry: 'claim', args: [claim.amount, claim.claim_time] });
    const want = buildCompleteSigScript(view, 'claim', [BigInt(claim.amount), BigInt(claim.claim_time)], view.bytecode).toString('hex');
    t('encode: signature script equals the library output', r.status === 200 && r.json.signature_script_hex === want && r.json.tag === view.entries.claim.tag.toString('hex'));
    r = await call(port, 'POST', '/api/encode', { artifact: art, entry: 'claim', args: ['1'] });
    t('encode: wrong argument count rejected', r.status === 400 && /takes 2/.test(r.json.error));
    r = await call(port, 'POST', '/api/encode', { artifact: art, entry: 'claim', args: ['1.5', '2'] });
    t('encode: non-integer int rejected', r.status === 400);
    r = await call(port, 'POST', '/api/encode', { artifact: art, entry: 'reclaim', args: ['zz'] });
    t('encode: invalid hex rejected', r.status === 400 && /hex/.test(r.json.error));
    r = await call(port, 'POST', '/api/encode', { artifact: art, entry: 'reclaim', args: ['ab'.repeat(64)] });
    t('encode: wrong-length signature rejected', r.status === 400);

    r = await call(port, 'POST', '/api/state', { artifact: art, state: { claimed_so_far: '500000000' } });
    const wantRedeem = buildRedeem(view, { claimed_so_far: 500000000n });
    t('state: next redeem and address equal the library', r.status === 200 && r.json.redeem_hex === wantRedeem.toString('hex') && r.json.addresses.mainnet === p2shAddress('kaspa', wantRedeem));
    r = await call(port, 'POST', '/api/state', { artifact: art, state: {} });
    t('state: missing field rejected', r.status === 400);

    r = await call(port, 'POST', '/api/tag', { signature: 'step(int,byte[4],bool,byte)' });
    t('tag: KCC-1 6.6 vector 2c49ed65', r.status === 200 && r.json.tag === '2c49ed65');
    r = await call(port, 'POST', '/api/tag', { signature: 'dispense({byte[4],byte,bool}[])' });
    t('tag: KCC-1 6.6 record-array vector 676b1a86', r.json.tag === '676b1a86');
    r = await call(port, 'POST', '/api/tag', { signature: 'bad sig(int)' });
    t('tag: malformed signature rejected', r.status === 400);
    r = await call(port, 'POST', '/api/address', { redeem_hex: '51' });
    t('address: KCC-1 6.7 script for R=51', r.status === 200 && r.json.addresses.script_public_key === 'aa20ce57216285125006ec18197bd8184221cefa559bb0798410d99a5bba5b07cd1d87');
    r = await call(port, 'POST', '/api/address', { redeem_hex: '' });
    t('address: empty redeem rejected', r.status === 400);

    r = await call(port, 'GET', '/api/docs');
    t('docs: listing includes README and the KCCs', r.status === 200 && r.json.docs.includes('README.md') && r.json.docs.includes('docs/kcc/kcc-0001.md'));
    r = await call(port, 'GET', '/api/doc?path=docs/kcc/kcc-0020.md');
    t('docs: listed document is served', r.status === 200 && /Fungible Token Covenant/.test(r.json.text));
    for (const p of ['../package.json', 'package.json', '/etc/passwd', 'docs/../package.json', '.env'])
        { r = await call(port, 'GET', '/api/doc?path=' + encodeURIComponent(p)); if (r.status !== 404) { t('docs: path ' + p + ' refused', false, String(r.status)); } }
    t('docs: traversal and unlisted paths refused', true);

    r = await call(port, 'POST', '/api/compile', { source: 'contract X() {}' });
    t('compile: fails cleanly (no silverc, or silverc error), never 500', r.status === 400 && typeof r.json.error === 'string');
    r = await call(port, 'POST', '/api/ctor', { source: '// contract Fake(int z)\n/* contract Hidden(bool q) */\ncontract Escrow(\n  pubkey owner, // who\n  byte[32] salt,\n  int amount,\n  bool open, string label\n) {\n}' });
    t('ctor: parses a multi-line header, ignores comments',
        r.status === 200 && r.json.contracts.length === 1 && r.json.contracts[0].name === 'Escrow' &&
        JSON.stringify(r.json.contracts[0].params.map(p => p.type + ' ' + p.name)) === JSON.stringify(['pubkey owner', 'byte[32] salt', 'int amount', 'bool open', 'string label']));
    r = await call(port, 'POST', '/api/ctor', { source: 'contract Empty() {}' });
    t('ctor: zero-argument constructor', r.status === 200 && r.json.contracts[0].params.length === 0);
    r = await call(port, 'POST', '/api/encode', { artifact: art, entry: 'claim', args: ['', '2'] });
    t('encode: empty field reports "required"', r.status === 400 && /amount: required/.test(r.json.error));
    const RELIKS = 'pragma silverscript ^0.1.0;\n// header\ncontract ReliksEdition(\n  byte[32] init_owner, byte init_scheme, int init_price, byte[32] init_artist,\n  int init_royalty_bips, byte[32] init_program_hash, byte[32] init_factory_covid, int init_serial\n) {\n  byte[32] ownerIdentifier = init_owner; byte identifierType = init_scheme; int price = init_price;\n  byte[32] artist = init_artist; int royalty_bips = init_royalty_bips; byte[32] program_hash = init_program_hash;\n  byte[32] factory_covid = init_factory_covid; int serial = init_serial;\n}\n';
    r = await call(port, 'POST', '/api/ctor', { source: RELIKS });
    const rc = r.json.contracts[0];
    t('ctor: 8 parameters with type-valid samples', rc.params.length === 8 && rc.params.every(p => typeof p.sample === 'string' && p.sample.length > 0) &&
        rc.params[0].sample.length === 64 && /^[0-9a-f]{64}$/.test(rc.params[3].sample) && rc.params[1].sample === '00' && rc.params[4].sample === '500');
    t('ctor: distinct samples per byte[32] field', new Set([0, 3, 5, 6].map(i => rc.params[i].sample)).size === 4);
    t('ctor: a sound source lints clean', r.json.lint.every(l => l.level === 'ok'));
    r = await call(port, 'POST', '/api/ctor', { source: RELIKS.replace('pragma silverscript ^0.1.0;\n', '') });
    t('lint: missing pragma is a warning', r.json.lint.some(l => l.level === 'warn' && /pragma/.test(l.msg)));
    r = await call(port, 'POST', '/api/ctor', { source: RELIKS.replace(/\}\n$/, '') });
    t('lint: unclosed brace is an error with a line', r.json.lint.some(l => l.level === 'error' && l.line === 6 && /never closed/.test(l.msg)));
    r = await call(port, 'POST', '/api/ctor', { source: 'contract A(int x, int x) { int y = x; }' });
    t('lint: duplicate parameter is an error', r.json.lint.some(l => l.level === 'error' && /duplicate/.test(l.msg)));
    r = await call(port, 'POST', '/api/ctor', { source: 'contract A(int x, int unused) { int y = x; }' });
    t('lint: unused parameter is a warning', r.json.lint.some(l => l.level === 'warn' && /"unused" is never used/.test(l.msg)));
    r = await call(port, 'POST', '/api/ctor', { source: 'no contract here' });
    t('lint: no contract declaration is an error', r.json.lint.some(l => l.level === 'error' && /no "contract/.test(l.msg)));

    const ledger = { C: 'ca4f', series: { program_hash: 'ce0f4fc0c6dae677c5fa1091731f9b552b258c823e514789513fe841b1631011', artist: 'ec7a4c67eb8c26c145519cbee601ee8dfe3ada9eb5e47d81b6d4d0f8d5094294', price: 100000000, royalty_bips: 500 },
        editions: [{ owner: '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68', serial: '3035447335784889477', price: 0 }] };
    r = await call(port, 'POST', '/api/fill', { params: rc.params.map(p => ({ name: p.name, type: p.type })), json: JSON.stringify(ledger) });
    const rep = Object.fromEntries(r.json.report.map(x => [x.name, x]));
    t('fill: names matched with the init_ prefix stripped', r.status === 200 && r.json.values.init_artist === ledger.series.artist && r.json.values.init_owner === ledger.editions[0].owner &&
        r.json.values.init_program_hash === ledger.series.program_hash && r.json.values.init_royalty_bips === '500');
    t('fill: an integer beyond 2^53 is flagged, not filled', rep.init_serial.status === 'invalid' && /2\^53/.test(rep.init_serial.note) && !('init_serial' in r.json.values));
    t('fill: absent keys are reported missing', rep.init_factory_covid.status === 'missing' && rep.init_scheme.status === 'missing');
    r = await call(port, 'POST', '/api/fill', { params: [{ name: 'k', type: 'byte[32]' }], json: '{"k":"abcd"}' });
    t('fill: wrong byte length is flagged', r.json.report[0].status === 'invalid' && /32 bytes/.test(r.json.report[0].note));
    r = await call(port, 'POST', '/api/fill', { params: [], json: '{nope' });
    t('fill: invalid JSON rejected', r.status === 400);

    r = await call(port, 'POST', '/api/compile', { source: RELIKS.replace(/\}\n$/, ''), args: [] });
    t('compile: structural error stops before silverc, with a log and the line',
        r.status === 400 && Array.isArray(r.json.log) && r.json.log.some(x => x.step === 'lint' && x.level === 'error' && /line 6/.test(x.msg)));
    r = await call(port, 'POST', '/api/compile', { source: RELIKS, args: [1, 2] });
    t('compile: wrong argument count is caught before silverc, naming the parameters',
        r.status === 400 && /takes 8 constructor argument/.test(r.json.error) && /init_owner/.test(r.json.error) && r.json.log.some(x => x.step === 'args' && x.level === 'error'));
    r = await call(port, 'POST', '/api/compile', { source: 'contract X() {}', args: [] });
    t('compile: later failures carry the log too', r.status === 400 && Array.isArray(r.json.log) && r.json.log.some(x => x.step === 'args' && x.level === 'ok'));
    r = await call(port, 'POST', '/api/compile', { source: '' });
    t('compile: empty source rejected', r.status === 400);

    r = await call(port, 'POST', '/api/artifact', JSON.stringify({ artifact: 'x'.repeat(2.2 * 1024 * 1024) }));
    t('oversize body rejected', r.status === 413 || r.status === 0);

    const html = fs.readFileSync(path.join(__dirname, 'ui', 'index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    let syntaxOk = true; try { new Function(script); } catch (e) { syntaxOk = false; console.log(e.message); }
    t('front end: inline script parses', syntaxOk);
    t('front end: no innerHTML / eval / external resources', !/innerHTML|outerHTML|insertAdjacentHTML|eval\(|document\.write|src="http|href="http/.test(html));

    server.close();
    console.log('\n' + (fail ? fail + ' FAIL, ' + pass + ' pass' : 'ALL ' + pass + ' PASS'));
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
