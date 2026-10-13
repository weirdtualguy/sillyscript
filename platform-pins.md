# platform-pins.md — Kaspa / SilverScript Verified Facts

The verified-facts layer of the sillyscript package. Every fact is graded, evidenced, and probe-verifiable.
Load this + SillyBible.md + the sillyscript library: a fresh session has everything, without the debugging rounds that learned it.

Grades:
- [REF] verified against source code at a pinned commit
- [PIN] verified empirically against production data (mainnet/testnet/chain)
- [LAW] derived rule backed by a real incident
- [TODO] unverified — never rely on these

Re-verify before any session:
    cd ~/sillyscript
    npm test 2>&1 | grep -E 'ALL [0-9]+ PASS|FAIL'
    # expect: module PASS lines, zero FAIL - counts owned by Files-Manifest.md
Network check: curl -s -o /dev/null -w "%{http_code}" https://api.kaspa.org/transactions/f6ebb717e04384770a833e87c8c7b5c3b8ff57adf4c1cda0f6c1aa097af2dc55

---

## 1. Compiler & ABI

### 1.1 Dispatch tags [REF c7d17a1 + PIN 24/24 artifacts]

    tag = blake3("entryName(type1,type2,...)")[0..4]

Unkeyed blake3, first 4 bytes. Param NAMES invisible; order/types/count committed.
Entry rename (incl. name=/delegate_name= overrides) rotates the tag.

