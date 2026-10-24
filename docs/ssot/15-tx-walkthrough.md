## 19. End-to-End Transaction Walkthrough
<!-- id: walk-module | world: W3 | difficulty: 4 | prereqs: p2sh-state-covenant-lifecycle, tx-v1-schema, covenant-id-genesis-hash, contract-counter, kcc01-dispatch-tags, fee-mass-module | status: pedagogical | source: https://docs.kaspa.org/toccata/covenant-state -->

This module follows one covenant through its life, field by field: a **deploy** (Genesis) transaction that creates it, then a **spend** (Continuation) transaction that changes its state. The contract is the macro-form `Counter` from §9.5 (`#[covenant.singleton] function bump(...)`), lowered as shown in `CounterManual`.

**Illustrative values.** Every transaction id, hash, key and signature below is a **labeled placeholder** in angle brackets (`<TXID_F>`, `<H0>`, `<X>`). None is a real hash and none was computed from real compiled bytes. Amounts, sizes and fees reuse the examples of §18 (Examples N and O) so the two modules agree. State encodings and byte layouts come from §10.3 and §5.2.

### 19.1 Cast and Starting Position
<!-- id: walk-setup | world: W3 | difficulty: 2 | prereqs: envelope-metaphor-map, contract-counter | status: pedagogical | source: ssot §9.5 -->

