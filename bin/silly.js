#!/usr/bin/env node
// bin/silly.js — sillyscript CLI
//
// Commands:
//   silly setup              Install Rust + compile silverc (Termux/Android)
//   silly init <name>        Scaffold a new covenant project
//   silly check              Verify toolchain is ready

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const KNOWN_GOOD_REV = 'c7d17a15ac88610d013ec9ffffa9520aeb69929b';
const SILVERC_HOME = path.join(os.homedir(), 'bin', 'silverc');

const command = process.argv[2];
const projectName = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const isMainnet = process.argv.includes('--mainnet');
const useLatest = process.argv.includes('--latest');
const rev = useLatest ? 'master' : (process.argv.find(a => a.startsWith('--rev=')) || `--rev=${KNOWN_GOOD_REV}`).split('=')[1];

// ─────────────────────────────────────────────────────────────────────────────
// setup: Install Rust + compile silverc from source
// ─────────────────────────────────────────────────────────────────────────────

if (command === 'setup') {
    console.log('\n[silly] Setting up Termux Kaspa covenant environment...');
    console.log('[silly] This installs Rust and compiles silverc from source.');
    console.log('[silly] Takes 5-10 minutes. Keep your phone plugged in.\n');

    // Check for existing installation
    if (fs.existsSync(SILVERC_HOME)) {
        console.log(`[silly] silverc already exists at ${SILVERC_HOME}`);
        console.log('[silly] To reinstall, remove it first: rm ~/bin/silverc');
        process.exit(0);
    }

    try {
        // Step 1: System dependencies
        console.log('→ [1/4] Installing system dependencies (rust, clang, git)...');
        execSync('pkg update -y && pkg install -y rust git binutils clang make', { stdio: 'inherit' });

        // Step 2: Clone silverscript at pinned revision
        console.log(`\n→ [2/4] Cloning silverscript @ ${rev.slice(0, 8)}...`);
        const tmpDir = path.join(os.tmpdir(), `silverscript-${Date.now()}`);
        execSync(`git clone https://github.com/kaspanet/silverscript ${tmpDir}`, { stdio: 'inherit' });
        if (rev !== 'master') {
            execSync(`cd ${tmpDir} && git checkout ${rev}`, { stdio: 'inherit' });
        }

        // Step 3: Termux patch — remove risc0-zkvm (not available on Android/bionic)
        console.log('\n→ [3/4] Applying Termux patch (removing risc0-zkvm)...');
        const cargoToml = path.join(tmpDir, 'silverscript-lang', 'Cargo.toml');
        if (fs.existsSync(cargoToml)) {
            let cargoSrc = fs.readFileSync(cargoToml, 'utf8');
            if (cargoSrc.includes('risc0-zkvm')) {
                cargoSrc = cargoSrc.replace(/^\s*"risc0-zkvm",?\s*$/gm, '');
                fs.writeFileSync(cargoToml, cargoSrc);
                console.log('   Patched: removed risc0-zkvm from Cargo.toml');
            } else {
                console.log('   No patch needed: risc0-zkvm not present');
            }
        }

        // Step 4: Compile silverc
        console.log('\n→ [4/4] Compiling silverc (this takes a while)...');
        execSync(`cd ${tmpDir} && cargo build --release --bin silverc --jobs 2`, { stdio: 'inherit' });

        // Install to ~/bin
        const binDir = path.join(os.homedir(), 'bin');
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
        fs.copyFileSync(path.join(tmpDir, 'target', 'release', 'silverc'), SILVERC_HOME);
        fs.chmodSync(SILVERC_HOME, 0o755);

        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });

        console.log(`\n✅ Setup complete! silverc installed at ${SILVERC_HOME}`);
        console.log('   Next: silly init my-project');
        process.exit(0);
    } catch (e) {
        console.error(`\n[!] Setup failed: ${e.message}`);
        console.error('    Common fixes:');
        console.error('    - Ensure Termux is updated: pkg update && pkg upgrade');
        console.error('    - Ensure enough free storage (2GB+) for Rust compilation');
        console.error('    - Try: rm -rf ' + path.join(os.tmpdir(), 'silverscript-*'));
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// check: Verify toolchain
// ─────────────────────────────────────────────────────────────────────────────

if (command === 'check') {
    console.log('\n[silly] Toolchain check:');
    const silverc = fs.existsSync(SILVERC_HOME) ? SILVERC_HOME :
        (() => { try { return execSync('which silverc').toString().trim(); } catch { return null; } })();

    console.log(`  silverc:    ${silverc ? '✓ ' + silverc : '✗ NOT FOUND (run: silly setup)'}`);
    console.log(`  node:      ✓ ${process.version}`);
    console.log(`  platform:   ${os.platform()} (${os.arch()})`);

    // Check sillyscript itself
    const sillyPath = path.join(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(sillyPath, 'package.json'), 'utf8'));
    console.log(`  sillyscript: ✓ v${pkg.version}`);

    // Check noble deps
    try {
        require.resolve('@noble/hashes', { paths: [sillyPath] });
        require.resolve('@noble/curves', { paths: [sillyPath] });
        console.log('  noble deps: ✓ installed');
    } catch (e) {
        console.log('  noble deps: ✗ MISSING (run: npm install)');
    }

    // Quick verification: can we load an artifact?
    const vestingPath = path.join(sillyPath, 'vesting.json');
    if (fs.existsSync(vestingPath)) {
        try {
            const { loadArtifact } = require(path.join(sillyPath, 'sil-abi.js'));
            loadArtifact(vestingPath);
            console.log('  artifact verify: ✓ vesting.json loads and verifies');
        } catch (e) {
            console.log(`  artifact verify: ✗ ${e.message}`);
        }
    }

    // Scaffold templates must parse as scripts (guards the
    // string-embedding era's top-level-await-under-commonjs bug class)
    const tplDir = path.join(__dirname, 'templates');
    if (fs.existsSync(tplDir)) {
        let tplOk = true;
        for (const f of fs.readdirSync(tplDir).filter(x => x.endsWith('.txt'))) {
            const tmp = path.join(os.tmpdir(), 'silly-tpl-' + f + '.check.js');
            fs.writeFileSync(tmp, fs.readFileSync(path.join(tplDir, f), 'utf8'));
            try { execSync('node --check ' + JSON.stringify(tmp), { stdio: 'pipe' }); }
            catch (e) { tplOk = false; console.log('  templates:   X ' + f + ' does not parse'); }
            finally { fs.rmSync(tmp, { force: true }); }
        }
        if (tplOk) console.log('  templates:   OK scaffold scripts parse');
    }

    console.log(silverc ? '\n✅ Ready to compile covenants!' : '\n⚠️  Run: silly setup');
    process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// init: Scaffold a new project
// ─────────────────────────────────────────────────────────────────────────────

if (command === 'init') {
    if (!projectName) {
        console.error('Usage: silly init <project-name> [--mainnet]');
        process.exit(1);
    }

    const targetDir = path.join(process.cwd(), projectName);
    if (fs.existsSync(targetDir)) {
        console.error(`[!] Directory '${projectName}' already exists.`);
        process.exit(1);
    }

    const network = isMainnet ? 'mainnet' : 'testnet';
    console.log(`[silly] Scaffolding '${projectName}' (${network})...`);

    // Create directory structure
    fs.mkdirSync(path.join(targetDir, 'contracts'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'data'), { recursive: true });

    // .gitignore — protect secrets and chain state
    fs.writeFileSync(path.join(targetDir, '.gitignore'),
        `.env
data/
node_modules/
*.tmp
`);

    // .env — NO default key, fail-closed
    fs.writeFileSync(path.join(targetDir, '.env'),
`# Network: 'mainnet' or 'testnet'
PC_NET=${network}

# Your private key (64 hex chars = 32 bytes) — REQUIRED
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PC_PRIV=

# Optional: custom wRPC node (bypasses rate-limited public endpoints)
# PC_TN10_WRPC=wss://your-node/wrpc
# PC_MAINNET_WRPC=wss://your-node/wrpc
`);

    // Starter contract — Counter (demonstrates state + continuation + termination)
    fs.writeFileSync(path.join(targetDir, 'contracts', 'Counter.sil'),
`pragma silverscript ^0.1.0;

contract Counter(pubkey owner) {
    int count = 0;

    entry increment(sig ownerSig) {
        require(checkSig(ownerSig, owner));
        require(count < 100);
        validateOutputState(0, State{ count: count + 1 });
    }

    entry close(sig ownerSig) {
        require(checkSig(ownerSig, owner));
        // [PIN spk-version-prefix] tx.outputs[N].scriptPubKey returns the FULL
        // 36-byte scriptPublicKey. Manual byte construction produces only 34B.
        // Always use new ScriptPubKeyP2PK(pubkey) which returns byte[36].
        require(tx.outputs[0].scriptPubKey == byte[](new ScriptPubKeyP2PK(owner)));
        require(OpAuthOutputCount(this.activeInputIndex) == 0);
    }
}
`);

    // package.json

    // The scaffold's noble pins are DERIVED from the library's own package.json
    // (single ownership: the library owns the pins; the scaffold never
    // restates them). Templates require @noble directly, so the scaffold
    // must declare what its scripts require.
    const libNobleDeps = {};
    {
        const libPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        for (const k of ['@noble/curves', '@noble/hashes']) {
            if (libPkg.dependencies && libPkg.dependencies[k]) libNobleDeps[k] = libPkg.dependencies[k];
        }
    }
    fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({
        name: projectName,
        version: '0.1.0',
        description: 'Kaspa covenant project (sillyscript)',
        type: 'commonjs',
        scripts: {
            deploy: 'node deploy.js',
            interact: 'node interact.js',
            close: 'node close.js',
        },
        dependencies: {
            sillyscript: `file:${path.join(__dirname, '..')}`,
            ...libNobleDeps,
        },
    }, null, 2) + '\n');

    // Lifecycle scripts - copied from bin/templates/ (plain files, no
    // string-in-string escaping; syntax-checked by 'silly check')
    const TPL_DIR = path.join(__dirname, 'templates');
    if (fs.existsSync(TPL_DIR)) {
        for (const f of ['lib.js.txt', 'deploy.js.txt', 'interact.js.txt', 'close.js.txt']) {
            fs.writeFileSync(path.join(targetDir, f.replace('.txt', '')),
                fs.readFileSync(path.join(TPL_DIR, f), 'utf8'));
        }
    } else {
        console.error('[ERROR] bin/templates/ missing - scaffold would be incomplete');
        process.exit(1);
    }

    console.log(`\n✅ Project '${projectName}' created!`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${projectName}`);
    console.log(`  npm install          # links sillyscript`);
    console.log(`  # Edit .env: set PC_PRIV to your private key`);
    console.log(`  # Fund your address (see deploy.js output)`);
    console.log(`  npm run deploy       # compiles + deploys to ${network}`);
    console.log(`  npm run interact     # advances the covenant state`);
    console.log(`  npm run close        # terminates, returns the carrier`);
    process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// genesis verify: verify a source/artifact matches an on-chain covenant
// ─────────────────────────────────────────────────────────────────────────────

if (command === 'genesis') {
    const sub = process.argv[3];
    if (sub !== 'verify') {
        console.error('Usage: silly genesis verify <source.sil | artifact.json>');
        console.error('         --covenant-id <id>      covenant ID (from chain/explorer)');
        console.error('         --genesis-txid <txid>   the creating transaction');
        console.error('       [ --network testnet|mainnet | --mainnet ]');
        console.error('       [ --initial-state <json>   e.g. {"count":0} ]');
        console.error('       [ --constructor-args <json-array>  source path only ]');
        process.exit(1);
    }
    const target = process.argv[4];
    if (typeof target !== 'string' || target.startsWith('--')) {
        console.error('Usage: silly genesis verify <source.sil | artifact.json> --covenant-id <id> --genesis-txid <txid>');
        process.exit(1);
    }
    const flags = {};
    for (let i = 5; i < process.argv.length; i++) {
        const a = process.argv[i];
        if (a.startsWith('--')) {
            const next = process.argv[i + 1];
            if (next === undefined || next.startsWith('--')) { flags[a.slice(2)] = true; }
            else { flags[a.slice(2)] = next; i++; }
        }
    }
    const need = (name) => {
        const val = flags[name];
        if (typeof val !== 'string' || val.length === 0) {
            console.error('[!] Missing required flag: --' + name);
            process.exit(1);
        }
        return val;
    };
    const jsonFlag = (name) => {
        const val = flags[name];
        if (val === undefined || val === true) return undefined;
        try { return JSON.parse(val); }
        catch (e) { console.error('[!] --' + name + ' is not valid JSON: ' + e.message); process.exit(1); }
    };

    const isSource = target.endsWith('.sil');
    const network = flags.mainnet === true ? 'mainnet'
        : (typeof flags.network === 'string' ? flags.network : 'testnet');
    const args = {
        genesisTxId: need('genesis-txid'),
        covenantIdHex: need('covenant-id'),
        network,
        initialState: jsonFlag('initial-state'),
    };
    if (isSource) {
        args.sourcePath = target;
        args.constructorArgs = jsonFlag('constructor-args') || [];
    } else {
        args.artifactPath = target;
    }

    const { verifyGenesis } = require(path.join(__dirname, '..', 'genesis-verify.js'));
    verifyGenesis(args).then(r => {
        console.log(r.message);
        console.log('');
        if (r.verified === false) console.log('   (exit 1 — ' + r.layer + ' layer failed)');
        process.exit(r.verified ? 0 : 1);
    }).catch(e => {
        console.error('[!] ' + e.message);
        process.exit(1);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

console.log(`
🚀 sillyscript — Kaspa covenant development toolkit

Commands:
  silly setup              Install Rust + compile silverc (Termux/Android)
  silly init <name>        Scaffold a new covenant project
                            --mainnet    Target mainnet (default: testnet)
  silly check              Verify toolchain is ready

The full dev loop on your phone:
  silly setup → silly init my-app → edit .env → npm run deploy
`);
process.exit(0);
