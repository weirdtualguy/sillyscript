# SillyBible — the sillyscript canon

**What this is:** the operating-knowledge layer for building Kaspa SilverScript
covenant systems. Loaded together with `platform-pins.md` (platform facts) and
the `sillyscript` library (executable verification: `npm test`), it specializes a fresh AI
session in SilverScript — without the debugging rounds that produced it.

**The document stack (load all three):**

| Layer | File | Contains |
|---|---|---|
| Canon (this doc) | SillyBible.md | Language, covenant model, patterns, methodology, operating rules |
| Platform facts | platform-pins.md | Compiler, codec, crypto, tx, network — every pin graded, evidenced, probe-backed |
| Executable | ~/sillyscript/ | Verified modules + probes + scaffold; the facts enforced in code (`npm test`) |

The Bible tells you WHAT and WHY. The pins carry the exact FACTS with evidence.
The library VERIFIES them (npm test). Never trust a fact that lives in none of these, and
never add a fact without grading it (see 0.4).

**How to read this:** §0 is binding. §1-§4 are reference — lookup, not reading.
The old compile/ABI, tx-engineering, and platform-reality chapters moved entirely into platform-pins.md;
this doc carries only the bridge in §5. §6 is the project-archetype catalog —
start there when beginning a new project. §7 is the workflow every project follows.

---

## 0. Operating Rules for AI Agents

These rules are binding. Each exists because violating it caused a real
incident (the pins incident registries — §6 historical, §11 current) or burned real debugging
rounds. Ordered by the damage their violation causes.

### 0.1 Derive, never clone

Never copy a builder, encoder, dispatch tag, or arg-order from a previous
contract version into a new one. Derive everything from the current artifact
at runtime.

- Tags: derive via the formula (pins §1.1) or `sil-abi.js` — never hardcode.
- Sigscript arg order: read from `entry.params` at runtime — never from memory.
- State encoding: driven by the artifact's field list — never hand-rolled.

**Rationale:** the v4-clone incident. A builder copied from Edition v4 into
v5's param-reordered ABI silently bound wrong slots — "script ran, but
verification failed" with the CORRECT tag. The v4→v5→v6 rotation trilogy proves
reordering rotates both tag and stack order, and nothing in a cloned builder
detects it. `sil-abi.js` + `sil-encoder.js` make the class structurally
impossible: wrong ABI → load-time refusal, not broadcast-time failure.

### 0.2 Fail closed

Verification code must be able to fail, and failure must abort the build.

- `loadArtifact()` refuses artifacts whose tags don't derive from their own params.
- `verifyRedeem()` refuses redeems whose template hash doesn't match.
- Self-tests assert against CHAIN-VERIFIED values, not the module's own output.

**Rationale:** registry incident #12 — kaspa-crypto v1's self-test validated
the WRONG P2SH format (`0000b920`, 37 bytes) because it tested itself against
itself. A test that passes when the code is wrong is worse than no test: it
manufactures false confidence. Chain-verified vectors or nothing.

### 0.3 Probe before you trust

Every open question gets a runnable test before it becomes a fact:

1. State the hypothesis — enumerate ALL candidate answers.
2. Write a battery trying every candidate against ground truth
   (production artifacts, mainnet data, or compiler source).
3. Read the source ONLY if the battery fails — the source names the rule.
4. Re-run the battery with the corrected rule. All green → pin it.

**Rationale:** the struct-tag rendering question survived eight wrong
candidates; guessing `{fields}` braces was impossible. The battery said "none
match," the source said why, and the corrected battery verified 24/24.
Guessing wastes rounds; probing spends exactly one.

**Gauntlet reinforcement [PIN]:** this rule was violated for 15 rounds and
followed for 1 — same problem, opposite outcomes. The trigger to recognize:
when you are guessing a schema, format, or constant, that recognition IS
the signal to stop and probe. The standing probe for any serialization
question: `getBlock` with `includeTransactions: true` via wRPC returns
ground-truth transaction JSON from the node — one call replaces any amount
of schema inference from docs, source code, or bindings.

### 0.4 Grade every fact

No fact enters the canon without a provenance grade:

- `[SPEC]` — from official docs; cite file+section.
- `[REF]` — verified against source at a pinned commit (`git log -1 --format='%H'`).
- `[PIN]` — verified empirically against production data; carries the evidence txid.
- `[LAW]` — derived rule with rationale and the incident that proved it.
- `[TODO-verify]` — suspected; MUST NOT be built on. Graduates by probe only.

**Rationale:** `compiler_version: "0.1.0"` was identical across two revisions
with DIFFERENT tag formulas. Only the git hash discriminates. A fact without
provenance is a fact you cannot re-verify when the compiler changes — and it
does (pins Appendix B).

### 0.5 Record the wrong assumptions

