// cleanup-repo.js — deprecated-file inventory + dead-code audit. Probe-first:
// everything is REPORTED before anything is touched.
//   node cleanup-repo.js         DRY RUN — table + audit, deletes nothing
//   node cleanup-repo.js --go    execute deletions (untracked: rm; tracked: git rm)
// No relocations — every path here is load-bearing (self-tests, silly check,
// scaffold requires, package.json bin, canon cross-references).
// If you want to KEEP any candidate (e.g. HANDOFF.md), delete its line from
// CANDIDATES before running --go.
const fs = require('fs');
const { execSync } = require('child_process');

const CANDIDATES = [
    ['HANDOFF.md',            'task brief — feature shipped; durable content lives in pins/manifest/git history'],
    ['HANDOFF.md.bak',        'backup cruft'],
    ['HANDOFF.md.bak2',       'backup cruft'],
    ['SilverBible.md.bak',    'backup cruft'],
    ['SilverBible.md.bak2',   'backup cruft'],
    ['platform-pins.md.bak',  'backup cruft'],
    ['platform-pins.md.bak2', 'backup cruft'],
    ['master-prompt.md.bak',  'backup cruft'],
    ['master-prompt.md.bak2', 'backup cruft'],
    ['patch-12.js',           'stale one-shot patch script (same class as integrate-genesis.js / fix-*.js)'],
    ['.backup-pre-audit',     'pre-audit backup directory (surfaced by grep this session)'],
];

const go = process.argv.includes('--go');
function sh(cmd) {
    try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
    catch (e) { return null; }
}

console.log(go ? '== EXECUTE mode — deletions will run ==\n'
               : '== DRY RUN — nothing deleted (pass --go to execute) ==\n');

console.log('-- .gitignore --');
console.log(sh('cat .gitignore') || '    (missing)');
console.log('\n-- git status --short --');
console.log(sh('git status --short') || '    (clean)');
console.log('\n-- .backup-pre-audit contents --');
console.log(sh('ls -la .backup-pre-audit') || '    (absent)');
console.log('\n-- root listing --');
console.log(sh('ls -la'));

console.log('\n-- Deprecated-file candidates --');
let removed = 0;
for (const [p, why] of CANDIDATES) {
    if (fs.existsSync(p) === false) { console.log('  missing            ' + p); continue; }
    const tracked = (sh('git ls-files -- ' + JSON.stringify(p)) || '').length > 0;
    console.log('  ' + (tracked ? 'git rm (tracked)  ' : 'rm (untracked)    ') + p);
    console.log('        why: ' + why);
    if (go) {
        if (tracked) sh('git rm -q -r -- ' + JSON.stringify(p));
        else fs.rmSync(p, { recursive: true, force: true });
        removed++;
    }
}
console.log(go ? '\nRemoved ' + removed + ' path(s). Tracked removals stay in git history.'
               : '\nDry run complete — nothing deleted.');

console.log('\n-- Dead-code audit (read-only; paste output back) --');
const audit = [
    ['contract.js — unused covenantId import? (import seen, no call site in module body)',
     'grep -n "covenantId" contract.js'],
    ['FEE_REGEX — definitions vs use sites across modules',
     'grep -n "FEE_REGEX" provider.js kaspa-tx.js index.js'],
    ['kaspa-wrpc.js — dead WRPC_ENDPOINTS / MAINNET_WRPC wart (pins 4.8)',
     'grep -n "WRPC_ENDPOINTS\\|MAINNET_WRPC" kaspa-wrpc.js'],
    ['patch-12.js — what is it? (head, before any --go)',
     'head -20 patch-12.js'],
];
for (const [label, cmd] of audit) {
    console.log('\n  ' + label);
    const out = sh(cmd);
    console.log(out ? out.split('\n').map(l => '    ' + l).join('\n') : '    (no matches)');
}
console.log('\nDone.');
