// make-session-pack.js — build SESSION-PACK.md: a single pasteable context pack
// for continuing this project in a chat-only AI session (no file upload, no
// shell). The pack is a RENDERED BUILD ARTIFACT — never hand-edited, never
// committed (gitignored); regenerate per handoff: node make-session-pack.js
//
// The mode it enables is proven: the previous session delivered a verifier
// feature, an audit-grade cleanup, and a canon polish end-to-end with an AI
// that had no filesystem — operator as hands, AI as reasoning, chain as truth.
// Content ownership stays with the source files (SillyBible Appendix A rule 1).
const fs = require('fs');
const { execSync } = require('child_process');
const sh = c => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); } catch (e) { return null; } };
const die = m => { console.error('  [ABORT] ' + m); process.exit(1); };
const read = f => { if (fs.existsSync(f) === false) die('missing source: ' + f); return fs.readFileSync(f, 'utf8'); };
const OUT = 'SESSION-PACK.md';

const BRIEF = [
    "You are receiving the sillyscript project as a context pack. You have no",
    "filesystem and no code execution. You are the reasoning half of a two-party",
    "protocol; the operator is your hands. This exact mode delivered the previous",
    "session end-to-end (a verifier feature, an audit-grade cleanup, a canon",
    "polish) — it works when both halves hold their side.",
    "",
    "THE PROTOCOL",
    "1. State claims are stamped in section 2 (HEAD, git log, the test gate, all",
    "   captured at build time). Trust the stamp until an operator paste",
    "   contradicts it — then say so explicitly.",
    "2. Never guess an API, a file's contents, or a protocol fact. Request by",
    "   name — 'paste: contract.js' — and the operator will cat it to you. The",
    "   canon is inline below; the CODE files are not (too big). The inventory",
    "   is section 6 (Files-Manifest.md). Ask for what you need before writing",
    "   against it.",
    "3. Everything you produce must be paste-executable: whole files via quoted",
    "   heredocs (cat > file <<'XEOF' ... XEOF), or — for surgical edits —",
    "   exact-string anchor patchers (indexOf/includes + line-splice, abort on",
    "   any anchor miss, idempotency marker, test gates after the edit). Never",
    "   regex over source (canon 0.12). Keep single pastes under ~150 lines;",
    "   split large files into cat > followed by cat >> appends.",
    "4. Chain-dependent claims: have the operator run the probe and paste the",
    "   output. Never promote a guess to a fact; grade before you pin (canon",
    "   0.3 probe-before-trust, 0.4 grade-every-fact).",
    "5. Counts (tests, modules) have ONE owner: Files-Manifest.md (S6). Read",
    "   them from section 6; never restate from memory.",
    "6. Posture: testnet reads and probes are fine to direct. Broadcasts and",
    "   anything irreversible are operator decisions (SAFETY.md, section 7 —",
    "   mainnet-first rails).",
    "",
    "WHAT THE PROJECT IS",
    "sillyscript is a pure-JavaScript companion toolkit for SilverScript covenant",
    "development on Kaspa — the vertical between the silverc compiler and a",
    "verified, live covenant: fail-closed artifact loading, ABI-driven encoding,",
    "crypto/sighash, tx assembly + covenant binding, REST/wRPC transports, a",
    "record-driven deploy/interact/close scaffold, and 'silly genesis verify' —",
    "on-chain verification that a source matches its deployed covenant, verdict",
    "read from the chain, never the publisher. Section 4 (SillyBible.md) is the",
    "canon: model, laws, patterns. Section 5 (platform-pins.md) is the graded",
    "facts layer — it is the SPEC. Where your prior Kaspa knowledge disagrees",
    "with the pins, the pins win until a probe says otherwise: the plausible",
    "priors are wrong in expensive ways (Kaspa bech32 is not BIP-173; REST",
    "txids are not reversed; sequence is u64, not u32).",
    "",
    "KNOWN-OPEN QUEUE (snapshot at build; verify against git log)",
    "1. kaspa-wrpc.js env-var split MAINNET_WRPC vs PC_MAINNET_WRPC (pins 4.8) —",
    "   behavior decision pending.",
    "2. SillyBible 7.1 stage gates predate SAFETY.md's mainnet-first strategy —",
    "   reconciliation pass pending.",
    "3. master-prompt says 'Ten rules'; SillyBible §0 carries twelve.",
    "4. Deferred features: Path B (UTXO-lookup genesis discovery),",
    "   heterogeneous covenant-group reporting.",
    "5. provider.js <-> kaspa-tx.js consolidation (toRestFormat / FEE_REGEX /",
    "   fee discovery exist in both) — deliberately deferred.",
    "6. Consensus dust floor is [TODO-verify] (pins 11 S7).",
    "7. SillyBible Appendix B glosses for E-*/F-* labels and ICC are inferred",
    "   from usage — source them if the originals can be found.",
    "",
    "HOW TO START WORKING",
    "- Continue development: request the relevant module sources plus the pins",
    "  section that owns that domain BEFORE writing anything.",
    "- Audit/review: findings table first (# | location | finding | evidence |",
    "  verdict | proposed fix), fixes second — each fix with positive AND",
    "  negative proof.",
    "- Protocol questions: answer FROM section 5, citing the pin grade; if the",
    "  pins do not cover it, say so and propose a probe — do not fill gaps from",
    "  general knowledge.",
    "",
    "FOR THE OPERATOR (pack mechanics)",
    "- Paste sections in order; chunk at the SECTION banners if your chat UI",
    "  truncates — each section is self-contained.",
    "- Regenerate before every handoff: node make-session-pack.js. The pack is",
    "  a build artifact: never hand-edit it, never commit it.",
];