When something is NOT what it looks like, record the negative space alongside
the fact. Both humans and LLMs hallucinate within plausible prior
distributions: Kaspa bech32 LOOKS like BIP-173 (it isn't); the P2SH spk LOOKS
like it carries a version prefix (it doesn't); REST txids LOOK reversed
(never reverse them). Each wrong assumption cost a debugging round.
platform-pins.md carries `[WRONG-ASSUMPTIONS]` fields — keep them populated.

### 0.6 The versioning rule

Logic change ⇒ new major version + fresh genesis. Old instances remain
on-chain as proof artifacts. Never mutate a deployed template's semantics.

- v1→v13 each got fresh genesis. v1 was frozen (not deleted) when its buy
  had a scheme-brick; v3-cap2 was closed by design; the mainnet lane stays
  open at mints_left 0 as a monument.
- Compatibility is PROVEN, not assumed: "tags/params/state identical"
  requires a structural diff (the v5→v6 diff-factory check), not a hope.
- Artifacts self-identify their era: `schema_version` presence discriminates
  old vs new format; the git rev discriminates the compiler.

### 0.7 Positive AND negative proofs

A feature is proven when both its acceptance AND its rejection are
demonstrated on-chain. Rejection is a certificate: the aliasing pair
(`2b774355` idx 1,2,3 accepted; `79073135` idx 1,2,2 rejected) proved the
output-index distinctness guard in both directions in one session.

Deferred negative tests rot: the v4 mint-conservation negative was deferred
and became the project's only audit gap. Same-day or never.

The library inherits this: `sil-abi.js` refusing to load struct-bearing artifacts
(before the `{fields}` fix) was itself diagnostic evidence.

### 0.8 The fact lifecycle

Facts move through a pipeline, and the pipeline IS the methodology:

    empirical pin (it worked once)
      → source study (why it works)
        → production sweep (does it work everywhere?)
          → conflict detection (where doesn't it?)
            → decisive probe (the battery)
              → graded pin (evidence + re-verification trigger)

Every fact in platform-pins.md completed this arc or is marked [TODO].
New facts enter at stage 1 and MUST complete the arc before carrying weight.

### 0.9 Naming pins

Terminology drift is a real bug class. Pin the vocabulary:

- The brand is "Reliks" (relik/reliks) — never "relic/relics".
- KIP-21 "lanes" are subnetwork-scoped; this stack's lanes are "mint branches".
- "Redeem" = the full prefix‖state‖suffix script; "state" = only the middle span.
- The toolkit is sillyscript (CLI: silly); the language is SilverScript (compiler:
  silverc); the canon is SillyBible; the facts layer is platform-pins. Silver
  and silly are never interchangeable.

When docs and code disagree on a term, the disagreement is itself a pin.

### 0.10 Mainnet cool-down

Irreversible decisions — mainnet genesis, baked economics, DO-NOT-CLOSE
monuments — get an overnight re-read plus the checklist pass before
execution. Testnet runs at full AI speed; mainnet deserves human-latency
verification.

**Rationale:** the v1→mainnet arc ran ~3 days. The fee law was fitted from
three probe mints hours before mainnet economics were baked. Nothing broke —
the methodology held — but the margin between "fast" and "too fast" is only
visible in retrospect.

### 0.11 The self-verification gate

Before any session builds, it verifies its foundations:

        cd ~/sillyscript
    npm test 2>&1 | grep -E 'ALL [0-9]+ PASS|FAIL'
    # expect: module PASS lines per Files-Manifest.md, zero FAIL. This gate
    # is deliberately count-free — counts have one owner (S6). The old gate's
    # hardcoded counts drifted.
    node probes/verify-tags.js <current-artifact.json>   # when a live artifact is in play

A failed probe = a pin has drifted (compiler upgrade, network change, API
churn). Investigate the drift BEFORE building on the pin. A session that
skips this gate is building on unverified ground.

### 0.12 Environment laws (Termux)

- Never put bare `!` inside double-quoted strings — bash history expansion.
- Heredocs >~150 lines silently truncate — split into parts.
- Write scratch files to the project dir, not /tmp.
- `node -e` resolves require() from cwd; `node script.js` from the script's dir.
- Self-test blocks: `require.main === module && argv.includes('--test')`.
- Never regex-patch source files — greedy matches corrupt them (incident #10).
  Rewrite whole files — or, for surgical edits, use an exact-string anchor
  patcher: indexOf/includes + line-splice, abort on any anchor miss, an
  idempotency marker, and test gates after the edit (six-for-six, 2026-10-07).

Each cost at least one debugging round. Cheap to obey, expensive to rediscover.

---

## 1. Mental Model

If you internalize only one section, internalize this one. Everything in
§3, §4, and §6 is an elaboration of the picture below.

### 1.1 The UTXO is the state machine

There are no accounts and no global state. A covenant contract IS a UTXO,
and its state IS a byte-range inside that UTXO's locking script:

    Output (the "smart coin")
    ├── value: N sompi of KAS locked inside
    └── scriptPublicKey: P2SH(blake2b(redeem))
        └── redeem = prefix ‖ STATE ‖ suffix
                         ^^^^^^
                         32B..2KB of mutable data

- The **template** (prefix + suffix) is immutable per covenant instance.
  Change one byte → different template hash → different identity.
- The **state** is the only thing that changes between transitions: each
  spend replaces the old state span with a new one inside the next redeem.
- The KAS value inside the UTXO is the contract's working capital — the
  "storage mass" you pay for, and often the funds the covenant guards.

A state transition = spend the UTXO + create a new output whose redeem is
the same template with new state bytes. That's ALL a covenant is.

Genesis: a plain wallet UTXO is spent into a P2SH(covenant) output — the
covenant is born at that moment, acquiring its covenant ID from the
outpoint + outputs it was created with (pins §3.2). Termination: the
covenant UTXO is spent WITHOUT recreating itself — the KAS flows out as
ordinary money, the identity ends.

### 1.2 Covenant identity travels, bytes don't

The covenant ID is computed at genesis from the authorizing outpoint and
the outputs created. From then on, the ID is **carried by declaration**:
each transition stamps the SAME 32-byte ID onto its continuation outputs.

    genesis tx:  [wallet UTXO] ──> output{cov_id = H(outpoint, outputs)}
    transition:  [cov_id coin] ──> output{cov_id = same, declared}

This is why covenant IDs are lineage identifiers, not content hashes. Two
UTXOs with byte-identical redeem scripts but different lineage have
DIFFERENT covenant IDs. The ID proves "this coin descends from that
genesis event," nothing more.

- `validateOutputState` (same-template) copies prefix/suffix from the spent
  input's own sigscript — the continuation inherits bytes by reference.
- `validateOutputStateWithTemplate` checks the foreign template against a
  baked expected hash, THEN builds the continuation.
- Continuation outputs declare `{authorizingInput, covenantId}` bindings;
  the sighash commits to them (pins §3.4) — you cannot swap a continuation
  for a lookalike without breaking every signature.

### 1.3 The redeem is revealed only when spent

P2SH hides the redeem until spend time. Consequences that cost debugging rounds:

- Pre-mint, a factory's state exists only as the P2SH commitment — you
  cannot read `program_hash` from an unspent genesis output. It becomes
  readable when the first spend reveals the sigscript.
- Naive sigscript parsers grab "the last push" — but wallet signatures
  contain byte sequences that LOOK like pushes (the "504759" incident:
  a 3-byte accidental push inside a schnorr sig parsed as a redeem).
  Guard: template-hash verification (pins §1.2), not length heuristics.
- The redeems of ALL inputs sit at the END of each input's sigscript:
  `base = sigscript_len - bytecode_size`. Args and tag occupy the front.
  (pins §1.9, and the push-header law in pins §2.4.)

### 1.4 A factory bytecode is a composite

A spawning factory (v5+) does not merely contain its own logic. Its redeem
embeds, as constructor-baked template data:

- its own logic + state span,
- the foreign template PARTS of what it spawns (the Edition prefix/suffix
  pushes visible inside `validateOutputStateWithTemplate` lowering),
- and every large constructor byte-array inlined PER REFERENCE SITE.

Two implications:

1. **The mint sigscript is heavy** — the factory redeem (with embedded
   edition template + engine) is pushed whole into every mint.
2. **Bytecode scales with reference count, not payload size.** The v10
   engine appeared TWICE as PUSHDATA2(3888B) because two lowering sites
   referenced it. The Option-A mass fit (`bc ≈ S + ~7109`) held for
   single-reference probe contracts — multi-reference contracts cost more.

### 1.5 The value model (design constraints)

Every output costs real money forever. This governs all covenant design:

- **Dust**: no flat dust floor is pinned; outputs of 0.0195 KAS were accepted on TN10 (pins §4.9). Covenant carriers
  must satisfy the storage-mass limit (§4.9) — that KAS is locked until the
  covenant terminates.
- **Storage mass** scales ~inversely with output value: a 0.1 KAS carrier
  costs ~10x the mass of a 1 KAS carrier. Small outputs are
  disproportionately expensive — the F-B14 finding.
- **Fees** scale with mass ≈ 2×tx_bytes. A 16KB-art mint costs ~4.8M sompi
  in fees; a 32KB mint ~8.1M. Fee discovery (pins §4.5) handles this.
- **Pruning**: nodes discard tx history after ~3 days. On-chain art in
  sigscripts (reveal pattern) survives; retrieval must anchor against the
  live UTXO set where possible, archival fallback otherwise.

Design corollary: minimize output COUNT and maximize output VALUE. Batch
payments when the covenant allows it; prefer one 3-way split (owner/artist/
platform) over five small outputs.

### 1.6 Where consensus actually checks things

Three layers enforce, in this order:

1. **Wire/serialization**: schema mismatches, field-dropping, encoding
   errors. These reject BEFORE anything else runs — `request
   deserialization error`, or the silent compute_budget field-drop that
   manifests as `script-units limit=9999` [PIN gauntlet-B4]. Fix: probe
   the node for ground truth (getBlock + includeTransactions).
2. **Consensus-level**: sequence locks (CSV), locktimes (CLTV), storage mass (pins §4.9; layer [TODO-verify]),
   mass, standardness, compute budget. These reject BEFORE script runs —
   the "sequence locks conditions was not met" rejection never reaches the
   covenant's `this.ageDaa` check.
3. **Script-level**: everything the redeem asserts — signatures, state
   transitions, output shapes, payment splits.

When a tx fails, determine WHICH layer rejected it before debugging the
contract. The error message discriminates: consensus rejections name
consensus rules; script failures say "script ran, but verification failed."

### 1.7 The two-lineage discipline

Every deployed covenant family has exactly two versions alive at most:

- the **canonical lineage** (current, all traffic), and
- **frozen lineages** (older, kept as on-chain proof artifacts, no traffic).

Never fix a bug by mutating a live template — fork a new genesis (rule 0.6).
The pixel-cove record: v1 frozen (buy scheme-brick), v2 closed-by-design,
v3-cap2 closed, v3 live, v4 proof-closed, v5 multi-chunk, v7 parallel-lanes,
v8/10/11 production, v13 current. Each is a chapter, not a corpse.

### 1.8 Ownership is a proof model

A covenant can be owned by three things (the KCC20 modes):

- a **pubkey** — proof = a schnorr signature over the tx,
- a **script hash** — proof = an input whose spk matches (P2SH co-spend),
- a **covenant ID** — proof = an input carrying that ID (co-spend).

There is NO eval: one covenant cannot execute another's code by reference.
Inter-covenant communication IS co-spending: the transaction itself is the
proof that both parties participated. This is why composition (KCC20 +
Minter, factory + edition, escrow + edition) is always expressed as
same-transaction co-spends with `readInputStateWithTemplate` /
`validateOutputStateWithInputTemplate` — the template metadata
(prefix/suffix lengths + hash) lets each side authenticate the other's
bytes without trusting them.

---

## 2. Language Card

Compressed reference. Every trap here is real — each `[LAW]` burned debugging
time or produced a compiler rejection. Full tutorial semantics live in
TUTORIAL.md `[SPEC]`; this card carries only what builders touch daily.

### 2.1 Types

| Type | Size/Domain | Notes |
|---|---|---|
| `int` | i64 | Domain is `[i64::MIN+1, i64::MAX]` — MIN needs 9-byte script number, VM rejects `[LAW]` |
| `temporal` | i64, milliseconds | Deliberately distinct from int — explicit `temporal(x)`/`int(x)` casts to cross, both no-op representations |
| `bool` | 1 byte in state | Normalized to 0/1; truthy representations collapsed on conversion |
| `string` | UTF-8 | Length = byte count |
| `byte` | 0–255 | Cannot use arithmetic directly; `unsigned(b)`/`signed(b)` for ordering comparisons |
| `pubkey` | 32B x-only schnorr | |
| `sig` | 65B = 64B schnorr + hashtype | |
| `datasig` | 64B | For `checkMsgSig` |
| `byte[N]` | fixed N | Compares with `==`; state-encodable |
| `T[]`, `T[N]` | dynamic / fixed | Comparison only for byte-representable bases |
| struct | user-defined | Flattened in state/sigscript encoding (pins §2.2–2.3) |

**Array rules:** `T[]{a,b,c}` literal; `+` concatenates (fixed-size element
types only — byte/int/bool/pubkey/byte[N]); `.append()` builds dynamically;
`.length`; `==`/`!=` only for byte-unambiguous bases — int/bool/struct arrays
compare length + elements manually.

### 2.2 Casts are unchecked type assertions `[LAW]`

`byte[32](data)` performs NO runtime length check. Compile-time properties
after the cast come from the asserted type — `.length` is not evidence.
Always gate:

    require(data.length == 32);
    byte[32] h = byte[32](data);

Same for `pubkey(...)`, `sig(...)`, `datasig(...)`. The compiler rejects what
it can prove wrong; it trusts what it can't.

`as byte[N]` (int → bytes): source must be `int`, N in 1..=8. `value as byte`
fails at runtime for values that don't fit one-byte script-number encoding
(e.g. 128).

### 2.3 Operators

- Arithmetic: `+ - * / %` unary `-`. **Checked** — overflow is a compile/runtime error, not wrap. This killed the v1 royalty i64 overflow class by construction.
- Comparison: `== !=` any compatible type; `< <= > >=` **int only** — bytes need `unsigned(b)` first.
- Logical: `&& || !`.
- Bitwise: `& | ^` on equal-size byte arrays (runtime size check for dynamic).
- Ternary: `cond ? a : b` — both branches same type.

### 2.4 Control flow and locks

`if/else` (braces optional for single statements). `require(cond)` /
`require(cond, "msg")` — the only failure primitive; there are no exceptions.

**For loops** `[LAW]`: `for(i, start, end, MAX_ITER)` — unroll bound must be
compile-time; runtime `end-start` must not exceed it or the script fails
before the body runs. The runtime bound check is documented as unstable —
never rely on it as validation; validate ranges explicitly. Exactly `MAX_ITER`
guarded copies are emitted regardless of the actual range — bytecode scales
with the BOUND, not the trip count.

**Time and DAA locks** `[SPEC]` — three distinct domains:

| Form | Domain | Semantics |
|---|---|---|
| `require(tx.time >= temporal)` | absolute ms | CLTV, threshold domain |
| `require(tx.daa >= int)` | absolute DAA score | CLTV, DAA domain |
| `require(this.ageDaa >= int)` | relative DAA age | CSV |

- `tx.time` values must be ≥ `LOCK_TIME_THRESHOLD` (500,000,000,000 ms);
  `tx.daa` values in `[0, LOCK_TIME_THRESHOLD)`; `this.ageDaa` in `[0, 2^32)`.
- Known out-of-domain constants rejected at compile; runtime values checked
  by generated script.
- Durations (`30 seconds`) are temporal-only; plain ints never implicitly
  become times; DAA ages are never seconds — they are score units.

**Two-layer enforcement** `[PIN]`: consensus sequence-locks reject BEFORE
script runs. The escrow expire proof showed both layers independently
enforcing the same policy (consensus CSV message vs the in-script
`this.ageDaa` check). Design liveness as: consensus lock + script check.

**Sequence mechanics [PIN gauntlet-C1]:** Kaspa sequence numbers are u64,
not u32. To DISABLE relative sequence locks (required for `tx.lockTime`
to be evaluated), set bit 63: `0x8000000000000000n` (BigInt).

[WRONG-ASSUMPTION] Kaspa sequence is u32 like Bitcoin, and 0xFFFFFFFF
disables locks. NEITHER is true — 0xFFFFFFFF in u64 = 4294967295, which
does NOT have bit 63 set and is interpreted as a relative lock of ~4B
blocks, causing "sequence locks conditions was not met" rejections.

[CRITICAL] JavaScript Number cannot represent 2^63 — it rounds to
9223372036854776000 (off by 192), causing silent signature verification
failure ("false stack entry"). Store sequence as BigInt; serialize with
the library's `serializeBigInt` (kaspa-wrpc.js); use `SEQUENCE_DISABLE`
exported constant.

### 2.5 Builtins

Crypto: `blake2b(byte[])→byte[32]`, `sha256`, `blake3`, `blake3WithKey`,
`checkSig(sig, pubkey)` (tx schnorr), `checkSigEcdsa(sig, byte[33])`,
`checkMsgSig(datasig, byte[32] digest, pubkey)` — hash the message yourself
first, `checkMsgSigEcdsa`, `g16.verify(vk, proof, publicInputs...)`.

Script constructors: `new ScriptPubKeyP2PK(pubkey)→byte[36]`,
`new ScriptPubKeyP2SH(byte[32] hash)→byte[37]`,
`new ScriptPubKeyP2SHFromRedeemScript(byte[])→byte[37]`.
**[PIN spk-version-prefix]** these constructors return the INTROSPECTION
format — version prefix INCLUDED — and compare EQUAL to
`tx.outputs[i].scriptPubKey` directly. Hand-concatenated script bytes
(34/35B, prefix absent — pins §3.3) never match an introspected
scriptPubKey, and nothing in the failure names the length as the culprit.
Never construct expected scriptPubKey values by byte concatenation. The
prefix has different representations per context (script bytes / sighash
u16 field / REST submission object / wRPC flat hex / in-script
introspection); the full table lives in pins §3.3b — this card carries
only the language-level rule.

Covenant builtins: §3. Introspection: `tx.inputs[i].{value, scriptPubKey,
outpointTxId, outpointIndex}`, `tx.outputs[i].{value, scriptPubKey}`,
`this.activeInputIndex`, `this.activeScriptPubKey`, `tx.inputs.length`,
`tx.outputs.length`, `tx.version`.

### 2.6 Constants, constructor params, and elision `[LAW]`

Contract-level `constant` declarations; constructor params live in the
const-eval environment. **Unreferenced params are DROPPED and pure
expressions over them constant-fold to tautologies** — the v10
`require(blake2b(engine)==program_hash)` folded away because both sides
were compile-time-evaluable. Countermeasure (bake anchor): mix the param
with a runtime value — `blake2b(engine_code + OpOutpointTxId(...)) != zeros`.

Params shadow same-named constants. Field initializers see constants +
params, NOT earlier fields (codegen path — do not rely on field→field refs).

### 2.7 Number units and literals

`kas`/`litras`/`grains` value units; `seconds..weeks` temporal units.
Hex literals ≤ 8 bytes are numerals; longer only valid inside an immediate
byte-array cast. Underscores and exponent notation in ints. ISO date
literals via `date("YYYY-MM-DDThh:mm:ss")` → temporal ms.

### 2.8 Entrypoints and functions

`entry name(params)` — externally invocable; a contract needs ≥1. Plain
`function` = internal helper. Single return: `: int`; tuples: `: (int, int)`
with destructuring or `.0/.1` access. **Param names are invisible to the
dispatch tag; param order/types/count are committed** (pins §1.1) — renaming
a param is safe, reordering rotates the tag and the sigscript stack order.

---

## 3. Covenant Mechanics

### 3.1 The five state builtins — decision table

| Situation | Builtin | What it proves |
|---|---|---|
| Continue MYSELF (same template) | `validateOutputState(outIdx, newState)` | Output is my template with exactly `newState` |
| Spawn a FOREIGN contract | `validateOutputStateWithTemplate(outIdx, newState, prefix, suffix, expectedHash)` | Foreign template authentic (hash), output = that template + newState |
| Validate foreign output when a co-spent input carries the same template | `validateOutputStateWithInputTemplate(outIdx, newState, tplInIdx, pLen, sLen, expectedHash)` | Template bytes reused from the input, authenticated by hash |
| Read another input as MY OWN State | `readInputState(inIdx)` | Decodes — NO authentication (see below) |
| Read a foreign input, authenticated | `readInputStateWithTemplate(inIdx, pLen, sLen, expectedHash)` | Foreign P2SH commitment + template hash verified before decode |

**Authentication semantics** `[REF state.rs]`:
- `validateOutputState` is SELF-REFERENTIAL: prefix/suffix are copied from the
  spent input's own sigscript. No hash check needed — the P2SH commitment
  authenticated those bytes at creation. This is why same-template
  transitions are cheap.
- `validateOutputStateWithTemplate` checks
  `blake3(u64le(len p)|p|u64le(len s)|s) == expectedHash` FIRST, then
  requires the output's spk == P2SH(prefix‖state‖suffix).
- `readInputState` (plain) decodes with zero checks. Valid ONLY when the
  surrounding covenant domain guarantees a single possible layout —
  otherwise add correlation checks or use the WithTemplate variant.
- `readInputStateWithTemplate` proves the claimed redeem matches BOTH the
  supplied hash AND the foreign input's actual P2SH spk — authenticate
  before decode.

### 3.2 Op* covenant opcodes `[REF compile/state.rs + DECL lowering]`

| Opcode | Returns | Meaning |
|---|---|---|
| `OpInputCovenantId(inIdx)` | byte[32] | The covenant ID of input `inIdx` |
| `OpCovInputCount(covId)` | int | # inputs in that covenant group |
| `OpCovInputIdx(covId, k)` | int | tx input index of the group's k-th input |
| `OpCovOutputCount(covId)` | int | # outputs bound to that covenant ID |
| `OpCovOutputIdx(covId, k)` | int | tx output index of the k-th bound output |
| `OpAuthOutputCount(inIdx)` | int | # outputs authorized by input `inIdx` |
| `OpAuthOutputIdx(inIdx, k)` | int | output index of the k-th authorized output |
| `OpOutputCovenantId(outIdx)` | byte[32] | Covenant ID of output `outIdx` (genesis binding) |
| `OpTxInputScriptSigLen(inIdx)` | int | Length of an input's sigscript |
| `OpTxInputScriptSigSubstr(inIdx, s, e)` | byte[] | Substring of an input's sigscript |
| `OpChainblockSeqCommit(blockHash)` | byte[32] | Chain-anchored sequence commitment |

`OpCovOutputCount` FAILS if handed a non-covenant-id value — no separate
null check needed (the groups=single lowering relies on this).

**newStates ordering law** `[REF]`: `new_states[k]` (DECL) and column-grouped
struct-array pushes map to `OpCovOutputIdx(cov_id, k)` / `OpAuthOutputIdx(in, k)`
— **covenant-family output position, not tx output position**. Builders must
lay out continuation outputs in the order the wrapper validates them.

### 3.3 Redeem geometry `[REF + LAW]`

sigscript  = [arg pushes] [OP_DATA_4 tag] [push header + redeem]
redeem     = [TOALTSTACK] [state pushes] [FROMALTSTACK] [dispatch cascade]
             ^prefix (1B) ^state span    ^suffix

- State span offset = 1 (the TOALTSTACK) when stateful; `{0,0}` stateless.
- One EXPLICIT push per state field, declaration order (pins §2.3).
- Redeem = LAST `bytecode_size` bytes: `base = sigscript_len - bytecode_size`
  — all `OpTxInputScriptSigSubstr` reads are computed from this base.
- Parse-back law `[LAW]`: walking backwards from the redeem, account for the
  push header (1/2/3/5 bytes by size) between tag and redeem data.
- First-push trick: `parsePushes(stateSpan)[0]` is field 0 — the
  version-agnostic gallery read. Weaker than template-hash verify; use the
  hash gate when trust matters.

### 3.4 State layout rules

- Fixed-width fields only at compiler `28a16f0`; variable-width allowed
  post-Aug 30 upstream — CHECK the revision before relying on dynamic state.
- Int state = 8-byte script number; bool = 1 normalized byte; struct =
  flattened leaves, one push per leaf; struct array = column-grouped.
- Genesis state is BAKED at compile time (constructor args → const-eval →
  explicit pushes). There is no deployment-time parameterization — wrong
  args = wrong series identity, silently (the INIT_MINTS incident class).
- Canonicality: `re-encode(decode(x)) == x` — the artifact verifier enforces
  it; hand-built state must match byte-exactly.

### 3.5 The template metadata pattern (foreign-state reads)

Contracts that reason about OTHER contracts carry, as constructor-baked
parameters: `templatePrefixLen`, `templateSuffixLen`, `expectedTemplateHash`.
They do NOT embed a second copy of the foreign template — they locate the
bytes at the end of the co-spent input's sigscript and authenticate by hash.
This is the KCC20Minter shape and the escrow accept shape.
bytecode_size = prefixLen + encoded_state_len + suffixLen
base          = OpTxInputScriptSigLen(inIdx) - bytecode_size
prefix        = substr(inIdx, base, base+prefixLen)
suffix        = substr(inIdx, base+prefixLen+stateLen, base+bytecode_size)
require blake3(u64le(len prefix)|prefix|u64le(len suffix)|suffix) == expectedHash
require input_spk(inIdx) == P2SHFromRedeem(substr(base..end))

**Fixed-size state requirement**: `validateOutputStateWithInputTemplate`
needs a computable state length → dynamic state fields make this route
unusable (pinned error: "requires a fixed-size state layout").

### 3.6 Genesis binding — OpOutputCovenantId

A controller covenant binds to an asset created in the SAME tx:

    require(newState.kcc20Covid == OpOutputCovenantId(0));

This is the KCC20Minter `init` shape: the minter's next state records the
covenant ID of output 0 — proving it bound itself to exactly the asset
created beside it. Without this, the same tx wouldn't prove the binding.

Genesis cov-ID computation itself is the BUILDER's job (library:
`setGenesisCovenant`) — the preimage is in pins §3.2.

### 3.7 The boundary that decides DECL vs handwritten

Ask ONE question: **does my input authorize outputs of MORE than one
template?**

- NO (1:1 self-continuation, or pure verification of my own family):
  DECL macros work — the generated wrapper's `OpAuthOutputCount == 1` and
  same-template validation match exactly.
- YES (factory spawning editions; minter validating KCC20 outputs while
  continuing itself): DECL auth-singleton ABORTS at count==2. Use
  handwritten `entry` + `validateOutputStateWithTemplate`, with explicit
  `OpCovInputCount`/`OpAuthOutputCount` bookkeeping.

This is the v6 boundary probe's on-chain lesson (pins §1.8). When unsure,
compile both and diff the ABI — tags/params identical means the public
surface is interchangeable; the internals differ only in wrapper checks.

---

## 4. DECL — Covenant Declaration Macros

DECL is sugar + safety rails over what you could write by hand (§3). Use it
when the rails fit; drop to handwritten the moment they don't (§3.7).

### 4.1 The decision is made by ONE question

> Does my input authorize continuation outputs of more than one template?

- **No** → DECL. The generated wrapper does the bookkeeping correctly and
  you cannot forget a check.
- **Yes** (heterogeneous spawn, foreign-template validation alongside
  self-continuation) → handwritten entrypoints. The auth-singleton wrapper
  emits `require(OpAuthOutputCount == 1)` unconditionally; a factory's
  input authorizing itself + a spawned Edition counts 2 and ABORTS.

This is not a style preference — it is a hard compile-time/runtime boundary
proven on-chain (the v6 probe). When in doubt, compile both and diff the
ABI; if tags/params match, the public surface is interchangeable.

### 4.2 Attribute grammar (canonical form)

#[covenant(
    binding   = auth|cov,          // default: from==1 -> auth, else cov
    from      = <int expr>,        // covenant fan-in bound
    to        = <int expr>,        // covenant fan-out bound
    mode      = verification|transition,  // default: no returns -> verification
    groups    = single|multiple,   // default: auth->multiple, cov->single
    termination = disallowed|allowed, // singleton-transition only; default disallowed
    name      = <ident>,           // public entrypoint name override
    delegate_name = <ident>,       // cov-bound only; shared delegate name
)]
function policyName(State prev, ...) { require(...); }

Sugar: `#[covenant.singleton]` = from=1,to=1. `#[covenant.fanout(to=Y)]` =
from=1,to=Y.

### 4.3 Defaults and validity table

| Rule | Value / Constraint |
|---|---|
| binding default | `from==1 → auth`, otherwise cov |
| mode default | no return types → verification; has returns → transition |
| groups default | auth → multiple; cov → single |
| `binding=auth` + `from>1` | compile error |
| `binding=cov` + `groups=multiple` | compile error |
| `binding=cov` + `from=1` (explicit) | warning: auth is usually right |
| `delegate_name` on auth | compile error |
| termination non-singleton | compile error (checked for `from==1 && to==1` only — NOT mode-gated, contra DECL.md rule 10) |
| transition + stateless contract | error (typo "tranisition" in message — match carefully) |
| verification + return values | compile error |
| transition + no returns | compile error |
| singleton transition + State[] return + termination=disallowed | compile error |
| single State return + `to != 1` (non-literal) | compile error |
| mixing auth-bound and cov-bound declarations in one contract | compile error |
| `#[covenant.delegate]` without a cov-bound declaration | compile error |
| >1 delegate body | compile error |
| handwritten entry in a leader contract without `#[covenant.allow(rule=manual_entrypoint_in_leader_contract)]` | compile error |
| `name`/`delegate_name` values | identifiers, not strings; generated names get full duplicate/reserved validation |

### 4.4 What the wrappers generate (memorize the shapes)

**Auth singleton transition** (e.g. close, fork):

entry <name>(extras...) {
    State prev = State{ <contract fields> };
    <new_state> = policy(prev, extras...);
    require(OpAuthOutputCount(activeInput) == 1);
    validateOutputState(OpAuthOutputIdx(activeInput, 0), new_state);
}

**Cov leader verification** (e.g. KCC20 transfer):

entry __leader_f(State[] new_states, extras...) {
    cov_id = OpInputCovenantId(activeInput);
    require(OpCovInputIdx(cov_id, 0) == activeInput);   // I am group input 0
    require(OpCovInputCount(cov_id) <= from);
    prev_states = [readInputState(OpCovInputIdx(cov_id,k)) for k in inputs];
    policy(prev_states, new_states, extras...);
    require(OpCovOutputCount(cov_id) == new_states.length);
    for k: validateOutputState(OpCovOutputIdx(cov_id,k), new_states[k]);
}

**Shared delegate** (one per leader contract, regardless of declaration count):

entry __delegate(<delegate-body params or none>) {
    cov_id = OpInputCovenantId(activeInput);
    require(OpCovInputIdx(cov_id, 0) != activeInput);   // I am NOT input 0
    <delegate body>(params...);                          // only if declared
}

`groups=single` (auth) prepends: `require(OpCovOutputCount(cov_id) ==
OpAuthOutputCount(activeInput))`.

### 4.5 Policy signature shapes (compile-enforced)

| Binding | Mode | Params must begin with | Entrypoint exposes |
|---|---|---|---|
| auth | verification | `State prev_state, State[] new_states` (singleton+strict: `State, State`) | `new_states + extras` |
| auth | transition | `State prev_state` | `extras` only |
| cov | verification | `State[] prev_states, State[] new_states` | `new_states + extras` |
| cov | transition | `State[] prev_states` | `extras` (leader) / none (delegate) |
| — | — | trailing params | extras, called as-is |

Generated names: `__covenant_entrypoint_auth_<f>` (auth),
`__leader_<f>` (cov), `__delegate` (shared), policies renamed
`__covenant_policy_<f>` / `__covenant_delegate_policy_<f>`. `name=`
overrides the PUBLIC name (which changes the dispatch tag — pins §1.1);
internal policy names stay source-derived.

### 4.6 Leader/delegate choreography `[REF]`

- Leader must be covenant-group **input 0**; delegates must not be. Input
  ordering within the group is load-bearing — builder responsibility.
- The leader runs the full shared-transition validation; delegates only run
  the (optional) delegate body. **The delegate wrapper deliberately cannot
  know which entrypoint input 0 chose** — that's WHY auth-bound and
  cov-bound declarations cannot mix: an auth entrypoint at input 0 would
  validate only itself while delegates assume the leader validated the
  group. One delegate policy per contract, chosen at compile time, because
  per-route selection would let delegators route around the weakest check.
- A delegate body is verification-only (no returns), may read contract
  fields, gets its own params verbatim as the public ABI. No
  `#[covenant.delegate]` body → inert default (checks only "not input 0",
  zero params — sigscript is tag + redeem only). KCC20's default transfer
  configuration NEEDS a declared body; protocols with local delegate
  obligations must declare one.
- Delegate entrypoint with zero params ⇒ sigscript = tag push + redeem push
  — the "empty leader/`vec![]`" pattern in the KCC20 merge tests.

### 4.7 Termination semantics

Default singleton transition = strict continuation: exactly one successor.
`termination = allowed` (singleton transition only) permits returning
`State[]` of length 0 (terminate) or 1 (continue) — the explicit
zero-or-one escape hatch. Use it for close-via-transition; for terminal
spends that don't continue at all (plain burn/recover), a handwritten
entry with no `validateOutputState` is simpler.

### 4.8 Known doc/code drift `[REF diff]`

- DECL.md rule 10 says termination is transition-only; the compiler gates
  it on `from==1 && to==1` only — `termination=allowed` on singleton
  VERIFICATION is accepted and meaningfully permits zero continuations.
- The stateless-transition error contains the typo "tranisition".
- Error text is part of the surface: match on substrings, never equality.

### 4.9 When handwritten anyway (checklist)

Even with a homogeneous family, drop to handwritten when you need:
- an entrypoint that terminates without continuation (burn/recover),
- value conservation checks the wrapper doesn't express,
- foreign-state reads mixed into the transition,
- or `#[covenant.allow(...)]` semantics (manual proof, compiler checks
  NOTHING — the attribute only suppresses the error; you own the
  OpCovInputCount/leader-or-delegate proof yourself).

---

## 5. Platform Layers — Bridge

Compile pipeline, ABI schema, codec rules, crypto formats, transaction
engineering, and network reality are **fully specified in platform-pins.md**
(§1–§5). This section exists only to route you:

| You are doing... | Read pins section | Use module |
|---|---|---|
| Compiling, reading artifacts, deriving tags | §1 | `sil-abi.js` |
| Building sigscripts, encoding state | §2 | `sil-encoder.js` |
| Addresses, covenant IDs, script formats | §3 | `kaspa-crypto.js` |
| Signing | §3.4–3.5 | `kaspa-sighash.js` |
| Assembling/broadcasting transactions | §4 | `kaspa-tx.js` |
| Debugging a rejection | §4.5–4.8 | `submitWithFeeDiscovery` |

The Bible restates a platform fact only as a language-level rule with a pins
citation — the full graded fact always lives in the pins. An uncited
restatement is drift: cite it or remove it.

---

## 6. Pattern Catalog

One entry per project archetype. Each: problem → minimal shape → tx
choreography → pitfalls → proof obligations. Source mines: the pixel-cove
v1–v13 `.sil` corpus, KCC20/KCC20Minter, OfferEscrow.

**How to use:** when starting a project, find the closest archetype, copy
its skeleton mentally, then diff your requirements against its pitfalls
list. The catalog is a checklist engine, not a code library.

### P0 — Genesis Bridge (wallet -> live covenant)

**Problem:** every pattern below assumes the covenant already exists.
This is the pattern that gets you there: deploy, advance, terminate -
with the transaction surgery owned by one record-driven toolchain,
not hand-built per spend.

**Shape:** the sillyscript scaffold (`silly init`): deploy.js /
interact.js / close.js over a shared lib.js, all driven by
data/deployment.json - the pointer chain. `txId` = birth certificate
(immutable); `currentStateTx` = live location (mutable - the dual-field
lineage discipline of 7.2, miniaturized); `pending` = crash marker
between broadcast and confirmation; `state` = current state (BigInts
as "1n" strings).

**Choreography:**
- deploy: compile (constructor args baked) -> pickUtxosSafe -> buildTx
  -> setGenesisCovenant AFTER build, BEFORE any signature -> wRPC
  broadcast -> write record with pending -> confirm -> adopt.
- interact: resolvePending -> find the covenant UTXO by creator txid
  AT THE CURRENT-STATE ADDRESS (setState first - addresses are
  state-derived) -> continuation output with the SAME covenant ID (the
  lineage) -> bind -> sign -> pending -> confirm -> adopt state.
- close: same, minus continuation; output 0 carries the FULL covenant
  input value to the owner P2PK; OpAuthOutputCount == 0 ends the
  lineage.

**Pitfalls (each session-proven, pins 11):**
- Bind-before-sign is load-bearing - covenant bindings live inside
  the sighash outputs hash; binding after signing silently invalidates
  every signature.
- A close entry comparing tx.outputs[0].scriptPubKey against concatenated
  bytes is bricked AT GENESIS (pins 3.3b corollary) - see the stranded
  Counter monument.
- Fee selection targets are not paid fees: txFee(tx) = inputs minus
  outputs is the only truth (11/S5). A change guard equal to the
  wallet UTXO size silently burns every change output (11/S7).
- Re-runnability is a design property: the current UTXO comes from the
  record, never a hardcoded txid or array position.

**Proofs:** two complete lifecycles on testnet-10, record-driven, zero
hand-edits - including an UNMODIFIED interact re-run (1->2) and close
from elevated state (count=2n). Txid citations: pins 3.3b.
### P1 — Singleton State Machine

**Problem:** one UTXO carries state that advances one step per spend
(counter, game tick, round-robin).

contract Counter(int initCount) {
    int count = initCount;
    entry step() {
        validateOutputState(0, State{ count: count + 1 });
    }
}

- DECL-perfect (`#[covenant.singleton(mode = transition)]`).
- Choreography: spend coin → output 0 = same template, count+1.
- Pitfalls: none structural. This is the teaching pattern — if your real
  problem is this shape, you overdesigned.
- Proofs: step N→N+1 accepted; wrong state rejected; termination (if any)
  rejected without `termination=allowed`.

### P2 — Timeout Escrow (TransferWithTimeout / Mecenas)

**Problem:** funds locked until a condition OR a timeout; two exits.

contract Escrow(pubkey recipient, pubkey sender, temporal timeout) {
    entry claim(sig recipientSig) { require(checkSig(recipientSig, recipient)); }
    entry refund(sig senderSig) {
        require(checkSig(senderSig, sender));
        require(tx.time >= timeout);
    }
}

- Handwritten (two independent exits, no continuation).
- Choreography: fund P2SH → claim anytime OR refund after `timeout`.
- Pitfalls:
  - **Fee realism** `[LAW]`: the TUTORIAL Mecenas hardcodes `minerFee=1000`
    and sub-dust outputs. Real constants: storage mass (limit 500000), mass-scaled fees
    (pins §4.5/§4.9; no flat dust floor). Never copy tutorial economics.
  - CLTV domain: `tx.time` values ≥ LOCK_TIME_THRESHOLD (§2.4).
- Proofs: claim before timeout ✓; refund before timeout ✗ (consensus CLTV
  rejects first — §1.6 layering); refund after ✓.

### P3 — Factory + Foreign-Template Spawn (SeriesFactory)

**Problem:** one covenant mints instances of ANOTHER contract, carrying
per-instance state (serial, owner).

contract Factory(byte[32] program_hash, pubkey artist, int price, ...) {
    int mints_left = INIT_MINTS;
    entry mint(byte[32] buyer, byte buyerScheme, int editionOutIdx, ...) {
        // handwritten — heterogeneous spawn (§3.7)
        require(mints_left > 0);
        // buyer wallet input pays price (checked via tx introspection)
        validateOutputStateWithTemplate(editionOutIdx, EditionState{...},
            EDITION_PREFIX, EDITION_SUFFIX, EDITION_HASH);
        validateOutputState(laneOutIdx, State{ mints_left: mints_left - 1, ... });
        // payment splits: artist cut ≥, treasury cut == (or zero-branch)
    }
}

- ALWAYS handwritten (the boundary). The factory redeem is a COMPOSITE:
  own logic + foreign template parts + inlined ctor arrays per reference
  site (§1.4) — mint sigscripts are heavy, mass scales accordingly.
- Choreography: [buyer wallet UTXO, factory lane] → [edition (new cov ID
  via `setGenesisCovenant`), lane continuation, artist cut, change].
- Pitfalls:
  - **Buyer scheme binding** `[LAW F-M1]`: the factory does NOT validate
    buyerScheme — anything ≠ 0 bricks every owner route of the edition.
    Builders must assert scheme=0 and 32B x-only pubkey.
  - **Value conservation** `[LAW audit MEDIUM]`: first minter could drain an
    overfunded genesis — `require(output.value ≥ input.value)`.
  - **Zero-royalty branch** `[LAW E-1]`: royalty_bips=0 bakes an
    unsellable series (zero-value artist output = consensus-invalid);
    enforce [1,2000] at the only writable entry (args generator).
  - **In-contract content hash**: bake `program_hash` and hash in-contract —
    never trust the minter script's claimed hash.
  - Serial uniqueness: outpoint-derived (`blake2b(domain‖outpoint)`) or
    counter-based; parallel-lane variant (P7) if throughput demands.
- Proofs: mint ✓ (+ value preserved), overfunded-drain ✗, wrong buyer key
  shape ✗, cap exhaustion ✗, close ✓, close-before-cap ✓ (v4 lesson —
  gate early close on nothing, unsold storage mass must be recoverable).

### P4 — Marketplace with Royalty Splits (Edition list/buy/sell)

**Problem:** owner lists; buyer pays; proceeds split owner/artist/platform
with EXACT on-chain enforcement.

entry list(int newPrice, sig ownerSig)     // set price, keep ownership
entry buy(byte[32] buyer, ...)              // pay splits, transfer ownership
entry sell(byte[32] buyer, int salePrice, ...)  // OTC: owner signs, buyer pays

- Handwritten; each entry is an ownership transition with payment checks.
- Choreography (buy): [edition, buyer wallet] → [edition(new owner, price=0),
  ownerOut ≥ ownerNet, artistOut == royalty, platformOut == fee].
- Pitfalls:
  - **Output-index aliasing** `[LAW]`: artistOutIdx == platformOutIdx lets
    one output masquerade as two splits. First failing require:
    distinctness guard. Proven both directions on-chain (idx 1,2,3 ✓;
    1,2,2 ✗).
  - **Exact-equality vs ≥**: royalty/fee `==` (overpay breaks exactness),
    owner net `≥` (change tolerated). Decide per output, deliberately.
  - **Zero-price sell** needs conditional payment outputs (skip zero-value
    dust) — builder-side gap that trapped a listed edition once.
  - **Arg order is ABI-committed** (pins §1.1) — the v4→v5 rotation class.
  - Mempool sniping: an underpriced listing can be front-run; accepted risk
    (seller always receives full price) unless commit-reveal is added.
- Proofs: 3-way split ✓ (each output exact), aliased ✗, wrong split ✗,
  insufficient payment ✗, royalty=0 branch ✓ (no dust output).

### P5 — Offer Escrow with Permissionless Expiry

**Problem:** buyer locks an offer; owner accepts OR anyone refunds after
expiry. Two exits, funds custody in a covenant.

contract Offer(int askPrice, int mktFee, int expireAge, byte[32] edCovId) {
    entry accept(...) {   // edition co-spend via permissionless buy route
        // ownerNet ≥, royalty ==, mktFee ==
        // bait-and-switch guard: prevEd.price == askPrice
        // edition continuation validated WithInputTemplate
    }
    entry expire() {      // NO signature — permissionless
        require(this.ageDaa >= expireAge);   // consensus CSV + script check (§2.4)
    }
}

- Handwritten; escrow input's sigscript carries NO sig for expire —
  authority is age + sequence lock.
- Choreography: [buyer funds escrow] → accept: [escrow, edition] → [edition
  (new owner), owner/artist/mkt outputs]; OR expire: [escrow] → [buyer refund].
- Pitfalls:
  - **Refund destination hardcoded to outputs[0]** (F-A5 class) — fine when
    there's exactly one output; brittle if the shape grows.
  - **Offer-vs-listing staleness**: assert `BigInt(ed.price) === askPrice`
    before locking funds, or offers against stale ledger entries trap
    funds until expiry.
  - Escrow termination = accept ends it (`OpAuthOutputCount==0` observed
    on-chain) — no continuation output on the accept path.
  - Two-layer liveness (§2.4): consensus sequence lock rejects BEFORE
    script; `this.ageDaa` is the in-script backstop.
- Proofs: accept ✓ (splits exact, edition co-spent, escrow terminated),
  expire-before-age ✗ (consensus rejection message ≠ script failure),
  expire-after ✓ (no signature required — the negative test IS the proof).

### P6 — Fungible Token + Issuance Controller (KCC20 + KCC20Minter)

**Problem:** a token state machine owned by keys/scripts/covenants, with
issuance policy externalized into a separate controller.

// KCC20: token state = {ownerIdentifier, identifierType, amount, isMinter}
#[covenant(binding = cov, from = maxIn, to = maxOut)]
function transfer(State[] prev, State[] next, sig[] sigs, byte[] witnesses) {
    checkSigs(prev, sigs, witnesses);      // three ownership modes (§1.8)
    checkAmounts(prev, next);              // conservation when !isMinter
    checkMintingTransfer(next);            // non-minters can't mint minters
}

// Minter: {kcc20Covid, amount(allowance), initialized}
#[covenant.singleton]
function init(State prev, State next, sig s) {
    require(!initialized);
    require(next.kcc20Covid == OpOutputCovenantId(0));  // §3.6 binding
    require(checkSig(s, owner));
}
function mint(State prev, State next, sig s, TokenState minterNext, TokenState recipNext) {
    require(OpCovInputCount(kcc20Covid) == 1 && OpCovOutputCount(kcc20Covid) == 2);
    // template metadata pattern (§3.5) validates both token outputs
    // issuance accounting: allowance -= (minterNext+recipNext - prevAmount)
}

- DECL-native (leader + delegate, homogeneous family). The minter's mint
  is a singleton that orchestrates the FOREIGN covenant group — legal
  because the minter's OWN input is 1:1; the token group is validated by
  OpCov* bookkeeping, not by the minter's auth wrapper.
- Choreography: fund minter genesis → init tx creates token + binds minter
  (A and C in one tx) → mints co-spend [token minter-branch, controller] →
  [token minter-branch(0), token recipient, controller(allowance-n)].
- Pitfalls:
  - **Leader must be covenant input 0** — merge tests put the leader
    sigscript on input 0, delegate (empty args) on input 1. Ordering is
    load-bearing (§4.6).
  - Conservation is BRANCH-scoped: ordinary branches conserve, minter
    branches don't. An ordinary branch setting `isMinter=true` must be
    rejected — the escape everyone writes first.
  - Struct-array args are column-grouped (owners|types|amounts|isMinter) —
    the KCC1 codec pin (pins §2.2).
  - ICC has no eval: "owned by covenant C" is PROVEN by co-spending an
    input with covenant ID C (§1.8). Nothing else counts as ownership.
- Proofs: split/merge conserve supply ✓✗; wrong-key merge ✗; over-mint ✗
  (allowance exhausted); ordinary→minter promotion ✗; init re-binding ✗.

### P7 — Parallel Mint Lanes (SeriesFactory v7+)

**Problem:** mint throughput capped by one lane's sequential spends; forks
allow concurrent mints with disjoint UTXO sets.

// state: immutable series fields + per-lane mints_left (NO global counter)
entry fork(sig artistSig, int leftMints, int rightMints) {
    require(checkSig(artistSig, artist));
    require(leftMints + rightMints == mints_left);   // conservation
    // validateOutputState both children
}
// serial = LE63(blake2b("domain" || laneOutpoint || le32 idx)), computed
// IN-CONTRACT as unsigned polynomial with top bit masked — globally unique
// without shared state.

- Choreography: artist forks lanes ahead of demand; buyers mint from any
  lane concurrently; cap invariant = CAP − Σ(live lanes' mints_left).
- Pitfalls:
  - **Serial determinism**: outpoint-derived serials must be recomputed by
    verifiers from the CONSUMED outpoint — keep mintTxId immutable in
    ledgers (the dual-field lineage model).
  - Fork conservation must be exact (left+right == mints_left) — an
    off-by-one silently mints beyond cap.
  - Untracked lanes accumulate (the series-A straggler) — every deployed
    lane goes in a deployments registry with status.
- Proofs: fork 2+2 from 4 ✓; two concurrent mints, disjoint UTXOs, unique
  serials ✓✓; cap invariant holds across all lanes.

### P8 — Data Commitment & Reveal (art chunks)

**Problem:** store content larger than any single state span on-chain,
trustlessly retrievable.

// Genesis: N P2SH "art chunk" outputs, each carrying 2KB (or up to 64KB)
//   of the payload + a P2SH factory carrying only blake2b(payload)
// Reveal: spend chunk outputs — raw data EXPOSED in sigscripts, mass reclaimed
// Mint: spends only the lightweight factory (program_hash = 32B in state)

- Retrieval (gallery): reveal txs → per-input sigscript pushes → last push
  = chunk redeem → first redeem push = payload → concat → blake2b ==
  program_hash extracted FROM CHAIN (mint input 0 sigscript → factory
  redeem → state field 0). Registry entries are untrusted hints.
- Pitfalls:
  - **Mass-dependent reveal floor** `[PIN pins §4.5]`: 8 chunks rejected at 0.02 KAS,
    accepted at 1 KAS; chunked (4×2) converged at ~0.045 KAS/group via fee
    discovery. Chunk and discover per group.
  - **Pre-reveal state is unreadable** (§1.3): guard redeem parsing with
    template-hash verification, never "last push" heuristics.
  - Scaling law: total = N_chunks × chunk_size; per-chunk cap 65535B
    (PUSHDATA2), per-sigscript cap 250KB. The 2KB wall is gone.
  - Pruning: chunk DATA survives in sigscripts; state reads should anchor
    to the live UTXO set, archival fallback labeled as weaker.
- Proofs: reveal exposes all bytes ✓; blake2b(concat) == on-chain hash ✓;
  tampered chunk ✗ (hash gate hard-fails); wrong pointer ✗.

### P9 — Generative Engine in Template (v10)

**Problem:** art recomputed from authenticated inputs — pruning-proof,
zero retrieval dependency.

// engine code (~900B–32KB integer-only JS) baked as ctor param
// state carries only: program_hash, render_hash, engine_lang (+ economics)
// seed = edition serial (immutable-fields-only rule: art invariant under resale)

- The render pipeline: engine + serial → deterministic art. No reveal, no
  external storage: content survives pruning BY CONSTRUCTION.
- Pitfalls:
  - **Compiler elision** `[LAW §2.6]`: `require(blake2b(engine)==hash)`
    folds to tautology — constant-folded away, engine dropped, bytecode
    unchanged. Bake anchor: mix engine bytes with a runtime outpoint.
  - **byte[] state fields rejected** at fixed-width revisions — engine must
    be TEMPLATE data (ctor param), never runtime state.
  - Engine cost law `[PIN pins §4.5]`: transient mass = 2×tx_bytes; mint sigscript
    ≈ factory bc + 46; consensus ceiling ≈ 42KB engine at 100k mass.
  - Display adapters live OUTSIDE the anchored artifact (the viewBox-only
    SVG incident) — never churn anchored bytes for rendering bugs.
  - Serial → seed via exact BigInt (`BigInt(serial) & 0xFFFFFFFFn`); the
    Number() path double-rounds 61-bit serials.
- Proofs: same serial → identical render ✓; render matches render_hash ✓;
  verifier's engine-containment gate (F1) reads engine bytes from the
  on-chain redeem ✓.

### P10 — Oracle & ZK Routes (sketch tier)

**Problem:** bring off-chain truth or succinct proofs on-chain.

- **Oracle**: contract bakes oracle pubkey; off-chain signer publishes
  `(message, datasig)`. Contract: `require(checkMsgSig(datasig,
  sha256(message), oraclePk))` then requires over message fields. Design
  choice: message IS the arg (signed data visible on-chain) vs hash
  preimage pattern.
- **ZK**: `g16.verify(verifyingKey, proof, publicInputs...)` — Groth16 at
  consensus. Binds computation to public inputs (serials, program_hash).
  Note the parser gap: expression statements to push operands before the
  opcode aren't in the language yet — operand order is builder-critical.
- Pitfalls (projected, [TODO-verify] until first on-chain proof):
  proof/vk sizes count against mass; verify cost against compute budget;
  nothing currently enforces operand-push order — a verifier contract
  should hash its vk and require it to prevent substitution.
- Proof obligations: valid proof accepted; wrong public input ✗; proof for
  different statement ✗.

---

### 6.1 Choosing and combining archetypes

Real projects are compositions: Reliks = P3+P4+P5+P7+P9 with P8 replaced by
P9's in-template engine; KCC20 is P6 standalone. Composition rules:

- Each covenant in a composition keeps ITS OWN boundary decision (§3.7) —
  a factory (handwritten) can co-spend with a token (DECL).
- Cross-contract composition = same-tx co-spend + template metadata (§3.5)
  + covenant-ID ownership (§1.8). No other mechanism exists.
- Payment algebra composes: P4's split checks and P5's escrow accounting
  are the same require-pattern applied to different input sets.
- State discipline composes: immutable mint fields (P9) + mutable location
  fields (dual-field lineage) is one struct, two lifetimes.

---

## 7. Workflow Protocol

The lifecycle every SilverScript project follows. Each stage has a gate;
skipping a gate is how incidents are born.

### 7.1 Stage gates

1. DESIGN      → archetype chosen (§6), boundary decided (§3.7),
                 economics sanity-checked (storage mass and fee, no flat dust floor — §4.5/§4.9)
2. AUTHOR      → contract + args generator with validation at the only
                 writable entry point (E-1/F-M2 class: dead-series configs
                 rejected before genesis)
3. COMPILE     → silverc; artifact shape recorded (era + git rev);
                 verify-tags.js green
4. REHEARSE     → smoke test on testnet (first-spend of new covenant logic, destructive paths); standard operations on mainnet per SAFETY.md — positive AND negative proofs
                 same-session (rule 0.7), ledger↔chain consistency check
5. AUDIT       → external review; findings accepted-with-fix or
                 rejected-with-rationale (both recorded); remediation
                 re-proven on-chain
6. MAINNET     → overnight cool-down (rule 0.10) → checklist → genesis →
                 verify-editions green (pixel-cove-era tool — use the repo artifact gates when absent) → gallery trustless render
7. OPERATE     → dual-field lineage discipline; every deployed covenant
                 in the deployments registry; confirmations gated

### 7.2 The ledger discipline

The ledger is a shadow of the chain; the chain is the truth. Therefore:

- **Immutable vs mutable location**: `mintTxId/mintIndex` written once at
  mint (lineage, serial recomputation, F1 gates read these); `txId/index`
  updated on every transition (spending, live-UTXO anchoring). Never
  conflate them — a traded edition's lineage points at the MINT tx.
- **Write only after confirmation** (F-07): waitForConfirmation before any
  ledger mutation; orphans otherwise desync the shadow.
- **Drift guard before signing**: recompute the expected redeem, compare
  against ledger spk; refuse on mismatch (F-B17/F-B18 class).
- **Env-scoped ledgers**: retargeting ABI/ledger paths without retargeting
  args paths silently bakes the PREVIOUS series' supply (INIT_MINTS) —
  canonical supply = ledger series.mints_left; args[4] must agree.
- **spk normalization**: hex-of-hex quirks tolerated at read, normalized at
  write; chain-anchored checks unaffected.

### 7.3 Deployments registry

Every covenant ever deployed, with status — tracked | untracked | retired |
monument | frozen. Strays (series-A's lane, stranded offers, probe dust)
are fine on testnet; on mainnet each is real money. A `deployments.json`
checked by the verifier prevents quiet accumulation. DO-NOT-CLOSE decisions
(monuments) are recorded WITH their rationale.

### 7.4 The proof-obligation template

Every route ships with, minimum:

POSITIVE: the happy path accepted, on-chain, txid recorded
NEGATIVE: each pitfall's guard rejecting, on-chain or preflight
STATE:    verifier recomputes P2SH(ledger-state redeem) == tracked spk for all
          tracked instances
TRUST:    if a UI exists: trustless render chain, refuse-on-mismatch,
          registry = hint only

Consensus rejections are certificates (the orphan/fee/sequence messages
prove the consensus layer enforced); script failures prove the covenant
layer. Classify which layer each proof exercised.

### 7.5 Error triage table

| Symptom | Layer | First check |
|---|---|---|
| "request deserialization error" | wire | Schema mismatch — getBlock ground-truth probe (§0.3); wRPC vs REST format (pins §10.1) |
| "script ran, but verification failed" | script | tag derivation? arg order (ABI, not memory)? state encoding byte-exact? aliasing guard fired? |
| "script-units limit=9999" | wire (root) | compute_budget field-dropped at submission (testnet REST) — use wRPC; surfaces as a consensus rejection |
| "required fee of X" | consensus | feeLoop: parse, +10%, rebuild |
| "sequence locks conditions was not met" | consensus | CSV age vs this.ageDaa — two-layer (§2.4) |
| "orphan where orphan is disallowed" | consensus | parent unconfirmed — wait for block, re-anchor UTXO |
| Tag matches, state matches, still fails | script | param SLOT binding: v4-clone class — derive from ABI (rule 0.1) |
| Compiles, deploys, can't continue | design | byte[] state at fixed-width revision? scheme≠0 baked (F-M1)? zero-royalty (E-1)? |

---

## Appendix A — Provenance & Maintenance Rules

1. Facts live in exactly ONE place (pins for platform, Bible for model/
   patterns/methodology). Duplication is how the old session brief (HANDOFF.md — deleted 2026-10-07; git history keeps it) rotted.
2. Every fact carries a grade ([SPEC]/[REF]/[PIN]/[LAW]/[TODO-verify]).
3. [TODO-verify] facts graduate by probe only, never silently.
4. On silverc upgrade: recompile canonical contracts → diff artifacts
   (everything but compiler_version) → verify-tags.js → any drift = audit
   every pin (pins Appendix B).
5. On network/API drift: re-run probes; a failed probe invalidates its pin
   BEFORE it poisons a build (rule 0.11).
6. New incidents enter the pins incident registry (§11 current; §6 historical) with root cause + law; if the law is
   behavioral (how an agent must act), it also enters §0.
7. Append-only history lives in git; the canon stays curated. Splitting
   docs by function (Bible/pins/library) replaces splitting by time.

## Appendix B — Glossary (pinned vocabulary, rule 0.9)

- **Redeem**: the FULL prefix‖state‖suffix script. **State**: only the
  middle span. Never interchangeable.
- **Covenant ID**: lineage identity computed at genesis, carried by
  declaration — not a content hash.
- **Lane / mint branch**: this stack's parallel-mint UTXO (NOT KIP-21
  subnetwork lanes).
- **Auth output / covenant output**: authorized-by-input vs bound-to-ID —
  different counts, different opcodes.
- **Leader / delegate**: covenant-group input 0 / non-0 participants.
- **Template**: prefix+suffix (immutable per instance); **template
  metadata**: (prefixLen, suffixLen, hash) triplet for foreign reads.
- **Composite factory**: a factory redeem embedding foreign template parts
  and inlined ctor arrays (§1.4).
- **E-*/F-* labels**: finding labels from the external-audit and gauntlet eras
  (E-1 zero-royalty, F-M1 buyer-scheme binding, F-B14 storage mass, F-07
  ledger-write) — each cited where its law appears in the patterns.
- **ICC**: inter-covenant composition — §1.8's co-spend semantics; there is no eval.

## Appendix C — Lineage index (proof artifacts)

v1 frozen (buy scheme-brick) · v2 closed-by-design · v3-cap2 closed · v3
live · v4 proof-closed (early close fix) · v5 multi-chunk 16KB · v6 DECL
boundary probe (archived) · v7 parallel lanes · v8 audited economics · v10
generative engine · v11 treasury model · v13 current (4-param mint, 7-field
state). KCC20 + PixelToken/PixelMinter + OfferEscrow v1–v6 as composition
proofs. Mainnet: genesis f6ebb717…, lane 63fccd99… (open monument),
edition 23b4157d…, serial 1643293157957497133.

sillyscript scaffold era (Oct 5): two closed lifecycles on
testnet-10 (citations pins 3.3b) + the stranded Counter monument
e1f2f6a8... (bricked close - pins 3.3b corollary).

## Appendix D — Self-assessment (Bible graded by its own §0)

- §0 rules each trace to registry incidents or burned rounds ✓ (0.4 —
  this file itself is graded).
- Platform facts delegated, not duplicated ✓ (0.1 for documents: derive,
  never clone).
- P10 honestly marked [TODO-verify] ✓ (0.3 — no probe yet, no canon).
- Patterns carry pitfalls mined from real audit findings, not invented ✓
  (0.2 — fail-closed: a pattern without a proven pitfall says so).
- Gauntlet validation: the fresh-session gauntlet ran and PROVED the core
  vertical (ABI → encoder → crypto → sighash → tx → broadcast → confirm)
  on testnet-10. Genesis tx b3a9ea5b… confirmed. The documentation
  prevented the ABI/codec/crypto classes of failure entirely — zero
  incidents in those layers. The failures that did occur (wRPC schema,
  sequence mechanics, UTXO parsing) were in layers the docs didn't cover
  — all now pinned (pins §10) and kit-fixed (kit-era fixes, since ported).
- Rule 0.3 was violated for 15 rounds before being followed for 1 — the
  reinforcement is now embedded in §0.3 itself. Rules work; the challenge
  is trigger recognition, which the gauntlet data now sharpens.

Known gaps: DECL lowering internals summarized from one compiler era -
re-diff on upgrade; 1.4 composite-sizing quantified on two contract
families (v11, v13); 7.1 stage 4 (REHEARSE) already cites SAFETY.md's mainnet-first
strategy; the other stages were not re-audited against it. Closed Oct 5: the P0 genesis-bridge gap (P0
now in §6, twice lifecycle-proven via the scaffold); verification gates
are count-free with Files-Manifest.md owning all counts.

**Status: partially verified.** The core vertical claim is proven; the
completeness claim is tested and known-imperfect — patched for the
gauntlet's findings, awaiting the next gauntlet to find the next class.