Type rendering in the preimage (post-#223, i.e. c7d17a1 and later):

| Type | Renders as |
|---|---|
| int, temporal, bool, byte, string, pubkey, sig, datasig | the keyword itself |
| byte[] dynamic | byte[] |
| byte[N] fixed | byte[N] |
| struct (incl. State) | {field1,field2,...} — braces, comma-joined, recursive, NO spaces |
| array of T | T's rendering + [] or [N] appended after |
| no params | name() |

Revision boundary [REF git history]:
- Pre-#223 (before Aug 27 2026): structs render as their bare NAME.
- Post-#223: structs render as {fields}.
- Scalar-only signatures are IDENTICAL across the boundary.
- compiler_version "0.1.0" never discriminates revisions. The git hash does.

Tag rotation semantics [LAW]:
  param rename: NO | reorder/add/remove/retype: YES | entry rename: YES
  struct rename: NO (post-#223) | struct field add/remove/reorder/retype: YES

Evidence: 24/24 stored tags across 6 production artifacts (v4, v5, v6 edition,
v11 factory, PixelToken, PixelMinter) + v13 gauntlet. The v4-to-v5 tag rotation
incident reproduces exactly from the formula.
Probe: probes/verify-tags.js

### 1.2 Template hash [REF c7d17a1 + PIN 6/6 artifacts]

    template_hash = blake3( u64le(len prefix) | prefix | u64le(len suffix) | suffix )

Lengths bind the state boundary — you cannot shift state bytes without changing the hash.
Golden vector: empty/empty parts = e572dff82304700b856a555ac3a4558d0df3646a3727816500270a93c66aac1e

### 1.3 Bytecode layout [REF c7d17a1 compile.rs]

    [TOALTSTACK 0x6b]                   stateful only
    [state pushes — one EXPLICIT push per field, never OP_1..16]
    [FROMALTSTACK 0x6c]                 stateful only
    [dispatch cascade: per entry:
       DUP | DATA_4 <tag> | EQUAL | IF | DROP | <body> | ELSE ]
    innermost ELSE -> OP_RETURN (fail); then ENDIF x N

- State span offset = 1 when stateful (the TOALTSTACK byte), {0,0} when stateless.
- No tag match -> falls through to OP_RETURN -> execution fails.
- Tag collisions are compile-time errors.
- Contracts using validateOutputState compile via fixpoint loop (seed 100B, max 32 rounds).

### 1.4 Artifact schema [REF c7d17a1]

New format (post-#232, Aug 28 2026 — what ~/bin/silverc produces):
    schema_version: 1, compiler_version, structs{name:{fields}},
    contracts{ NAME: {
      source_path (SYNTHESIZED "sil/NAME.sil" — not the real path),
      runtime_state{source:"State", fields},
      entries{ name: {dispatch_tag: "hex8", params:[{name,type}]} },
      cov_decl_to_abi{declName: entryName}, delegate_entry_abi,
      compiled{ bytecode:[ints], template_hash:[32 ints], state_span{offset,len} } } }

Type kinds (snake_case JSON): int temporal bool byte bytes string pubkey sig datasig
  fixed_bytes{len} fixed_array{item,len} dynamic_array{item} struct{name}

Old format (pre-#232): {contract_name, bytecode, ast (embedded), abi:[{name,
inputs:[{name,type_name}]}], state_layout:{start,len}} — NO stored tags; derive
them from abi[].inputs[].type_name strings.

### 1.5 silverc CLI [REF both revisions]

    silverc c.sil [-o out.json] [-c stdout] [--constructor-args args.json] [--ast-only]

- No --version flag (errors). Version identity = artifact string + git rev only.
- Deterministic output (asserted in-compiler: compiles twice, compares).
- Error prefixes: "parse error:" / "failed to parse constructor args" / "compile error:".

### 1.6 Compiler provenance [PIN session]

| Path | Rev | Role |
|---|---|---|
| ~/opt/silverscript | c7d17a1 (Aug 30) | PRODUCTION — source of ~/bin/silverc; local patches touch only debugger CLI + Cargo deps, compiler core untouched |
| ~/silverscript | 28a16f0 (Aug 25) | Reference clone, NOT the production toolchain |

[LAW] Record which compiler built each artifact. Artifact shape (old vs new format)
discriminates; compiler_version does not.

### 1.7 Constructor-arg baking [REF mod.rs]

- Args bake into the genesis state at compile time. No deployment-time parameterization exists.
- Unreferenced constructor params are DROPPED — pure expressions over them constant-fold
  to tautologies (the v10 engine-elision incident).
- To force materialization: mix the param with a runtime value (bake-anchor trick:
  blake2b(param + OpOutpointTxId(...)) != zeros).
- Params shadow same-named constants. Field initializers see constants + params,
  NOT earlier fields (codegen path — the debug resolver differs; do not rely on it).

### 1.8 DECL lowering — boundary rules [LAW]

- Auth-bound 1:1 wrappers unconditionally emit require(OpAuthOutputCount == 1) plus a
  single same-template validateOutputState. A factory input authorizing BOTH its
  continuation AND a spawned Edition (count=2) ABORTS. Heterogeneous spawn requires
  handwritten entrypoints + validateOutputStateWithTemplate.
- Leader = covenant-group input 0; delegate must NOT be input 0. Input ordering
  within the covenant group is load-bearing.
- new_states[k] maps to OpCovOutputIdx(cov_id, k) — covenant-family output position.
- from/to double as loop unroll bounds — bytecode scales linearly with fan-in/out.
- Stateless contracts reject transition mode outright (error text contains the typo
  "tranisition" — match on it if classifying errors).

### 1.9 validateOutputState semantics [REF state.rs]

- Same-template: copies prefix/suffix from the SPENT INPUT's own sigscript
  (self-referential — no hash check; the P2SH commitment already authenticated them).
- WithTemplate: checks blake3(u64le(len p)|p|u64le(len s)|s) == expected_template_hash
  FIRST, then the P2SH equality.
- WithInputTemplate: extracts template bytes from a co-spent input's sigscript,
  verifies against expected hash, then validates the output.
- All three reconstruct prefix | encode(new_state) | suffix, hash to P2SH spk,
  require output_spk(idx) == that spk.
- Redeem = LAST bytecode_size bytes of the sigscript. base = sigscript_len - bytecode_size.

### 1.10 State field constraints [REF 28a16f0 state.rs]

- At 28a16f0: state fields must be FIXED-WIDTH (fixed_type_size returns Some).
  byte[]/dynamic fields -> compile error "validateOutputState does not support field type byte[]".
- Post-Aug 30 upstream: variable-width state allowed. CHECK YOUR REVISION before using dynamic state.
- Int state: always 8-byte script number (sign-magnitude LE). Bool state: 1 byte, 0 or 1 only.

---

## 2. Codec — Encoding & Decoding

### 2.1 The unifying encoding law [REF argent abi crate]

Scalar top-level args use MINIMAL pushes. Every aggregation boundary (array
element, struct field, state leaf) switches to fixed-width payload concatenation.
State is fixed-width + explicit-push everywhere.

### 2.2 Sigscript arg encoding [REF + PIN]

| Param type | Encoding |
|---|---|
| int/temporal | minimal script number: 0->OP_0, 1-16->OP_1..16, -1->OP_1NEGATE, else OP_DATA_N + LE sign-magnitude |
| bool | as int 0/1 -> OP_0 / OP_1 |
| byte | raw data push (minimal: values 1-16 use OP_N) |
| bytes/string | data push; empty -> OP_0 |
| pubkey/sig/datasig/byte[N] | data push of exactly 32/65/64/N bytes |
| T[]/T[N] scalar | ONE push, elements' fixed payloads concatenated |
| struct S | one push per field, declaration order, each field as top-level arg |
| S[]/S[N] | column-grouped: one push per struct field, each = all elements' values for that field concatenated |

Then OP_DATA_4 + dispatch tag. Then the redeem push (caller appends).

### 2.3 State encoding [REF + PIN]

| Field type | Payload | Push |
|---|---|---|
| int/temporal | always 8-byte script number | one explicit push |
| bool | 1 byte (0 or 1) | one explicit push |
| byte | 1 byte | one explicit push |
| bytes/string | raw, variable width | length-minimal push |
| pubkey/sig/datasig/byte[N] | fixed bytes | one push |
| struct | flattened to leaves, one push per leaf | |
| struct array | column-grouped per leaf type | |

Canonicality: re-encode(decode(x)) == x. Push framing length-minimal.
Small-int opcodes (OP_1..16, OP_1NEGATE) INVALID in state spans.

### 2.4 Edge cases [LAW — each cost a debugging round]

- byte 0 -> OP_DATA_1 0x00. NOT OP_0 (which pushes EMPTY). These differ.
- int 0 -> OP_0 (empty push — minimal script number for zero).
- byte 1-16 -> OP_1-OP_16 via minimal push (same stack value as OP_DATA_1 N).
- i64::MIN unrepresentable — needs 9-byte script number; VM limit is 8.
  Both arg and state paths reject it. Valid int domain: [i64::MIN+1, i64::MAX].
- Redeem push header: ~15.7KB redeem -> PUSHDATA2 = 3-byte header. Parsing a
  sigscript backwards from the redeem must account for 1/2/3/5 header bytes.

### 2.5 Canonical vectors [REF argent tests]

Args [Int(17), Bytes(01020304), Bool(true), Byte(1)] + tag 2c49ed65
-> hex 011104010203045151042c49ed65

State {fixed_bytes[32](07x32), int(-5), bool(true)}
-> hex 20<07x32>08050000000000008001 01

---

## 3. Crypto

### 3.1 Bech32 addresses [PIN + REF rusty-kaspa]

Kaspa bech32 is NEITHER BIP-173 NOR CashAddr — a hybrid:
- prefix5 = [c & 0x1f for c in hrp] — NO >>5 upper half, NO lower-bits append
- payload = [version] + body (v0 = P2PK 32B schnorr x-only; v8 = P2SH 32B script hash)
- polymod input = prefix5 + [0] + payload5 + [0 x8]; init c=1
- GEN = CashAddr 40-bit: [0x98f2bc8e61, 0x79b76d99e2, 0xf33e5fb3c4, 0xae2eabe2a8, 0x1e4f43e470]
- result ^ 1; checksum = conv8to5(polymod.to_be_bytes()[3..]) -> 8 chars
- charset qpzry9x8gf2tvdw0s3jn54khce6mua7l, separator ':'
- kaspa P2PK = 67 chars; kaspatest = 71 chars

WRONG-ASSUMPTIONS: BIP-173 hrp expansion; CashAddr lower-bits append.
A 144-variant brute force of standard combos FAILS. Do not guess; use kaspa-crypto.js.

### 3.2 Covenant ID — KIP-20 [PIN mainnet-verified]

    covenant_id = keyed_blake2b(key='CovenantID', 32B out) over:
        authTxid[32B]         <- REST txid hex-decoded AS-IS (no reversal)
  + u32le(authIndex)   <- authorizing input's PREVIOUS OUTPOINT index [PIN 2026-10-07,
     testnet-10 vectors (exclude "position"; see caveat) bd4085b1…→b324dc5b… and 60579a71…→230551a6…
     (authInputPos=0, prevOutpointIndex=2; both also have 2 inputs and funding index 2, so a third vector with an index outside {0,2} is still wanted [OPEN, audit 12]); probe probes/resolve-authindex.js (traces continuations back to their genesis);
     code-corroborated by setGenesisCovenant + validate-mainnet.js] NOT the
     input's POSITION — the position is the binding field covenant_authorizing_input
     (4.1), which only LOCATES the input in tx.inputs.
      + u64le(outputCount)
      + per-output: u32le(outIdx) + u64le(value) + u16le(scriptVersion=0)
                     + u64le(scriptLen) + script bytes (aa20.. format, no version prefix)

Evidence: computed from mainnet REST data, matched on-chain covenant_id for
genesis f6ebb717... -> lane 63fccd99...
Probe: probes/validate-mainnet.js