// ── Live state stamp (auto-captured; the anti-drift core of the pack) ──
const stamp = [
    'built:  ' + new Date().toISOString(),
    'HEAD:   ' + (sh('git rev-parse HEAD') || '(not a git repository — stamp incomplete)'),
    '',
    'git log --oneline -12:',
    sh('git log --oneline -12') || '(unavailable)',
    '',
    'self-verification gate (SillyBible 0.11), captured at build:',
    sh("npm test 2>&1 | grep -E 'ALL [0-9]+ PASS|FAIL'") || '(npm test did not run)',
].join('\n');

// ── Sources in load order (canon rendered verbatim; code requested via protocol) ──
const sources = [
    { title: 'CATCH-UP BRIEF — how to work in this session', src: null, body: BRIEF.join('\n') },
    { title: 'LIVE STATE STAMP — auto-captured at build', src: null, body: stamp },
    { title: 'master-prompt.md — boot sector (file-bearing sessions)', src: 'master-prompt.md', body: read('master-prompt.md') },
    { title: 'SillyBible.md — the canon', src: 'SillyBible.md', body: read('SillyBible.md') },
    { title: 'platform-pins.md — the graded facts (THE SPEC)', src: 'platform-pins.md', body: read('platform-pins.md') },
    { title: 'Files-Manifest.md — inventory + count owner', src: 'Files-Manifest.md', body: read('Files-Manifest.md') },
    { title: 'SAFETY.md — mainnet-first rails', src: 'SAFETY.md', body: read('SAFETY.md') },
];
if (fs.existsSync('AUDIT-HANDOFF.md')) {
    sources.push({ title: 'AUDIT-HANDOFF.md — ACTIVE TASK BRIEF (one-shot)', src: 'AUDIT-HANDOFF.md', body: read('AUDIT-HANDOFF.md') });
}

// ── Render ──
const BAR = '═'.repeat(72);
const header = [
    '# sillyscript — SESSION PACK (chat-handoff context)',
    '# built ' + new Date().toISOString() + ' by make-session-pack.js — RENDERED BUILD ARTIFACT:',
    '# do not edit; regenerate (node make-session-pack.js). Never committed.',
    '# Paste into any chat-only AI. Sections are independent — chunk at the',
    '# SECTION banners below if your UI truncates.',
    '',
    '## Contents',
    ...sources.map((s, i) => '  ' + (i + 1) + '. ' + s.title),
    '',
].join('\n');
const body = sources.map((s, i) => {
    const head = ['', 'SECTION ' + (i + 1) + ' — ' + s.title, BAR];
    if (s.src) head.push('source: ' + s.src + ' (verbatim)');
    head.push('', '');
    return head.join('\n') + s.body.trimEnd() + '\n';
}).join('\n');
fs.writeFileSync(OUT, header + '\n' + body);

// ── Report + gate check ──
const written = fs.readFileSync(OUT, 'utf8').split('\n');
console.log('  [ok] ' + OUT + ' written — ' + written.length + ' lines, ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
console.log('  paste index (chunk here if your UI truncates):');
written.forEach((l, i) => { if (/^SECTION \d+ — /.test(l)) console.log('    line ' + String(i + 1).padStart(5) + ':  ' + l); });
if (/FAIL/.test(stamp)) {
    console.error('  [WARN] the 0.11 gate FAILED at build time — the pack records it honestly,');
    console.error('  but fix the failure before handing this pack off.');
    process.exitCode = 1;
}

// ── The pack is a build artifact: ensure it is ignored ──
{
    const gi = read('.gitignore');
    if (gi.includes(OUT) === false) {
        fs.writeFileSync('.gitignore', gi.trimEnd() + '\n' + OUT + '\n');
        console.log('  [ok] .gitignore: ' + OUT + ' ignored (build artifact)');
    }
}
