// test-cli.js — smoke tests for bin/silly.js (offline, no silverc needed)
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SILLY = path.join(__dirname, 'bin', 'silly.js');
const pkg = require('./package.json');
let pass = 0, fail = 0;
const t = (name, ok, detail) => {
    if (ok) { pass++; console.log('PASS  ' + name); }
    else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
};
const run = (args, cwd) => spawnSync(process.execPath, [SILLY, ...args], { cwd: cwd || __dirname, encoding: 'utf8' });

let r = run(['--version']);
t('--version prints package version', r.status === 0 && r.stdout.trim() === pkg.version);

r = run(['bogus']);
t('unknown command exits 1', r.status === 1);

r = run([]);
t('no command prints help, exits 0', r.status === 0 && /genesis verify/.test(r.stdout));

r = run(['init', '../escape']);
t('init rejects path-like project name', r.status === 1 && /valid npm name/.test(r.stderr));

r = run(['init', 'Bad_Name']);
t('init rejects uppercase project name', r.status === 1);

r = run(['setup', '--rev=x;touch pwned']);
t('setup rejects non-hex --rev (no shell reach)', r.status === 1 && /--rev must be/.test(r.stderr));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-cli-'));
try {
    r = run(['init', 'demo'], tmp);
    const dir = path.join(tmp, 'demo');
    t('init scaffolds a project', r.status === 0 && fs.existsSync(path.join(dir, 'deploy.js')) && fs.existsSync(path.join(dir, 'contracts', 'Counter.sil')));
    const env = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    t('scaffold .env has an empty PC_PRIV', /^PC_PRIV=$/m.test(env));
    if (process.platform !== 'win32')
        t('scaffold .env is owner-only (0600)', (fs.statSync(path.join(dir, '.env')).mode & 0o777) === 0o600);
    t('scaffold .gitignore excludes .env and data/', /^\.env$/m.test(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')) && /^data\/$/m.test(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')));
    r = run(['init', 'demo'], tmp);
    t('init refuses an existing directory', r.status === 1);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

r = run(['check']);
t('check parses scaffold templates and verifies the reference artifact', /templates:\s+OK/.test(r.stdout) && /artifact verify: ✓/.test(r.stdout));

console.log('\n' + (fail ? fail + ' FAIL, ' + pass + ' pass' : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