[REF argent PR#66, Oct 2026 - text-level]: argent-genesis computes the same
preimage by calling Kaspa consensus covenant_id directly (preimage.rs) -
external corroboration of this port. Its sil proof layer is the same
composition sillyscript already owns (loadArtifact + state encode + redeem
+ p2shSpk + covenant ID): a JS genesis-verify port is composition, not new
verification logic. Execution cross-check pending an argentc Termux build.

### 3.3 Script public key formats [PIN mainnet REST]

| Type | Bytes | Format |
|---|---|---|
| P2SH spk | 35 | aa20 + blake2b32(redeem) + 87 |
| P2PK spk | 34 | 20 + pubkey[32] + ac |

[LAW] The 0000 version prefix is NOT part of the script bytes. REST strips it
on retrieval; the sighash encodes it as a separate u16(0) field. Submission
carries it as scriptPublicKey: {version: 0, scriptPublicKey: "aa20..."}. A fourth context — in-script introspection — PREPENDING the version to the value (§3.3b).
WRONG-ASSUMPTION that cost a debugging round: "0000b920...87" — wrong opcode
(b9 vs aa) AND wrong prefix assumption.

### 3.3b Introspection scriptPubKey carries the version [PIN — close-incident, Oct 5 session]

`tx.outputs[N].scriptPubKey` INSIDE SilverScript = 2B version (00 00) +
script bytes → 36B P2PK, 37B P2SH. The FOURTH context for the version
prefix (§3.3 documents the other three):

| Context | Where the version lives | P2PK form |
|---|---|---|
| Script bytes (covenant-ID preimage, REST retrieval — §3.3) | absent | 34B |
| v1 sighash preimage (§3.4) | separate u16le(scriptVersion) field | 34B script + u16 |
| REST submission (§4.1) | object member {version: 0, scriptPublicKey} | — |
| wRPC submission (§10.1) | inside the flat hex string "0000"+hex | 36B hex |
| In-script introspection `tx.outputs[N].scriptPubKey` | PREPENDED to the value | 36B |

`new ScriptPubKeyP2PK(pubkey)` returns byte[36]; `new ScriptPubKeyP2SH(hash)`
returns byte[37] — both match introspection byte-for-byte. Manual
concatenation (byte[]{32} + byte[32](pk) + byte[]{172} = 34B) NEVER
matches, and the failure is silent: no rejection names the length.

[LAW] Never construct an expected scriptPubKey by byte concatenation.
Use the constructors, or hash-verify via the P2SH path.

Evidence [PIN - confirmed by script archaeology]: the original Counter
covenant (testnet-10, ID
e1f2f6a8c18dc294e7c747cbce3454d0056bebd126af1996ed96171d224df929) was
deployed with a hand-built 34B comparison baked into its close entry.
Every close attempt failed while increments on the SAME covenant
succeeded. The variant binary search closed CounterA (minimal close)
and CounterC (value-check-only) on-chain - isolating the spk equality
as the failing require. The fix required a NEW GENESIS (Bible rule 0.6 -
different template): the redeployed Counter closed on-chain (handoff
txid 5d437bf7...). The handoff close table duplicated that txid - the
original close has NO txid because none can exist.

[LAW corollary - bricking]: a hand-concatenated spk equality baked into
a termination entry makes the exit PERMANENTLY unsatisfiable - detectable
only at first close attempt, fixable only by redeployment. The original
Counter is stranded: 99,800,000 sompi locked at state count=2n (increment
requires count<100; close is bricked). Recorded as a monument (Bible 7.3):
test-run/data/deployment.json status=stranded.

Second proof - scaffold acceptance lifecycle (2026-10-05, testnet-10,
record-driven, zero hand-edits, all confirmed on-chain):
  genesis    bd4085b147152238bb7a0d49273e1eaee9cfcea223dd090b5fad7bdf68db6491
  increment  f80152c05f21a35fbec85242d3b12dc171ec81523fdd5baf73f39bfbbcb1eae6  (0->1)
  increment  53d5d32a876a0b6b316d6fbf826f144c43b26b3d58d61e8a652ad2b73313d029  (1->2, unmodified re-run)
  close      ec8ee7190fa20b699aefb5b2810e49c76a00cf7c4061caa205d2f4fc38ef72da  (from count=2n)
First close-from-elevated-state and first unmodified interact re-run in
project history. Close input computeBudget 60 confirmed at count=2n.
Continuation outputs of 99,900,000 / 99,800,000 sompi created AND spent:
outputs below 1 KAS are consensus-valid (11/S7); the binding limit is storage mass (4.9).

Repeat proof (post fee-gate hardening, same day): the full lifecycle ran
again with zero hand-edits and every S5/S7 fee warning firing as designed -
genesis 60579a71260a6b893bbc376af4625b585299e2e5286072aad476a0527db774bc,
increments a59844a26e135a92feaaf63bd53ddb47af1fb3a40eca8880c13b8d0ab1ae2566
(0->1) and 18f3fc7e7b4e9b6705656ba624e3e10abbb3313fe7549f153581f3f56a48b1c0
(1->2, unmodified re-run), close
c59583762bb191f150de31095aa58aaeca6dc2eb6d47deaac320bee3f39f61ff (from
count=2n). The scaffold is REPEATEDLY executable; the S7 burn is
twice-observed at an identical 385.9M sompi per lifecycle.

### 3.4 Sighash v1 [PIN mainnet-verified]

    H = keyed_blake2b(key='TransactionSigningHash', 32B out)

    Preimage field order:
      u16le(version=1)
      H(prev_outpoints)   = H(concat(txid[32B] + u32le(index)) per input)
      H(sequences)        = H(concat(u64le(sequence)) per input)
      [sig_op_counts_hash: SKIPPED for v1]
      txid[32B]           <- signing input's prev txid (as-is, no reversal)
      u32le(prev_index)
      u16le(script_version=0)
      u64le(len) + script <- UTXO's spk (aa20.. format, no version prefix)
      u64le(amount)       <- UTXO's value
      u64le(sequence)
      [per-input sig_op_count: SKIPPED for v1]
      H(outputs_v1)       = per-output: u64le(amount) + u16le(0) + u64le(len)+script
                            + u8(covenant_flag) + [if cov: u16le(authInput) + 32B(covId)]
      u64le(lockTime=0)
      20B subnetworkId    = zeros (native)
      u64le(gas=0)        (native)
      32B payload_hash   = zeros (native, empty payload)
      u8(hash_type=1)    (SIGHASH_ALL)

[PIN] sigOpCount and computeBudget are NOT in the v1 preimage.
[PIN] txids hex-decode from REST AS-IS — NO byte reversal.
[PIN] outputs hash commits covenant bindings — changing a binding changes the sighash.
Evidence: mainnet genesis signature verifies against this computation.
Probe: probes/verify-schnorr-fixed.js

### 3.5 Schnorr [PIN mainnet-verified]

Kaspa signs the sighash DIRECTLY — no additional challenge hash.
noble/curves schnorr.sign(sighash, privKey) produces valid Kaspa signatures.
P2PK sigscript: 0x41 + sig[64] + 0x01.

[LAW] The verification pubkey must come from the UTXO's P2PK script
(script[1..33] when script[0]==0x20 && script[33]==0xac), NEVER from a
hardcoded wallet constant. The mainnet wrong-key incident: correct sighash,
wrong (testnet) key, looked like a sighash bug.

### 3.6 Hash zoo [PIN]

| Hash | Key | Usage |
|---|---|---|
| keyed blake2b | TransactionSigningHash | v1 sighash |
| keyed blake2b | CovenantID | covenant/lineage IDs |
| plain blake2b | none | P2SH script hash (inside spk) |
| blake3 | none | template hash, dispatch tags |
| app blake2b | none | project program_hash (art content) |

[PIN] kascov's "program_hash" label = the P2SH hash, NOT a state field.

---

## 4. Transaction & Network

### 4.1 REST format split [PIN]

| Direction | Fields | scriptPublicKey | Amounts |
|---|---|---|---|
| Submission (POST) | camelCase | object {version:0, scriptPublicKey:"aa20..."} | decimal strings |
| Retrieval (GET) | snake_case | flat string "aa20..." (version stripped) | strings |

Retrieval field names (flattened): transaction_id, index, amount, script_public_key,
script_public_key_address, script_public_key_type, covenant_authorizing_input,
covenant_id, previous_outpoint_hash, previous_outpoint_index (STRING — parseInt it),
signature_script, sig_op_count (STRING), compute_budget.

Testnet-10 retrieval addendum [PIN 2026-10-07, probes/resolve-authindex.js,
bd4085b1… / 60579a71…]:
- covenant_authorizing_input IS present per output, as a JSON NUMBER (as mainnet).
  An earlier session claim that testnet lacks it was a probe .map() bug, corrected.
- per-INPUT covenant_id field (null on non-covenant funding spends).
- amount is a JSON NUMBER on testnet retrieval (mainnet pins it STRING) —
  parse with BigInt(), which handles both. Output index NUMBER;
  previous_outpoint_index STRING — parseInt()/BigInt() defensively.

[PIN] Mainnet REST flattens covenant data into covenant_authorizing_input /
covenant_id per output — no nested covenant object in retrieval.

### 4.2 Required headers [PIN]

    User-Agent: <any> ; Origin: wallet.kaspanet.io ; Content-Type: application/json (POST)

### 4.3 computeBudget [PIN]

P2PK input = 10 ; P2SH/covenant input = 60. Per-input, NOT sighash-covered.
Testnet REST LACKS compute_budget in the submission schema — covenant txs via
testnet REST die with "script-units limit=9999". Use wRPC on testnet.
Mainnet REST accepts it.

### 4.4 sigOpCount [PIN]

Always 0 on v1 inputs (v0-only field, still required in submission JSON).

### 4.5 Fee discovery [PIN]

Rejection messages contain "required fee of X" (sompi). Parse, add 10% margin,
rebuild, resubmit; bound 5 attempts. Mass ~ 2 x tx_bytes; fee ~ 100 sompi/mass
~ 200 sompi/tx-byte. Storage mass formula and 500000 limit: see 4.9.
Multi-chunk reveals hit a mass-dependent floor — chunk and discover per group.

### 4.6 UTXO selection [PIN]

Sort by OLDEST DAA score first (deepest confirmation) to avoid orphan-window
rejections. REST /utxos LAGS the mempool (ghost UTXOs). Always include
sequence: 0 in hand-built input objects.

[audit 2026-10-08] kaspa-tx.js pickUtxosSafe follows this rule (oldest first; static read).
The production code described in 9.9 (Reliks) sorts largest-first; sillyscript keeps oldest-first.
Decision 2026-10-12: separate codebases, kept apart by design. Selection order does not decide validity: the change
guard in deploy/interact/close evaluates storageMass() on the final tx. No code change.

### 4.7 Confirmation gating [PIN]

Public nodes do NOT chain mempool — children of unconfirmed parents are orphans
and the orphan pool is disabled ("orphan where orphan is disallowed"). Gate
consecutive actions on block confirmation before signing the next spend.

### 4.8 Endpoint matrix [PIN]

| Endpoint | Use | Limitation |
|---|---|---|
| api.kaspa.org | mainnet REST: full txs with sigscripts, UTXOs, submission | flattened covenant retrieval |
| api-tn10.kaspa.org | testnet REST | NO compute_budget — covenant txs FAIL |
| electron-10.kaspa.stream | wRPC full submission | wRPC only (404 on REST) |
| kascov.io | covenant lineage, live spks | no sigscripts in tx JSON, ~60s lag |
| seeders (seeder1/2.kaspad.net:18110) | node discovery | REJECT valid spends as orphans — never broadcast via seeders |
| mainnet wRPC | (none hardcoded) | env-only: PC_MAINNET_WRPC (kaspa-wrpc.js). Naming wart: the WRPC_ENDPOINTS const reads MAINNET_WRPC - NOT dead code [PIN 2026-10-07 grep audit] — the const is USED at :163; the wart is the env-var naming split MAINNET_WRPC :25 vs PC_MAINNET_WRPC :157. Behavior decision pending. |

[PIN] api-testnet-10.kaspa.org does NOT exist (000). Correct: api-tn10.kaspa.org.
[PIN] ENOTFOUND on a working host is usually transient DNS/VPN — re-probe before patching.

---

### 4.9 Storage mass, not a dust floor [PIN TN10 probe 2026-10-11]

Node rejection text: "transaction storage mass of N is larger than max allowed size of 500000".
[PIN] N = sum(floor(1e12 / out)) - inTerm, floored at 0 (inTerm: unequal-input note below). Verified on two
1 KAS P2PK inputs, two outputs (probe-out/dust-probe-*.log, ~/lifecycle-test2/dust-probe.js):

| out[0] sompi | change sompi | result |
|---|---|---|
| 50,000,000 | 146,900,000 | accepted, confirmed 208576f5a4ce4c78f567ec6462ad33f4f0927ecfd5cdf08bd33da8bf280488dd |
| 10,000,000 | 186,900,000 | accepted, confirmed 6b8f2e5501caa27389d3c3ab07527a070cb2c79365c677112f8cc649d9f0c407 |
| 1,950,000 | 194,950,000 | accepted, confirmed 43069a050954df48d838248adb1dca57c3038b08dc628c539821c2ead4f15445 (formula 497,949; mass not node-reported) |
| 1,900,000 | 195,000,000 | rejected, node mass 511,443 (matches formula; b55e1a0b7d58c178...) |
| 1,000,000 | 195,900,000 | rejected, node mass 985,104 (matches formula; a1b2796c31aaba7b...) |

There is no flat dust constant: the smallest valid output depends on the whole tx (about 1.9-1.95M
sompi for these inputs). The 1 KAS "dust" guess was wrong: outputs far below 1 KAS are valid,
and the limit that rejected the smaller outputs is mass, not a minimum amount.
[TODO-verify] consensus vs mempool-policy layer of the 500000 limit (the node text names neither).
[TODO-verify] a flat dust rule below the mass limit (mass binds first for these inputs, so this
probe cannot see one).
[PIN TN10 probe 2026-10-12] unequal inputs 1,950,000 + 195,510,000; both txs rejected, node-reported mass:
2 in / 2 out (outs 700000, 191760000) -> 915851 = sum(floor(1e12/in)) (harmonic), tx 2b40a113f4462674fbf70e1cdf3552d24c1cdf60c81cab724c2eca48f70b710c.
2 in / 3 out (outs 1000000, 10000000, 181460000) -> 1085254 = n*floor(1e12/floor(sum(in)/n)) (mean), tx 57dc83209774d9b51e8cd1a64310deae8f46d6608a240ab6e5d88628bdcf5ced.
3 in / 2 out (ins 1950000, 99900000, 195510000; outs 700000, 291660000) -> 1401735 = mean form, tx 09cf5b22910f776ec51386073a212a6d58dc783a4d36a1e0353c3bf0bb421038.
Rule (inferred from three shapes): harmonic for 2 in / 2 out, mean form otherwise; equal inputs and 1 input make both coincide.
kaspa-tx.js storageMass implements it; the mean form is the fallback for unverified shapes (never below the harmonic form). [TODO-verify] 1 out with 2+ inputs; 3+ in with 3+ out.
[PIN TN10 probe 2026-10-12] plain P2SH output: the 2 in / 2 out vector above with out[0] paying a P2SH script (aa20 + dummy 32-byte hash + 87) -> node mass 915851, identical to the P2PK run; mass is value-only for plain P2SH outputs. tx 19ef715eed648ad5928fd155efc73ade98d17432563c5f03bbc08271b5fdf4aa.
[PIN TN10 probe 2026-10-12] covenant-bound output (same 2 in / 2 out inputs; out[0] = P2SH dummy hash + genesis binding via setGenesisCovenant), both rejected:
out[0] 700000 -> node mass 5699243, tx 77b576d178d45497a589e46f51260055a54cb61a8d8fc913f4fae3e4df7139f2.
out[0] 900000 -> node mass 4429408, tx e912f7e90fa4c27f4708796089f03bd9bb2a7fe624813883dcb8e902cbebd634.
Both fit: the covenant-bound output weighs floor(4*1e12/amount) and the input term is the mean form (not harmonic).
kaspa-tx.js storageMass implements it; marker is covenant !== undefined, so carriers carry covenant: null before binding.
[TODO-verify] covenant shapes beyond 2 in / 2 out; whether the 4x is per binding or per covenant output; continuation (setContinuationCovenant) outputs.
Law: guards derive from the constraint they protect (storageMass()), never a round number.

## 5. Environment & Tooling

### 5.1 Termux [PIN — 5+ debugging rounds total]

- NEVER put bare ! inside double-quoted strings — bash history expansion fires.
  Bit us in node -e "!res.ok" and in a sed patch "!src.includes".
- Multi-line heredocs to /tmp FAILED repeatedly; same pattern to the project
  directory works. Write scratch files to the project dir.
- Large heredocs (~700 lines) silently truncate. Safe size ~150 lines per paste.
- node -e resolves require() from the CWD; node script.js from the script's dir.

### 5.2 Node module patterns [LAW]

Self-test guard: require.main === module && argv.includes('--test').
Without the require.main check, a required module's test block inherits the
parent's --test, runs, and process.exit()s before the parent executes.
Symptom: run module B's tests, module A's output appears.

### 5.3 noble imports [PIN]

    const { blake2b } = require('@noble/hashes/blake2b');
    const { blake3 } = require('@noble/hashes/blake3');
    const { schnorr } = require('@noble/curves/secp256k1');   // NOT @noble/secp256k1 v2+

### 5.4 kaspa-wasm [PIN]

Broken on Termux. Use pure-JS: @noble/hashes, @noble/curves, fetch, ws.

---

## 6. Incident Registry (kit-era session - historical; the live S-numbered registry is in section 11)

| # | Incident | Root cause | Law |
|---|---|---|---|
| 1 | Schnorr FAIL on correct sighash | mainnet sig verified with TESTNET pubkey | pubkey comes from the UTXO script, never a constant |
| 2 | kaspa-tx --test ran sighash tests | unguarded --test block in required module | require.main === module guard |
| 3 | bash: !res.ok: event not found | bare ! in double quotes | never; use script files |
| 4 | /tmp heredocs: no such file x3 | Termux /tmp paste failures | scratch files to project dir |
| 5 | p2pkSpk not a function x2 | kaspa-crypto v1 lacked it | define helpers where used; check exports |
| 6 | tag parse-back != OP_DATA_4 | forgot redeem PUSHDATA2 header (3B) | account for push header walking backwards |
| 7 | path.expanduser not a function | Python-ism in Node | process.env.HOME |
| 8 | KCC20 leader tag mismatch | struct rendering is {fields} braces | rendering table in 1.1 |
| 9 | P2SH spk 0000b920 wrong | wrong opcode + version-prefix confusion | aa20 + hash + 87, 35B |
| 10 | regex patch corrupted kaspa-crypto.js | greedy [\s\S]* matched past intent | never regex-patch source; rewrite whole file |
| 11 | platform-pins.md silently missing | 700-line heredoc exceeded paste buffer | ~150 lines per paste |
| 12 | v1 self-test validated wrong format | self-consistent test (0000b920) passed | tests must assert CHAIN-verified values, not own output |

---

## 7. Library Modules & Probes

Module purposes, per-module test counts, and the file inventory are
owned by Files-Manifest.md - the single count owner (11/S6). This
section retains only what pins uniquely holds: the probe layer.
| Probe | Verifies |
|---|---|
| verify-tags.js | dispatch tags + template hashes across artifacts |
| validate-mainnet.js | covenant ID vs mainnet genesis |
| verify-schnorr-fixed.js | sighash + schnorr vs mainnet |
| gauntlet-v13.js | full vertical vs live v13 artifact |
| resolve-authindex.js | authIndex semantics (3.2) + testnet retrieval schema |

---

## 8. Pre-Session Checklist

        cd ~/sillyscript
    npm test 2>&1 | grep -E 'ALL [0-9]+ PASS|FAIL'   # module PASS lines per Files-Manifest.md, zero FAIL
    node probes/verify-tags.js <current-artifact.json>
    curl -s -o /dev/null -w "%{http_code}" https://api.kaspa.org/transactions/f6ebb717e04384770a833e87c8c7b5c3b8ff57adf4c1cda0f6c1aa097af2dc55
    # expect: 200

Any failure = a pin has drifted. Investigate before building on it.

---

## Appendix A: Language Pins (TUTORIAL.md + session)

Types: int (i64), temporal (i64 ms, distinct — explicit cast to cross, both no-ops),
bool, string, byte, pubkey 32B, sig 65B, datasig 64B. Arrays T[]/T[N]/T[_].
Locks: tx.daa (int, absolute DAA CLTV), tx.time (temporal, absolute ms CLTV),
this.ageDaa (int, relative DAA CSV). LOCK_TIME_THRESHOLD = 500000000000 ms.
For loops: compile-time unroll bound; runtime range must not exceed it.
Casts are UNCHECKED type assertions — require(data.length == 32) before byte[32](data).
Builtins: blake2b sha256 blake3 blake3WithKey checkSig checkSigEcdsa checkMsgSig
checkMsgSigEcdsa g16.verify. Covenant: validateOutputState(WithTemplate|WithInputTemplate)
readInputState(WithTemplate). Constructor args: [{kind,value}] JSON, positional, baked.

## Appendix B: Compiler Versions

| Rev | Date | Notes |
|---|---|---|
| 28a16f0 | Aug 25 | shared delegates; struct tags = bare names |
| c7d17a1 | Aug 30 | struct tags = {fields}; PRODUCTION compiler |
| 3ed9733 | Sep 9 | "SilverScript 1.0" prep; ABI validation clarified |

[LAW] On any silverc upgrade: recompile canonical contracts, diff artifacts
(everything except compiler_version), re-run verify-tags.js. Changed hash from
unchanged source = semantic drift = audit every pin in this document.

### 9.8 wRPC broadcast details [PIN — ported from production]

- Wire format: JSON `{id: 1, method: "submitTransaction", params: {transaction, allowOrphan: true}}`
- Method names are STRINGS, not numeric ids (dotk's "numeric ids" note refers to Borsh encoding)
- allowOrphan: TRUE on wRPC / FALSE on REST — different per transport
- Response: `{params: {transactionId}}` OR `{result: {transactionId}}` OR `{error: {message}}`
- Rotate endpoints on BOTH errors AND rejections (txId=null → rotate, preserve msg)
- wRPC headers: User-Agent + Origin wallet.kaspanet.io

### 9.9 UTXO selection correction [PIN — documentation drift found]

F-05 comment says "oldest DAA first" but the WORKING CODE sorts LARGEST-first.
Rationale: storage mass scales ~inversely with value, so larger UTXOs cost
LESS mass to spend. The orphan-window concern is handled by the confirmation
gate (waitForConfirmation), not by UTXO selection order.

Scope: this describes the Reliks production code. sillyscript's pickUtxosSafe sorts
OLDEST first per 4.6 (audit 2026-10-08, static). Different from 9.9 by design (2026-10-12); see 4.6.

This is itself a documentation-drift incident: the F-05 comment was never
updated when the sort order changed. One topic, one place (dotk rule).

### 9.10 Dual-format field names [PIN — from production toRESTFormat]

Send BOTH camelCase AND snake_case for computeBudget and covenant fields
in REST submissions. Some endpoints accept one, some the other. Belt and
suspenders costs nothing and prevents silent field-dropping.

### 9.11 Three-layer confirmation [PIN — from production waitForConfirmation]

Layer 1: REST /transactions/{txid} — is_accepted or block_hash
Layer 2: kascov /tx/{txid}.json — accepting_block (covenant lineages)
Layer 3: wallet UTXO set — change output appears with blockDaaScore
Then: wait 10s to clear orphan window before proceeding.
A plain-P2SH output (e.g. escrow) is NEVER indexed by kascov — layer 3 exists for it.

---

## 10. Gauntlet Addendum (fresh-session validation, testnet-10)

### 10.1 wRPC v2.1.0 submitTransaction schema [PIN gauntlet-B4]

COMPLETELY DIFFERENT from REST (pins §4.1). Ground truth via getBlock probe:

| Field | wRPC v2.1.0 | REST gateway |
|---|---|---|
| Output amount | `value` (JSON NUMBER) | `amount` (decimal STRING) |
| scriptPublicKey | FLAT STRING `"0000"+script_hex` | OBJECT `{version, scriptPublicKey}` |
| mass | REQUIRED (send 0) | absent |
| storageMass | REQUIRED (send 0) | absent |
| covenant | EXPLICIT `null` if absent | omitted if absent |
| subnetworkId | hex string | hex string |

[WRONG-ASSUMPTION] toRestFormat() output is valid for wRPC submission. IT IS NOT.
The raw wRPC node rejects it with "request deserialization error".

**Probe pattern**: `getBlock` with `includeTransactions: true` returns ground-truth
RpcTransaction JSON — the confirmed wire format. Use this to verify any serialization
question against reality, never against documentation.

### 10.2 Sequence is u64, not u32 [PIN gauntlet-C1]

Kaspa sequence numbers are u64. To DISABLE relative sequence locks, set bit 63
(0x8000000000000000 = 9223372036854775808). 

[WRONG-ASSUMPTION] Kaspa sequence is u32 like Bitcoin; 0xFFFFFFFF disables locks.
IT DOES NOT — 0xFFFFFFFF in u64 = 4294967295, which does NOT have bit 63 set,
and is interpreted as a relative lock of ~4B blocks.

[CRITICAL] Never carry a u64 sequence as a JS Number. 2^63 itself is exactly representable, but its decimal
serialization is not, and 2^63+1 cannot be held at all. Store sequence as BigInt.
JSON serialization must handle BigInt explicitly (serializeBigInt pattern in
kaspa-wrpc.js). JSON.stringify(2**63) prints 9223372036854776000, not 9223372036854775808 [ran 2026-10-08].

### 10.3 Testnet REST UTXO schema is nested [PIN gauntlet-B1]

    { outpoint: {transactionId, index}, utxoEntry: {amount: "string", blockDaaScore, isCoinbase} }

The kit's flat-field fetchUtxos parsed undefined amounts as 0n. Fixed in v2 to
handle both nested and flat schemas.

### 10.4 signCovenantInput args are raw positional values [PIN gauntlet-B5]

Runtime sigscript encoding takes raw values (BigInt, Buffer, number). The
[{kind, value}] shape is ONLY for silverc --constructor-args JSON files.

### 10.5 Output helpers take pre-derivation inputs [PIN gauntlet-B3]

covenantOutput(amount, redeemScript) and p2pkOutput(amount, pubkey32) compute
the SPK internally. Passing a pre-computed SPK Buffer causes double-wrapping
and JSON serialization as {"type":"Buffer","data":[...]} → REST pydantic rejection.

### 10.6 computeCommit not deployed on testnet-10 [PIN gauntlet-C2]

The testnet-10 node (v2.1.0) rejects the computeCommit object from PR #1074.
Nodes still expect flat computeBudget/sigOpCount fields.

### 10.7 Ground-truth probe pattern [LAW gauntlet-meta]

When ANY serialization or schema question arises: query the node for a real
confirmed transaction (getBlock + includeTransactions), inspect the JSON,
and match your output against it. This solved in 1 round what guessing
failed to solve in 15. The probe-first rule (§0.3) is not advisory.

### 10.8 Upstream fix to watch: PR #1074 [REF kas-smiths forum]

PR #1074 "compute commit, mass calculation and generator fixes" by IzioDev
is the upstream change that will eventually fix testnet REST's compute_budget
dropping. It introduces the ComputeCommit model (the object form that the
gauntlet's C2 test tried and got rejected on testnet-10 v2.1.0).

When testnet nodes deploy this PR:
- Testnet REST should pass compute_budget through
- The wRPC schema may change to accept ComputeCommit objects
- toWrpcFormat() will need verification against the new schema

Until then: testnet covenant broadcasting requires wRPC with the v2.1.0
schema documented in pins §10.1.

### 10.9 kas-odds extraction — WASM SDK as alternative broadcast path [REF kas-odds repo]

Production dApp (kas-odds, commit 876f064) broadcasts testnet covenants 
successfully using the kaspa-wasm SDK:

    const kaspa = loadWasmSdk();
    const tx = kaspa.Transaction.deserializeFromSafeJSON(safeJson);
    await rpc.submitTransaction({ transaction: tx, allowOrphan: false });

Key facts:
- SDK handles v2.1.0 schema internally — no schema knowledge needed
- SafeJSON format: amounts as decimal strings, sequence as string
- SDK's calculateTransactionMass IGNORES v1 compute_budget — callers
  must add computeBudgetMass(inputs) = sum(computeBudget) * 100 grams
- SCRIPT_VERSION_HEX = '0000' prefix on scriptPublicKey confirmed
- Relay floor: 100 sompi/gram (proactive fee floor)
- Covenant ID implementation independently confirms kit's preimage

Tradeoff: 6MB WASM dependency vs schema independence.
Recommended for: browser-based builders, wallet-integrated flows.
Not recommended for: lightweight Termux/Node environments where
sillyscript's pure-JS path is already proven.

## 11. sillyscript Session Addendum (Oct 5, 2026)

| # | Incident | Root cause | Law |
|---|---|---|---|
| S1 | Scaffold deploy.js could not parse (top-level await under commonjs) | string-embedded template, never execution-tested | scaffold generates FILES from bin/templates/; silly check node --check gate |
| S2 | Scaffold fee 31x under proven; single-UTXO funding vs 2-UTXO reality | same - never ran | constants come from confirmed txs; funding via pickUtxosSafe |
| S3 | Scaffold died MODULE_NOT_FOUND on @noble at first run | file: link exposes the API, not the deps; scaffold never declared its own requires | scaffold derives noble pins from the library package.json at init |
| S4 | close template shipped computeBudget 100 labeled PROVEN | constant copied from failed-attempt scripts; no confirmed tx ever carried it | never grade a constant without the txid that proves it (Bible 0.4) |
| S5 | Fee labels conflated selection target with paid fee (3.1M/5M circulated as proven; actuals ~100M) | intended-fee constants graded as proven; nothing compared txFee(tx) to intent | a proven fee is inputs-minus-outputs of a CONFIRMED tx, not a selection target |
| S6 | Doc counts drifted in two places (187 vs 177; manifest 13/13/15/27 + two modules missing) | counts duplicated across documents | counts have ONE owner (Files-Manifest.md); all gates are count-free |
| S7 | ~3.86 TKAS burned as excess fee across the 4-tx lifecycle (each tx dropped a 95-97M change output) | change guard (100M) equals the wallet UTXO size (100M) - change always dropped, silently | warn loudly on dropped change; RESOLVED 2026-10-11: no flat dust floor, storage mass binds (4.9); guards are storageMass()-based |
| S8 | `silly genesis verify` printed help + exit 0 on BOTH live runs — the negative test false-passed | async command registered a promise, then fell through to the synchronous help fallback, whose process.exit(0) won the race | an async CLI command owns the process lifetime: top-level return (CJS) after promise registration; CLI negative tests assert EXIT CODES, not output alone |
| S9 | live --initial-state {count:3} failed with the raw TypeError "Cannot mix BigInt and other types" instead of the baked-state diagnosis; the positive {count:0} run could NEVER pass (Number 0 fails the 0 === 0n early-return) | sil-encoder asymmetry: the sigscript arg path coerces via asBigInt, the state path (encodeFixedPayload → serializeScriptNumFixed8) forgot; every unit test used BigInt literals, so the gap surfaced only in the live CLI run | coercion contracts are tested at the boundary where untyped input enters (JSON/CLI), not only with typed literals; fail-closed held (right layer, exit 1), but a raw internals message is itself a defect — the diagnosis is part of the contract |
| S10 | Scaffold fee hard limit labeled "5 KAS" was 50_000_000_000n sompi = 500 KAS in SAFETY.md and all three templates (100x loose); the >2x-intent gate masked it on every run | sompi/KAS conversion done by hand and cloned into four places; no test evaluated the constant [ran: 5n*100000000n = 500000000n] | a safety constant is evaluated, not labeled: 1 KAS = 1e8 sompi, and every clone is asserted by a test (kaspa-tx.js guard); a rail is graded by what it blocks |
| S11 | new KaspaRestProvider("testnet-10") (and any unknown or mis-cased name) silently resolved to the MAINNET REST URL and hrp kaspa | name lookup was NETWORKS[n] || default; the custom-URL branch already failed closed for the same hazard, the name branch did not [ran: testnet-10, Testnet, mainet -> api.kaspa.org kaspa] | network selection fails closed on unknown names in every branch (own-property check, no prototype keys); never default to the money-bearing network |
| S12 | State/array path accepted byte 256/-1/1.5/null, bool "false"/0 and unsafe Numbers silently (S9 fixed int only); sigscript byte accepted 1.5/NaN | validation lived in the sigscript arg path and coerceArg; encodeFixedPayload trusted its callers; S9 patched the field, not the class [ran] | every path that turns untyped input into bytes validates type, range and integrality; when a coercion bug is fixed, grep its siblings in the same module (fix the class) |
| S13 | silly-compile toArtifactValue converted BigInt via Number(): constructor ints above 2^53 were baked rounded, silently | JSON numbers are doubles; the args file is written with JSON.stringify [static; fix proven by vm test] | no BigInt crosses a JSON boundary through Number() unchecked; fail closed until silverc big-int literal handling is probed (open: does silverc accept bare 61-bit literals) |
| S14 | Contract(artifactObject) round-tripped through a hardcoded /tmp file, which does not exist on Termux; the only test used the path form | the object branch never executed on the target host [ran on Termux 2026-10-08: ENOENT /tmp/temp_art_*] | a path no test exercises on the target host is unproven; loaders take a path OR an object, never a scratch file; the regression test forbids fs writes instead of relying on /tmp being absent |
| S15 | F1 gate (verifyRedeem/expectedSpk) was called only from a self-test: Contract({redeemScript}) and signCovenantInput accepted any redeem | gate built but never wired into the production signing path [static: grep of call sites] | a fail-closed gate is graded by where it is called, not by existing: grep its call sites before claiming it |
| S16 | waitForConfirmation returned on block inclusion although is_accepted could be false; no consumer read isAccepted; every polling error was swallowed | inclusion mistaken for acceptance; a catch-all retry hid the cause [static: no isAccepted consumer] | adopt state only on acceptance (explicit false keeps waiting); timeouts report why (not accepted / last error) |
| S17 | sil-abi decodeField lacked pubkey/sig/datasig although fixedLen and the encoder supported them (a pubkey state field was undecodable); artifact bytecode values outside 0-255 wrapped silently through Buffer.from | [ran on Termux 2026-10-08: pubkey decode THROWS; bytecode[200]+=256 LOADS] | encode and decode support the same kind set; byte arrays are validated before Buffer.from can wrap them |
| S18 | p2pkSpk/p2shSpk treated strings as UTF-8 (a hex pubkey became a 66-byte spk) and accepted any pubkey length, while extractPubkeyFromP2PK was hex-aware | [ran on Termux 2026-10-08: hex string -> 66B, 33B key -> 35B, hex != bytes] | sibling helpers share one input normalizer; spk builders assert exact lengths; bech32 is pinned to a real chain address |
| S19 | toRestFormat serialized sequence through Number(), so values above 2^53 (SEQUENCE_DISABLE) were rounded and the submitted tx no longer matched the signed sighash | [ran: JSON.stringify(2**63) = 9223372036854776000] | REST carries sequence as a JSON number: refuse what it cannot carry exactly instead of rounding |
| S20 | submitWithFeeDiscovery let the node dictate an unbounded fee; FEE_REGEX existed in two divergent copies (one unused); wRPC broadcast ignored its allowOrphan option | [static: grep] | every automated fee loop has a ceiling; one definition per parsing rule; an option a function accepts must change what it does |
| S21 | setGenesisCovenant/setContinuationCovenant could run after signing (silently invalidating the signatures), bind a second output to the same input with a wrong group ID, and accepted missing outputs/inputs and malformed covenant IDs | [static; guards proven by tests] | bind-before-sign is enforced by the helper, not by caller discipline; a helper that cannot compute the full group refuses |
| S22 | kaspa-sighash hex helper silently truncated bad hex (63-char txId, non-hex, odd length), so a different message than intended could be signed | [static: Buffer.from(str, "hex") truncates at the first bad character] | every hex field is validated for type, parity and charset, and ids for length, before hashing |
| S23 | silly-compile built a shell command by string interpolation: paths with spaces or metacharacters broke or injected | [static] | external tools are invoked with an argv array, never through a shell |
| S24 | probes/validate-mainnet.js imported a library the package does not depend on, verified against a hardcoded key (incident #1 class), swallowed its own error and exited 0; probes/resolve-authindex.js dropped covenant_authorizing_input in its own .map() and judged continuation txs as failed geneses | [ran on Termux 2026-10-08: Cannot find module @noble/secp256k1; covenant_authorizing_input printed undefined; c7fc689f verdict NEITHER] | a probe is code: it fails non-zero on any unverified step, derives keys from chain data, and classifies its input before judging it |
| S25 | PC_TN10_WRPC / PC_MAINNET_WRPC set in the scaffold .env were never exported to process.env, so the library never saw them; mainnet endpoints were also read from two variables at two different times (MAINNET_WRPC at module load, PC_MAINNET_WRPC at construct) | [static: no process.env write in templates or silly.js; scripts run plain node] | a config key documented for a file must be read by the code that consumes it; one variable, read at construct time, comma-separated list |
| S26 | the only chain evidence for the covenant-ID auth index was two testnet vectors that share funding index 2 and 2 inputs; the probe skipped continuation txs instead of walking back to their genesis | [ran 2026-10-08: c7fc689f is a continuation; the probe now traces parents] | evidence for a pin is graded by the confounders it excludes; tooling walks to the evidence instead of stopping at the first mismatch |
| S27 | kaspa-sighash and covenantId tests asserted determinism and length only (incident #12 class); the real anchors lived in network probes outside the offline gate | [static; the vector is now frozen from mainnet genesis f6ebb717 by probes/dump-vector.js] | a protocol-critical function is pinned in the offline gate by a frozen chain vector whose oracle is on-chain (the signature, the covenant ID), never by its own output |
| S28 | The 1 KAS "dust" guard, a round number, sat in buildTx, three templates and provider.js and dropped 95-97M change as fee on every lifecycle tx (S7) | [ran: TN10 2026-10-11; 3 txs accepted down to 1,950,000 sompi; node rejected 1,900,000 and 1,000,000 with storage mass 511443 and 985104, equal to the 4.9 formula] a flat constant was assumed and never probed; the real constraint is storage mass | a guard derives from the constraint it protects and is pinned by node-reported vectors, never a round number |
| S29 | REST reads (getUtxos, getTransaction) aborted a whole scaffold lifecycle on one dropped connection; the error said only "fetch failed" | [ran: TN10 2026-10-11; every lifecycle failure was the first read of a process; 22 of 30 fresh requests failed with ECONNRESET in one window and 0 of 20 an hour later; curl, ipv4first and no-autoselection made no difference] no retry on reads, and the cause was hidden behind a generic message | reads retry boundedly and name the cause; a polling loop keeps its own retry and never stacks another; broadcast is never blindly retried |
| S30 | A broadcast whose response is lost (reset after the node accepted) threw before any record or pending pointer existed, so the next run would deploy a second covenant or hunt a spent UTXO | [static: deploy, interact and close wrote pending only after broadcast returned a txId; recovery verified live on TN10 2026-10-12: real broadcast accepted, response dropped by an injected ECONNRESET, txId recovered by own-input spend (deploy 3ab56a5be07ef67affc8d2743708e4f4a8c87c3f11fba372ca930181286e4f08, interact 2e70f396e2e635ea4090267901baf2955d81e20f8cbd680b2112d7393d4e1e85, close a62e34a067af67aa8c3cdfd9d59a7a6fda1bf04cf5a6c51e2f62dd13af9d1d27) [PIN]; interact without a change output watches the next-state carrier: verified live on TN10 2026-10-12 with that branch forced in a scratch scaffold (8654096df962fee5e36f132827e8f00adbc8e3e6bea3cb67e24a80434cfcc8e9)] the pointer was written after the side effect | a side effect with an unknown outcome is recovered by observing the chain for a tx that spends our own inputs (an amount match alone is never adopted); with nothing observed, or no watched output (next-state address prefix differs from the wallet's), the run stops with outcome UNKNOWN |

Session closeout 2026-10-07: the machine-proposed entries above (3.2 authIndex amendment,
4.1 testnet-10 retrieval addendum, S8, S9) were ratified by the operator after evidence
re-run — probes/resolve-authindex.js (two VERDICT: A lines + retrieval schema dump),
node genesis-verify.js --test (21), node sil-encoder.js --test (36). Provenance: inserted
by session patchers, graded per the evidence, operator-confirmed.

Meta-law (S1-S3): a generator is code that has never run until its output
has executed. The acceptance lifecycle caught all three scaffold bugs at
zero sompi of risk; no library primitive failed at any point in the session.
