# SILLYSCRIPT — PROJECT HANDOFF (v2 — post-lifecycle, 2026-10-05)

For the next session. This file is deliberately THIN: every fact lives in
its single owner inside this repo (the v1 handoff duplicated canon content
and rotted six ways in one session). Read this, then load the canon.

## What sillyscript is
Unchanged: pure-JS Kaspa covenant toolkit — compile, deploy, interact,
terminate — zero WASM, zero prebuilt binaries, Termux-first.
"The covenant SDK that runs on your phone."

## Ground truth lives HERE (~/sillyscript/) — the kit is DISCONTINUED
- SilverBible.md — canon: model, language, patterns, workflow (§0 rules)
- platform-pins.md — graded facts. NEW this session: §3.3b
  (spk-version-prefix: four contexts; introspection carries the version;
  bricking corollary) and §11 (session registry S1–S7)
- Files-Manifest.md — THE count owner: 177 tests, 9 modules; every gate
  is count-free by design
- master-prompt.md — boot sector, repointed at this repo
- Do not read, cite, or cd into ~/kaspa-platform-kit

## First commands
    cd ~/sillyscript
    npm test 2>&1 | grep -E 'ALL [0-9]+ PASS|FAIL'   # 9 lines, zero FAIL
    node bin/silly.js check                           # templates: OK
    git log --oneline | head -5

## The scaffold is a PROVEN product
`silly init <name>` generates the complete lifecycle (lib/deploy/interact/
close + Counter.sil with ScriptPubKeyP2PK close). Dev loop:
silly init → npm run deploy → npm run interact (re-runnable) → npm run close.
Proven TWICE end-to-end on testnet-10, record-driven, zero hand-edits.
Run 1: genesis bd4085b1…, inc f80152c0… + 53d5d32a… (unmodified re-run),
close ec8ee719… from count=2n. Run 2 (post fee-gates): genesis 60579a71…,
inc a59844a2… + 18f3fc7e…, close c5958376… — every fee warning fired.
Full txids: pins §3.3b. The record (data/deployment.json) is the pointer
chain: currentStateTx, pending crash marker, transitions counter.

## Corrections to the v1 handoff — do NOT re-import these errors
- Tests: 177, not 187
- The "Close (termination) | 5d437bf7…" row was a PHANTOM (duplicate of
  the fixed redeploy's close). The ORIGINAL Counter (e1f2f6a8…) is
  stranded forever: bricked close entry (hand-built 34B vs introspected
  36B), carrier 99.8M locked at count=2n. Recorded as a monument:
  ~/test-run/data/deployment.json status=stranded
- Covenant-input computeBudget: 60 (proven on increments AND close, twice)
- Old fee constants were selection TARGETS, not paid fees; actuals ~100M
  per tx (S7 burn, twice-observed, 385.9M per lifecycle)
- Kit paths, kit test counts, kit gates: dead history

## Known wart (deliberate, pending a probe)
The 100M change guard drops sub-guard change as fee. Sub-1KAS outputs are
consensus-valid (99.9M/99.8M continuations created AND spent, twice) but
the true dust floor is [TODO-verify] — guard stays until probed.

## Open board (priority order)
1. Dust-floor probe: one designed testnet tx with a small output
2. Docs audit (#4): README (module table, CLI, silverc-rev, browser
   claim), SAFETY enforced-vs-aspirational (MAX_FEE now enforced at
   scaffold level only), Bible §8 P0 genesis-bridge entry citing the
   scaffold; silly-compile output newline (cosmetic)
3. Polish findings #3, #10–#14 (library code)
4. Publish prep (#6): `files` whitelist REQUIRED (bin/ + bin/templates/
   must ship; strays must not — an empty file named 2^53 proved the
   stakes), LICENSE, README polish; noble already pinned ^1.x
5. pubkeyFromPriv export (drops the scaffold's direct @noble require)
6. Medium-term intact: browser/isomorphic, pattern library, kascov
   fetchState, ledger abstraction

## Environment
Termux/Android arm64, Node v26.3.1, silverc @ c7d17a1 (~/bin/silverc),
testnet-10 (api-tn10 REST; electron-10/vector-10 wRPC — testnet covenant
txs REQUIRE wRPC, pins §4.3), funded key in ~/test-run/.env (~99 x 100M).

## Method notes carried forward
- Safe-patch everything: in-memory, abort-on-miss, node --check, atomic
- Never grade a constant without the txid that proves it (S4/S5)
- A generator is code that has never run until its output executes (S1–S3)
- Never trust a count you did not watch get counted
