// test-docs.js — documentation integrity: SSOT module set, KCC headers, local links, test wiring.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = __dirname;
let pass = 0, fail = 0;
const t = (name, ok, detail) => {
    if (ok) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
};
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const { modules } = JSON.parse(read('docs/ssot/modules.json'));
t('ssot: every listed module exists and is non-empty', modules.every(m => fs.existsSync(path.join(root, 'docs/ssot', m)) && read('docs/ssot/' + m).length > 0));
const onDisk = fs.readdirSync(path.join(root, 'docs/ssot')).filter(f => /^\d\d-.*\.md$|^CHANGELOG\.md$/.test(f));
t('ssot: no unlisted module files on disk', onDisk.every(f => modules.includes(f)), onDisk.filter(f => !modules.includes(f)).join(','));
const built = execFileSync(process.execPath, [path.join(root, 'tools/ssot-build.js')], { encoding: 'utf8', maxBuffer: 1 << 26 });
t('ssot: build starts with the SSOT title and ends with the changelog', built.startsWith('# Kaspa Silverscript & Covenants') && /Audit Changelog/.test(built.slice(-4000)));
const ids = [...built.matchAll(/<!-- id: ([a-z0-9-]+) \|/g)].map(m => m[1]);
t('ssot: heading ids are unique', new Set(ids).size === ids.length, 'dupes: ' + ids.filter((x, i) => ids.indexOf(x) !== i).slice(0, 5).join(','));

for (const [f, n] of [['kcc-0001.md', '1'], ['kcc-0002.md', '2'], ['kcc-0020.md', '20']]) {
    const head = read('docs/kcc/' + f).slice(0, 1200);
    t('kcc: ' + f + ' is KCC ' + n + ', Status: Final', new RegExp('^KCC: ' + n + '$', 'm').test(head) && /^Status: Final$/m.test(head));
}

for (const doc of ['docs/README.md', 'docs/KCC-CONFORMANCE.md', 'docs/ssot/ERRATA.md']) {
    const dir = path.dirname(path.join(root, doc));
    const links = [...read(doc).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map(m => m[1]).filter(l => !/^[a-z]+:/i.test(l));
    const bad = links.filter(l => !fs.existsSync(path.resolve(dir, l)));
    t('links: ' + doc + ' (' + links.length + ' local links resolve)', bad.length === 0, bad.join(', '));
}

const testScript = JSON.parse(read('package.json')).scripts.test;
const testFiles = fs.readdirSync(root).filter(f => /^test-.*\.js$/.test(f));
t('wiring: every test-*.js is in npm test', testFiles.every(f => testScript.includes(f)), testFiles.filter(f => !testScript.includes(f)).join(','));

console.log('\n' + (fail ? fail + ' FAIL, ' + pass + ' pass' : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
