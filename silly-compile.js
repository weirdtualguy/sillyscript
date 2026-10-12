#!/usr/bin/env node
// silly-compile.js — Compile .sil contracts via silverc with fail-closed verification
//
// The compile pipeline:
//   .sil source → silverc → artifact.json → loadArtifact (verify) → gates → done
//
// Post-compile gates (fail-closed, matching sillyscript's philosophy):
//   1. loadArtifact verification: template hash, dispatch tags, state span
//   2. Bytecode size ≤ 65535 (PUSHDATA2 limit for the redeem script push)
//   3. Estimated sigscript ≤ 250,000 (consensus limit, incl. redeem push)
//
// Usage (module):
//   const { compile, findSilverc } = require('./silly-compile');
//   const artifact = compile('./Counter.sil', [pubKeyHex], './counter.json');
//
// Usage (CLI):
//   node silly-compile.js contract.sil [--args args.json] [--out output.json]
//
// Args format: array (positional, matches constructor param order) or object
// (insertion order MUST match constructor param order — arrays are safer).

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadArtifact } = require('./sil-abi');

const SILVERC_HOME = path.join(os.homedir(), 'bin', 'silverc');
const MAX_BYTECODE = 65535;
const MAX_SIGSCRIPT = 250000;

// ─────────────────────────────────────────────────────────────────────────────
// silverc discovery
// ─────────────────────────────────────────────────────────────────────────────

// No shell: paths with spaces or metacharacters reach silverc intact (audit S23)
function invokeSilverc(silverc, silPath, argsPath, out) {
    const argv = argsPath
        ? [silPath, '--constructor-args', argsPath, '-o', out]
        : [silPath, '-o', out];
    execFileSync(silverc, argv, { stdio: 'pipe', timeout: 60000 });
}

