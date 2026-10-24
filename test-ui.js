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