| id | Item | Value (illustrative) |
| --- | --- | --- |
| walk-cast-funding | Funding UTXO | Alice's plain P2PK UTXO, outpoint `<TXID_F>:0`, `200,000,000` sompi |
| walk-cast-fee-utxo | Second funding UTXO (pays the spend's fee) | `<TXID_F2>:0`, `100,000,000` sompi |
| walk-cast-contract | Contract | `Counter(init_count = 0)`, state field `count` (§9.5) |
| walk-cast-genesis-id | Covenant ID | `<X>` (assigned by the Genesis rule in §19.4) |
| walk-cast-p2sh-0 | Script hash of the first redeem script | `<H0>` |
| walk-cast-p2sh-1 | Script hash of the second redeem script | `<H1>` (`<H1>` differs from `<H0>` because the state differs) |

### 19.2 State and Redeem Script Bytes
<!-- id: walk-state-bytes | world: W3 | difficulty: 3 | prereqs: script-layout-template-hash, state-encoding-byte-walkthroughs | status: mainnet | source: ssot §10.3 -->

`Counter` has one state field, `int count`, encoded as 8 bytes of little-endian signed-magnitude (§10.3: `+42` is `2a 00 00 00 00 00 00 00`).

| Generation | `count` | `runtime_state` bytes (8) |
| --- | :---: | --- |
| 0 (deploy) | `0` | `00 00 00 00 00 00 00 00` |
| 1 (after one `bump`) | `1` | `01 00 00 00 00 00 00 00` |

The redeem script preimage is `[template_prefix][runtime_state][template_suffix]` (§10.1). Only the middle span differs between generations:

| Region | Generation 0 | Generation 1 | Length |
| --- | --- | --- | --- |
| `template_prefix` | `<PREFIX>` | `<PREFIX>` (identical) | `L_prefix` = `state_span.offset` |
| `runtime_state` | `00 00 00 00 00 00 00 00` | `01 00 00 00 00 00 00 00` | `state_span.len` = `8` |
| `template_suffix` | `<SUFFIX>` | `<SUFFIX>` (identical) | `L_suffix` |

`<PREFIX>` and `<SUFFIX>` are compiler output and are not reproduced here. Their lengths are symbolic (`L_prefix`, `L_suffix`); the `template_hash` (§10.1) of both generations is the same value `<TH>`.

### 19.3 Phase 1: The Deploy (Genesis) Transaction
<!-- id: walk-deploy | world: W3 | difficulty: 4 | prereqs: walk-setup, walk-state-bytes, covenant-id-genesis-hash | status: pedagogical | source: https://docs.kaspa.org/toccata/transaction-v1 -->

<!-- id: walk-deploy-fields | world: W3 | difficulty: 3 | prereqs: walk-deploy, tx-v1-schema | status: pedagogical | source: https://docs.kaspa.org/toccata/transaction-v1 -->
**Transaction `<TXID_D>`, field by field** (field names from §3.1):

| Field | Value (illustrative) | Note |
| --- | --- | --- |
| `version` | `1` | Required for `covenant_binding` and `compute_budget` |
| `inputs[0].previous_outpoint` | `<TXID_F>:0` | Funding UTXO |
| `inputs[0].signature_script` | `<push 65-byte Schnorr signature>` | A 65-byte `sig` is 64 bytes plus the sighash flag (§8.2); committed in `tx::hash`, empty in `txid` |
| `inputs[0].sequence` | `0` | No relative lock |
| `inputs[0].compute_budget` | `10` | One signature check, §18 Example C |
| `outputs[0].value` | `50,000,000` | The covenant cell |
| `outputs[0].script_public_key` | `00 00 aa 20 <H0> 87` | 37 bytes: version `0`, `OpBlake2b`, push 32, hash, `OpEqual` |
| `outputs[0].covenant_binding` | `{ authorizing_input: 0, covenant_id: <X> }` | Genesis binding |
| `outputs[1].value` | `149,978,333` | Change |
| `outputs[1].script_public_key` | `00 00 20 <ALICE_PK> ac` | 36-byte P2PK |
| `outputs[1].covenant_binding` | none | Ordinary output |
| `lock_time` | `0` | |
| `subnetwork_id` | 20 bytes of `0x00` | Native lane; so `gas` must be `0` (§3.5) |
| `gas` | `0` | |
| `payload` | empty | |
| `storage_mass` | `21,667` | §18 Example N |

<!-- id: walk-genesis-hash | world: W3 | difficulty: 4 | prereqs: walk-deploy-fields, covenant-id-genesis-hash | status: pedagogical | source: ssot §5.2 -->
**How `<X>` is formed (§5.2).** The covenant ID is $\text{BLAKE2b-256}_{\text{"CovenantID"}}$ over the following preimage, for the authorizing outpoint $O = \text{in}[0].\text{previous\_outpoint}$ and the single authorized output $j = 0$. The covenant binding itself is excluded from the serialized output.

| Part | Rule | Bytes | Concrete value |
| --- | --- | :---: | --- |
| `O.tx_id` | 32-byte creating transaction id | 32 | `<TXID_F>` |
| `le_u32(O.index)` | outpoint index | 4 | `00 00 00 00` |
| `le_u64(count)` | number of authorized outputs | 8 | `01 00 00 00 00 00 00 00` |
| `le_u32(j)` | output index | 4 | `00 00 00 00` |
| `le_u64(value)` | `50,000,000` = `0x02faf080` | 8 | `80 f0 fa 02 00 00 00 00` |
| `le_u16(spk.version)` | `0` | 2 | `00 00` |
| `le_u64(len(script))` | the P2SH script is `aa 20 <H0> 87` = 35 bytes | 8 | `23 00 00 00 00 00 00 00` |
| `spk.script` | `aa 20 <H0> 87` | 35 | `aa 20 <H0> 87` |

The serialized output is $4 + 8 + 2 + 8 + 35 = 57$ bytes, so the whole preimage is $32 + 4 + 8 + 57 = 101$ bytes. The resulting 32-byte digest is `<X>`; it is not computed here because `<H0>` is a placeholder.

<!-- id: walk-deploy-checks | world: W3 | difficulty: 4 | prereqs: walk-deploy-fields | status: pedagogical | source: ssot §5.1 -->
**What happens at deploy, in order:**

| id | Step | Who checks | What is checked | Outcome here |
| --- | --- | --- | --- | --- |
| walk-d1 | Structure | Consensus | `version = 1`; V1 inputs carry `compute_budget`; no `sig_op_count`; `subnetwork_id` and `gas` consistent (§3.5) | Pass |
| walk-d2 | Input exists | Consensus | `<TXID_F>:0` is an unspent outpoint | Pass |
| walk-d3 | Funding script runs | Script engine | The signature verifies over the V1 `sighash`; used script units ≤ `10 × 10,000 + 9,999` | Pass (`100,000 ≤ 109,999`) |
| walk-d4 | Covenant binding | Consensus | `authorizing_input = 0` is in range; `in[0]`'s UTXO carries no `covenant_id`, so the **Genesis** rule applies and `<X>` must equal the §5.2 hash | Pass |
| walk-d5 | Value | Consensus | `sum(outputs) ≤ sum(inputs)`; the difference is the fee | `200,000,000 - 199,978,333 = 21,667` |
| walk-d6 | Mass | Consensus | The committed `storage_mass` equals the recomputed value (§18 Example N) | Pass (`21,667`) |
| walk-d7 | Covenant script | **Nobody** | `Counter` is *not executed*: an output script only runs when it is later spent | Not run |

Step `walk-d7` is the key lesson. Consensus never checks that the deployed state is sensible: the first state (`count = 0`) and the template are whatever the deployer wrote. Users who rely on a covenant should compare its `template_hash` with an audited build (§10.1).

### 19.4 Phase 2: The Spend (Continuation) Transaction
<!-- id: walk-spend | world: W3 | difficulty: 4 | prereqs: walk-deploy, contract-counter, kcc01-dispatch-tags | status: pedagogical | source: https://docs.kaspa.org/toccata/covenant-state -->

<!-- id: walk-spend-fields | world: W3 | difficulty: 3 | prereqs: walk-spend | status: pedagogical | source: https://docs.kaspa.org/toccata/transaction-v1 -->
**Transaction `<TXID_S>`, field by field:**

| Field | Value (illustrative) | Note |
| --- | --- | --- |
| `version` | `1` | |
| `inputs[0].previous_outpoint` | `<TXID_D>:0` | The covenant cell; its UTXO entry carries `covenant_id = <X>` |
| `inputs[0].signature_script` | see below | Arguments, tag, redeem script preimage |
| `inputs[0].sequence` | `0` | |
| `inputs[0].compute_budget` | `0` | `Counter` needs about `2,200` units, §18 Example D |
| `inputs[1].previous_outpoint` | `<TXID_F2>:0` | Fee-paying P2PK input |
| `inputs[1].signature_script` | `<push 65-byte Schnorr signature>` | Signs the V1 `sighash`; does not sign `compute_budget` |
| `inputs[1].compute_budget` | `10` | One signature check |
| `outputs[0].value` | `50,000,000` | Successor cell |
| `outputs[0].script_public_key` | `00 00 aa 20 <H1> 87` | `<H1> = BLAKE2b-256([PREFIX][01 00 00 00 00 00 00 00][SUFFIX])` |
| `outputs[0].covenant_binding` | `{ authorizing_input: 0, covenant_id: <X> }` | Continuation binding; same ID as the spent cell |
| `outputs[1].value` | `99,997,770` | Change |
| `outputs[1].script_public_key` | `00 00 20 <ALICE_PK> ac` | |
| `lock_time`, `subnetwork_id`, `gas`, `payload` | `0`, 20 × `0x00`, `0`, empty | Native lane |
| `storage_mass` | `0` | §18 Example O |

<!-- id: walk-sigscript | world: W3 | difficulty: 4 | prereqs: walk-spend-fields, kcc01-dispatch-tags | status: unverified | source: ssot §10.2 -->
**`inputs[0].signature_script`** follows §10.2: arguments, then the 4-byte dispatch tag, then the redeem script preimage.

| Order | Push | Content | Length |
| :---: | --- | --- | :---: |
| 1 | argument | `new_state`, i.e. `01 00 00 00 00 00 00 00` (`count = 1`) | 8 bytes |
| 2 | dispatch tag | `<TAG4>` = first 4 bytes of `blake3("bump(...)")` | 4 bytes |
| 3 | redeem script preimage | `<PREFIX>` ‖ `00 00 00 00 00 00 00 00` ‖ `<SUFFIX>` (generation 0) | `L_prefix + 8 + L_suffix` |

The exact canonical signature string hashed for `<TAG4>`, and whether a struct argument is pushed as its 8-byte state encoding, are fixed by the compiler's ABI artifact (§10.4) and were not verified; the table shows the layout the SSOT specifies.

<!-- id: walk-script-trace | world: W3 | difficulty: 4 | prereqs: walk-sigscript, contract-counter | status: pedagogical | source: ssot §9.5 -->
**Execution of input 0, step by step** (using the lowered `CounterManual` of §9.5):

| id | Step | What the engine does |
| --- | --- | --- |
| walk-s1 | Push phase | The `signature_script` pushes `new_state`, `<TAG4>` and the redeem script preimage onto the stack. |
| walk-s2 | P2SH check | The output being spent is `aa 20 <H0> 87`: the engine hashes the revealed preimage with BLAKE2b and requires equality with `<H0>`. A mismatch fails the input (`wf-err-redeem-mismatch`). |
| walk-s3 | Run the redeem script | The preimage runs with the remaining stack. The state `count = 0` is available as a constant inside it. |
| walk-s4 | Dispatch | `<TAG4>` selects the `bump` entrypoint. |
| walk-s5 | Covenant membership | `activeIdx = this.activeInputIndex` (`OpTxInputIndex`, `0xb9`) is `0`; `OpInputCovenantId(0)` must not be 32 zero bytes. It is `<X>`. |
| walk-s6 | Locate the successor | `OpAuthOutputCount(0)` must equal `1`; `OpAuthOutputIdx(0, 0)` returns `0` (output 0 carries `{0, <X>}`). |
| walk-s7 | Apply the rule | `require(new_state.count == count + 1)`: `1 == 0 + 1`. |
| walk-s8 | Validate the successor lock | `validateOutputState(0, new_state)` rebuilds `[PREFIX][01 00 00 00 00 00 00 00][SUFFIX]`, hashes it, builds the 37-byte P2SH lock, and requires `tx.outputs[0].scriptPubKey` to be exactly `00 00 aa 20 <H1> 87`. |
| walk-s9 | Success | The script leaves a true value; input 0 is valid. |

Input 1 is an ordinary P2PK spend: one `OpCheckSig` over the V1 `sighash`, which commits to `outputs[0].covenant_binding` (subject to sighash flags) but not to `compute_budget`.

<!-- id: walk-spend-checks | world: W3 | difficulty: 4 | prereqs: walk-script-trace, covenant-id-lineage | status: pedagogical | source: ssot §5.1 -->
**Consensus view of the same spend:**

| id | Check | Who | Result |
| --- | --- | --- | --- |
| walk-c1 | Structure and lane rules (§3.5) | Consensus | Pass |
| walk-c2 | Both outpoints are unspent | Consensus | Pass |
| walk-c3 | Each input's script runs within its allowance: input 0 within `9,999`, input 1 within `109,999` units | Script engine | Pass |
| walk-c4 | Covenant binding on `outputs[0]` | Consensus | **Continuation** rule: `authorizing_input = 0` is in range and `in[0]`'s UTXO already carries `<X>`, so `<X>` is admitted |
| walk-c5 | Value and mass | Consensus | `150,000,000 - 149,997,770 = 2,230` fee; committed `storage_mass = 0` matches |
| walk-c6 | Whether the *transition itself* is allowed | **The covenant script** (steps `walk-s5`–`walk-s8`) | Consensus does not judge this (§5.4) |

### 19.5 What Changed and What Did Not
<!-- id: walk-before-after | world: W1 | difficulty: 2 | prereqs: walk-spend, p2sh-state-covenant-lifecycle | status: pedagogical | source: https://docs.kaspa.org/toccata/covenant-state -->

| id | Property | Before the spend | After the spend |
| --- | --- | --- | --- |
| walk-ba-count | `count` (state) | `0` | `1` |
| walk-ba-hash | P2SH script hash | `<H0>` | `<H1>` (different) |
| walk-ba-address | Address (`kaspa:p…`) | encodes `<H0>` | encodes `<H1>` (§16.8) |
| walk-ba-covid | Covenant ID | `<X>` | `<X>` (unchanged) |
| walk-ba-outpoint | Outpoint of the live cell | `<TXID_D>:0` | `<TXID_S>:0` |
| walk-ba-template | `template_hash` | `<TH>` | `<TH>` (unchanged) |
| walk-ba-value | Cell value | `50,000,000` | `50,000,000` (kept here by the spender; `Counter` as written does not enforce it) |

### 19.6 What a Hostile Spender Would Try
<!-- id: walk-attacks | world: W3 | difficulty: 4 | prereqs: walk-spend-checks, security-core-invariants | status: pedagogical | source: ssot §12.1 -->

| id | Attempt | Where it is stopped |
| --- | --- | --- |
| walk-atk-skip | Output `count = 5` instead of `1` | Script: `require(new_state.count == count + 1)` fails (BUG-01 in §12.3 is the weaker `>` form) |
| walk-atk-p2pk | Bind `<X>` to a P2PK output the attacker controls | Consensus admits the binding (§5.4), but the script's `validateOutputState` fails, so the spend is invalid |
| walk-atk-forge | Bind `<X>` on an output authorized by an input that does not carry `<X>` | Consensus rejects: neither Continuation nor valid Genesis |
| walk-atk-wrong-tag | Select another entry | Fails only if that entry's own rules fail; `Counter` has one covenant entry |
| walk-atk-two-succ | Authorize two successors for input 0 | Script: `OpAuthOutputCount(0) == 1` fails |

### 19.7 Glossary Additions for §19
<!-- id: walk-glossary-additions | world: W3 | difficulty: 2 | prereqs: walk-module | status: pedagogical | source: ssot §5.1 -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| walk-gloss-successor | **Successor output** | The new envelope that replaces the one you opened. | The output bound with `authorizing_input = i` whose lock the script verifies against the next state. |
| walk-gloss-placeholder | **Placeholder value** | A made-up stand-in used so a diagram stays readable. | Angle-bracket symbols such as `<H0>`; never a real hash. |
| walk-gloss-fee-input | **Fee input** | A plain coin used to pay the fee so the covenant's own value stays untouched. | An ordinary P2PK input co-spent with the covenant input. |