function findSilverc() {
    if (fs.existsSync(SILVERC_HOME)) return SILVERC_HOME;
    try {
        const which = execSync('which silverc', { stdio: 'pipe' }).toString().trim();
        if (which && fs.existsSync(which)) return which;
    } catch (e) { /* not in PATH */ }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructor args: JS values → silverc ArtifactValue format
// ─────────────────────────────────────────────────────────────────────────────

function toArtifactValue(val) {
    if (typeof val === 'bigint') {
        // JSON numbers are doubles: beyond 2^53 the args file would round silently (audit S13)
        if (val > BigInt(Number.MAX_SAFE_INTEGER) || val < BigInt(Number.MIN_SAFE_INTEGER))
            throw new Error('silly-compile: constructor int ' + val + ' is outside the safe-integer range; refusing to bake a rounded value');
        return { kind: 'int', value: Number(val) };
    }
    if (typeof val === 'number' && Number.isInteger(val)) {
        if (Number.isSafeInteger(val) === false)
            throw new Error('silly-compile: constructor int ' + val + ' is not a safe integer; pass a BigInt within +/-(2^53-1)');
        return { kind: 'int', value: val };
    }
    if (typeof val === 'boolean') {
        return { kind: 'bool', value: val };
    }
    if (Buffer.isBuffer(val)) {
        return { kind: 'bytes', value: Array.from(val) };
    }
    if (val instanceof Uint8Array) {
        return { kind: 'bytes', value: Array.from(val) };
    }
    if (typeof val === 'string' && val.length > 0 && val.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(val)) {
        return { kind: 'bytes', value: Array.from(Buffer.from(val, 'hex')) };
    }
    if (val && typeof val === 'object' && !Array.isArray(val) && val.kind === 'text' && typeof val.value === 'string') {
        return { kind: 'text', value: val.value };   // explicit text: bypasses the hex-looking-string heuristic
    }
    if (typeof val === 'string') {
        return { kind: 'text', value: val };
    }
    if (Array.isArray(val)) {
        return { kind: 'bytes', value: val.map(Number) };
    }
    throw new Error(`silly-compile: cannot convert ${typeof val} to ArtifactValue: ${JSON.stringify(val)}`);
}

function buildArgs(args) {
    if (args === undefined || args === null) return [];
    if (Array.isArray(args)) {
        return args.map(toArtifactValue);
    }
    if (typeof args === 'object' && args !== null) {
        // Object form: insertion order must match constructor param order.
        // Arrays are the safer interface — use those when order matters.
        return Object.values(args).map(toArtifactValue);
    }
    throw new Error('silly-compile: args must be an array (positional) or object');
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-compile verification gates
// ─────────────────────────────────────────────────────────────────────────────

function verifyArtifact(artifactPath) {
    // Gate 1: loadArtifact — verifies template hash, dispatch tags, state span,
    // TOALTSTACK/FROMALTSTACK structure. Throws on any mismatch.
    const loaded = loadArtifact(artifactPath);

    // Gate 2: bytecode size (PUSHDATA2 limit for the redeem script push)
    for (const [name, contract] of Object.entries(loaded.contracts)) {
        const bcLen = contract.bytecode.length;
        if (bcLen > MAX_BYTECODE) {
            throw new Error(
                `silly-compile: contract '${name}' bytecode is ${bcLen} bytes, ` +
                `exceeding PUSHDATA2 limit (${MAX_BYTECODE}). ` +
                `Split data into chunks or reduce contract size.`
            );
        }

        // Gate 3: estimated sigscript (args + tag + redeem push)
        // Conservative: assumes ~100 bytes of args (typical small entry)
        const estimatedSigscript = bcLen + 100;
        if (estimatedSigscript > MAX_SIGSCRIPT) {
            throw new Error(
                `silly-compile: contract '${name}' estimated sigscript ${estimatedSigscript} ` +
                `bytes approaches consensus limit (${MAX_SIGSCRIPT}). ` +
                `Verify actual entry args fit.`
            );
        }
    }

    return loaded;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main compile function
// ─────────────────────────────────────────────────────────────────────────────

function compile(silPath, args, outputPath) {
    const silverc = findSilverc();
    if (!silverc) {
        throw new Error(
            `silly-compile: silverc not found at ${SILVERC_HOME} or in PATH.\n` +
            `Install it with: silly setup\n` +
            `Or set SILVERC_HOME and ensure the binary exists.`
        );
    }

    if (!fs.existsSync(silPath)) {
        throw new Error(`silly-compile: source file not found: ${silPath}`);
    }

    // Default output: <source>.json (matches silverc's default)
    const out = outputPath || silPath.replace(/\.sil$/, '.json');

    // Build constructor args file if args provided
    let argsPath = null;
    const argValues = buildArgs(args);
    if (argValues.length > 0) {
        argsPath = path.join(os.tmpdir(), `silly-args-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(argsPath, JSON.stringify(argValues, null, 2));
    }

    try {
        // Invoke silverc
        try {
            invokeSilverc(silverc, silPath, argsPath, out);
        } catch (e) {
            const stderr = (e.stderr || e.message || '').toString();
            throw new Error(`silly-compile: silverc failed:\n${stderr.split('\n').slice(0, 10).join('\n')}`);
        }

        // Post-compile verification (fail-closed)
        const loaded = verifyArtifact(out);

        // Report
        const contractNames = Object.keys(loaded.contracts);
        for (const name of contractNames) {
            const c = loaded.contracts[name];
            console.log(`  ✓ ${name}: ${Object.keys(c.entries).length} entries, ` +
                `bytecode ${c.bytecode.length}B, state span ${c.stateSpan.len}B — verified`);
        }

        return loaded;

    } finally {
        if (argsPath && fs.existsSync(argsPath)) {
            try { fs.unlinkSync(argsPath); } catch (e) { /* cleanup best-effort */ }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function cli() {
    const args = process.argv.slice(2);

    if (args.includes('--test')) {
        return selfTest();
    }

    if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
        console.log(`Usage: silly-compile <contract.sil> [--args args.json] [--out output.json]

Options:
  --args <file>   JSON file with constructor args (array of ArtifactValue objects)
  --out <file>    Output artifact path (default: <source>.json)
  --test          Run self-tests

The output artifact is automatically verified:
  - Template hash recomputed and compared
  - Dispatch tags derived from entry signatures and compared
  - State span bounds checked
  - Bytecode size checked against PUSHDATA2 limit
`);
        process.exit(0);
    }

    const silPath = args[0];
    let argsFile = null;
    let outPath = null;

    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--args' && i + 1 < args.length) argsFile = args[++i];
        if (args[i] === '--out' && i + 1 < args.length) outPath = args[++i];
    }

    let ctorArgs = [];
    if (argsFile) {
        if (!fs.existsSync(argsFile)) {
            console.error(`Error: args file not found: ${argsFile}`);
            process.exit(1);
        }
        ctorArgs = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
    }

    try {
        const artifact = compile(silPath, ctorArgs, outPath);
        console.log(`\nCompiled and verified: ${silPath}`);
    } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-test
// ─────────────────────────────────────────────────────────────────────────────

function selfTest() {
    let pass = 0, fail = 0;
    const t = (label, cond, detail) => {
        if (cond) pass++; else fail++;
        console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
    };

    // Args building
    t('int → kind:int', JSON.stringify(toArtifactValue(42)) === '{"kind":"int","value":42}');
    t('bigint → kind:int', JSON.stringify(toArtifactValue(100000000n)) === '{"kind":"int","value":100000000}');
    t('bool → kind:bool', JSON.stringify(toArtifactValue(true)) === '{"kind":"bool","value":true}');
    t('hex string → kind:bytes', JSON.stringify(toArtifactValue('aabb')) === '{"kind":"bytes","value":[170,187]}');
    t('Buffer → kind:bytes', JSON.stringify(toArtifactValue(Buffer.from([1, 2, 3]))) === '{"kind":"bytes","value":[1,2,3]}');
    t('text string → kind:text', JSON.stringify(toArtifactValue('hello')) === '{"kind":"text","value":"hello"}');
    t('array → kind:bytes', JSON.stringify(toArtifactValue([255, 0])) === '{"kind":"bytes","value":[255,0]}');
    t('null → empty args', buildArgs(null).length === 0);
    t('undefined → empty args', buildArgs(undefined).length === 0);
    // silverc is invoked without a shell: hostile paths arrive intact (audit S23)
    {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc a;b-'));
        const fake = path.join(dir, 'fake silverc.js');
        fs.writeFileSync(fake, "const fs = require('fs'); const a = process.argv.slice(2); fs.writeFileSync(a[a.indexOf('-o') + 1], JSON.stringify(a));");
        const outP = path.join(dir, 'out file.json'), argP = path.join(dir, 'args file.json');
        invokeSilverc(process.execPath, fake, argP, outP);
        const g1 = JSON.parse(fs.readFileSync(outP, 'utf8'));
        t('silverc argv intact with spaces and ; in paths', g1.length === 4 && g1[0] === '--constructor-args' && g1[1] === argP && g1[2] === '-o' && g1[3] === outP);
        invokeSilverc(process.execPath, fake, null, outP);
        const g2 = JSON.parse(fs.readFileSync(outP, 'utf8'));
        t('silverc argv without constructor args', g2.length === 2 && g2[0] === '-o' && g2[1] === outP);
        let threw = false;
        try { invokeSilverc(process.execPath, path.join(dir, 'missing.js'), null, outP); } catch (e) { threw = true; }
        t('silverc failure propagates', threw);
        fs.rmSync(dir, { recursive: true, force: true });
    }

    // Unsafe integers fail closed at the JSON boundary (audit S13)
    const thrC = f => { try { f(); return false; } catch (e) { return /silly-compile/.test(e.message); } };
    t('bigint 2^53-1 accepted', JSON.stringify(toArtifactValue(2n ** 53n - 1n)) === '{"kind":"int","value":9007199254740991}');
    t('bigint 2^53 rejected', thrC(() => toArtifactValue(2n ** 53n)));
    t('bigint -(2^53) rejected', thrC(() => toArtifactValue(-(2n ** 53n))));
    t('number 2^53 rejected', thrC(() => toArtifactValue(2 ** 53)));
    t('61-bit serial rejected, not rounded', thrC(() => toArtifactValue((1n << 61n) + 1n)));
    t('{kind:text} keeps hex-looking text as text', JSON.stringify(toArtifactValue({ kind: 'text', value: 'abcd' })) === '{"kind":"text","value":"abcd"}');
    t('{kind:text} with a non-string value rejected', thrC(() => toArtifactValue({ kind: 'text', value: 5 })));
    t('object preserves order', JSON.stringify(buildArgs({ a: 1, b: true })) === '[{"kind":"int","value":1},{"kind":"bool","value":true}]');

    // Object args warning: insertion order = constructor order
    t('array args positional', JSON.stringify(buildArgs([1, true, 'aabb'])) ===
        '[{"kind":"int","value":1},{"kind":"bool","value":true},{"kind":"bytes","value":[170,187]}]');

    // Artifact verification (using existing vesting.json)
    const vestingPath = path.join(__dirname, 'vesting.json');
    if (fs.existsSync(vestingPath)) {
        try {
            const loaded = verifyArtifact(vestingPath);
            t('vesting.json passes verification', loaded.contracts.VestingEscrow !== undefined);
            t('vesting entries verified', Object.keys(loaded.contracts.VestingEscrow.entries).length === 2);
        } catch (e) {
            t('vesting.json passes verification', false, e.message);
        }
    } else {
        console.log('  (skipping vesting.json test — file not found)');
    }

    // silverc discovery (informational, not pass/fail)
    const silverc = findSilverc();
    console.log(`  silverc: ${silverc ? 'found at ' + silverc : 'NOT FOUND (run: silly setup)'}`);

    console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
    process.exit(fail ? 1 : 0);
}

if (require.main === module) {
    cli();
}

module.exports = { compile, findSilverc, buildArgs, toArtifactValue, verifyArtifact, invokeSilverc };
