## 17. Workflow & Tooling
<!-- id: wf-tooling-module | world: W3 | difficulty: 3 | prereqs: silverscript-contract-structure, abi-artifact-structure, addr-networks-module | status: unverified | source: https://docs.kaspa.org/toccata/silverscript -->

This module describes the practical path from a Silverscript file to a deployed, spent and debugged covenant on a test network. Silverscript is documented by Kaspa's own guide as "still moving toward its audited release interface", so **every command here must be re-checked against the compiler revision you build**. Where a step's exact tool or flag could not be confirmed in the official repositories or docs, it is marked `unverified` and the REPORT lists what would verify it. Nothing in this module is investment or deployment advice; covenants carrying real value need independent review.

### 17.1 The Pipeline at a Glance
<!-- id: wf-pipeline | world: W3 | difficulty: 2 | prereqs: p2sh-state-covenant-lifecycle | status: pedagogical | source: https://docs.kaspa.org/toccata/covenant-state -->

| # | Stage | You produce | Tool / interface | Section |
| :-: | --- | --- | --- | --- |
| 1 | Write | A `.sil` contract | Editor + Silverscript syntax (§8, §9) | §17.3 |
| 2 | Compile and test | Compiled artifact (`SilAbiArtifact`) and passing tests | `silverc`, `cargo test` | §17.4 |
| 3 | Step through locally | Confidence that each entry behaves | `cli-debugger` | §17.5 |
| 4 | Instantiate | Redeem script for chosen constructor arguments, then a P2SH address (version `8`, §16.2) | Compilation API | §17.6 |
| 5 | Run a node | An RPC endpoint on a test network | `kaspad` | §17.7 |
| 6 | Fund | Test coins at a plain (P2PK) address | Miner / faucet | §17.8 |
| 7 | Deploy | Genesis transaction creating the covenant UTXO | A Transaction V1 builder | §17.9, §19 |
| 8 | Spend | Continuation transaction with a state change | Builder + `build_sig_script` | §17.9, §19 |
| 9 | Verify and debug | Decoded program, covenant ID checked, errors resolved | Node RPC, decoders | §17.10, §17.12 |

### 17.2 What Tools Exist
<!-- id: wf-tool-map | world: W3 | difficulty: 2 | prereqs: ecosystem-repos-map | status: unverified | source: https://docs.kaspa.org/toccata/silverscript -->

| id | Tool | Role | Provenance | Confidence |
| --- | --- | --- | --- | --- |
| wf-tool-silverc | `silverc` | The Silverscript compiler binary | Named in the official Silverscript guide as part of the workspace | Name confirmed; command-line flags **not** confirmed |
| wf-tool-silverscript-lang | `silverscript-lang` crate | Compiler library, parser, debugger and tests (a Rust workspace) | Official guide and the project README of an earlier fork | Confirmed |
| wf-tool-cli-debugger | `cli-debugger` | Source-level debugger that steps a contract entry | Official guide (`cargo run -p cli-debugger`); SSOT §1.3 calls it `cli-debugger (sil-debug)` | Confirmed; older revisions used a `sil-debug` binary |
| wf-tool-build-sig-script | `build_sig_script` | API that assembles an input's `signature_script` from an entrypoint ABI | Official guide | Name confirmed; signature not confirmed |
| wf-tool-kaspad | `kaspad` | Rust full node (rusty-kaspa) | Official docs | Confirmed |
| wf-tool-checked-covering | `ComputeBudget::checked_covering_script_units` | rusty-kaspa helper that returns the smallest covering `compute_budget` | Official Script Pricing guide | Confirmed |
| wf-tool-miner-rothschild | `kaspa-miner`, `rothschild` | Test mining and test-transaction generation | Kaspa testnet setup post | Confirmed for testnet-10 |
| wf-tool-kascov-decode | `kascov-decode` | Third-party decoder that names a covenant program from its bytes | Community crate | Third-party; not part of the official toolchain |
| wf-tool-studio | Kaspa SilverScript Studio | Third-party desktop tool that pins specific compiler commits | Community releases | Third-party and described by its authors as experimental |

If the official toolchain changes, trust the repository `README` and release notes over this table.

### 17.3 Step 1: Write the Contract
<!-- id: wf-step-write | world: W2 | difficulty: 2 | prereqs: silverscript-contract-structure, covenant-attribute-syntax | status: mainnet | source: https://docs.kaspa.org/toccata/silverscript -->

Start from a canonical contract in the SSOT (P2PK in §8.7, Counter in §9.5) and change one thing at a time. Every file begins with `pragma silverscript ^0.1.0;` (§8.1).

**Syntax drift warning.** The SSOT writes direct spending doors as `entry name(...)`. The official Silverscript guide currently shows `entrypoint function name(...)` for the same purpose, and its Counter example uses `#[covenant.singleton(mode = transition)]` with a returned `State`. Treat both as the same *concept*; confirm which spelling your compiler revision accepts before copying code between sources (see `REPORT-coverage.md`).

### 17.4 Step 2: Compile and Run the Test Suite
<!-- id: wf-step-compile | world: W3 | difficulty: 2 | prereqs: wf-step-write | status: unverified | source: https://docs.kaspa.org/toccata/silverscript -->

The official guide lists these local commands, run from the Silverscript workspace root:

```
cargo test -p silverscript-lang
```

The test suite includes the covenant declaration fixtures and the integration tests summarized in §11.6. A contract that passes compilation but fails these fixtures should be treated as unfinished.

The compiler binary is `silverc`. Its command-line flags (input file, output path, constructor arguments) are not documented in the sources consulted; run the binary's built-in help after building it, and record the flags you observe in your own notes. This is an `unverified` step.

Compilation produces the artifact described in §10.4 (`SilAbiArtifact`): the `State` struct, the contract's template spans (`state_span.offset`, `state_span.len`), the `template_hash`, and the entry selectors.

**Compiler generations.** A third-party decoder documents two generations of compiler output observed on live networks: a July 2026 fork (numeric dispatch selectors, BLAKE2b template hashes) and SilverScript 1.0 (four-byte KCC-1 dispatch tags, BLAKE3 template hashes). The SSOT describes the second form (§10.1, §10.2). If your compiler revision and the SSOT disagree on selectors or template hashing, the revision wins and the SSOT needs an update.

### 17.5 Step 3: Step Through Locally with the Debugger
<!-- id: wf-step-debug | world: W3 | difficulty: 3 | prereqs: wf-step-compile | status: unverified | source: https://docs.kaspa.org/toccata/silverscript -->

The official guide gives this invocation:

```
cargo run -p cli-debugger -- silverscript-lang/tests/examples/if_statement.sil --function hello
```

Replace the example path with your contract file and `hello` with the entry name. An earlier fork's README showed constructor and function arguments supplied as repeated `--ctor-arg` and `--arg` flags; whether the current debugger keeps those flag names is `unverified`.

### 17.6 Step 4: Instantiate and Derive the Address
<!-- id: wf-step-instantiate | world: W3 | difficulty: 3 | prereqs: wf-step-compile, addr-version-bytes | status: unverified | source: https://docs.kaspa.org/toccata/covenant-state -->

1. Choose constructor arguments (§8.1). These become constants inside the redeem script.
2. Build the initial redeem script `[template_prefix][state_0][template_suffix]` (§10.1) by encoding the initial state with the rules in §10.3.
3. Hash it with BLAKE2b-256 and build the 37-byte P2SH `script_public_key` (`new ScriptPubKeyP2SHFromRedeemScript`, §8.5).
4. Encode that 32-byte hash as a `ScriptHash = 8` address with the target network's prefix (§16.2–§16.5).

The compiler's Rust compilation APIs exist for step 2 and step 3. Their function names are not confirmed here.

**Keep the redeem script preimage.** The chain stores only its hash. You, or an indexer you run, must retain the preimage and the genesis data (Covenant State guide, "Indexers and launch proofs") to explain a UTXO later.

### 17.7 Step 5: Run a Node on a Test Network
<!-- id: wf-step-node | world: W3 | difficulty: 2 | prereqs: addr-network-prefixes | status: testnet | source: https://kaspa.org/?p=52928 -->

The Kaspa testnet-10 setup post gives:

```
kaspad --testnet --netsuffix=10 --utxoindex
```

`--utxoindex` lets the node answer balance and UTXO queries for an address. RPC interface flags and default ports are in §16.6; a Docker alternative with the same flags is published on the `kaspanet/rusty-kaspad` Docker Hub page.

**Which testnet runs Toccata?** Third-party covenant tooling reports its covenant workflows as testnet-10 only. Whether testnet-10 is the right target for a given Silverscript revision is `unverified`; check the Silverscript release notes before choosing a network. An earlier fork's README stated that its compiled output was valid only on a different testnet (testnet-12), which is a reminder that compiled artifacts can be network-specific while a toolchain is experimental.

### 17.8 Step 6: Get Test Coins
<!-- id: wf-step-fund | world: W3 | difficulty: 2 | prereqs: wf-step-node | status: testnet | source: https://kaspa.org/?p=52928 -->

The same post shows how to mine and generate traffic on testnet-10:

```
kaspa-miner --testnet --mining-address <your-address> -p 16210 -t 1
rothschild --private-key <your-private-key> -t=10
```

Use a plain `kaspatest:` address that you control as the mining address. Use **throwaway testnet keys only**: never put a mainnet private key on a command line. The "Integrating with Kaspa" documentation lists public faucets on its "Faucets & Mining" page; this module does not reproduce faucet addresses.

### 17.9 Steps 7–8: Deploy and Spend
<!-- id: wf-step-deploy-spend | world: W3 | difficulty: 4 | prereqs: wf-step-instantiate, tx-v1-schema, covenant-id-lineage | status: mainnet | source: https://docs.kaspa.org/toccata/transaction-v1 -->

A covenant is deployed by a **Genesis** transaction and advanced by **Continuation** transactions (§5.1). What your transaction builder must do, per the SSOT and the official Transaction V1 and Script Pricing guides:

| id | Builder responsibility | Why | Section |
| --- | --- | --- | --- |
| wf-build-version | Set `version = 1` | V0 transactions cannot carry `covenant_binding` or `compute_budget` | §3.1 |
| wf-build-binding | Put `covenant_binding { authorizing_input, covenant_id }` on every covenant output | Genesis ID must equal the §5.2 hash; Continuation must reuse the spent UTXO's ID | §5.1–§5.3 |
| wf-build-sigscript | Assemble `signature_script` as arguments, 4-byte dispatch tag, redeem script preimage | The script engine hashes the last push to check the P2SH lock | §10.2 |
| wf-build-budget | Estimate script units and set each input's `compute_budget` | Too low aborts; too high inflates mass and fees | §3.2, §18 |
| wf-build-storage-mass | Commit the correct `storage_mass` | The node recomputes it with full UTXO context | §18.5 |
| wf-build-fee | Leave `sum(inputs) - sum(outputs)` at least `fee rate × mass` | The fee is the input/output difference | §18.7 |
| wf-build-sign | Sign every key-controlled input over the V1 `sighash` | Signatures cover covenant bindings but not `compute_budget` | §3.3–§3.4 |

Fee-rate guidance is available from the node through its fee-estimate RPC, which returns *low*, *normal* and *priority* buckets in sompi per gram. A field-by-field walkthrough of one full lifecycle is in §19.

**SDK support is unverified.** A Python SDK change log shows the Toccata V1 `computeBudget` field being carried on inputs and a node rejecting mismatched version/field combinations. Whether each SDK exposes covenant binding construction was not confirmed.

### 17.10 Step 9: Verify On-Chain and Debug
<!-- id: wf-step-verify | world: W3 | difficulty: 3 | prereqs: wf-step-deploy-spend | status: unverified | source: https://docs.rs/kascov-decode -->

1. Fetch the spending transaction from your own node, not from a third party you cannot audit.
2. The program that actually ran is the **last push of the input's `signature_script`** (§10.2). Compare its template with your compiled artifact: the `template_hash` (§10.1) should match.
3. Check that every covenant output's `covenant_binding.covenant_id` equals the Covenant ID you expect.
4. A third-party decoder (`kascov-decode`) can name a revealed program and label its state fields; treat its output as a convenience, not as authority.
5. If a spend is rejected, classify the failure with the table in §17.12 before editing code: *resource* failures (budget, mass) are fixed in the transaction, *logic* failures (a `require`) are fixed in the contract.

### 17.11 Testnet vs. Mainnet Checklist
<!-- id: wf-testnet-mainnet | world: W3 | difficulty: 2 | prereqs: addr-network-prefixes | status: pedagogical | source: https://docs.kaspa.org/toccata/silverscript -->

| id | Item | Testnet | Mainnet |
| --- | --- | --- | --- |
| wf-tm-value | Coins | No economic value; free to obtain | Real value; irreversible |
| wf-tm-prefix | Address prefix | `kaspatest` (all testnets share it) | `kaspa` |
| wf-tm-ports | Default gRPC port | `16210` | `16110` |
| wf-tm-rules | Rule set | May differ from mainnet while a fork is being tested | Toccata active since June 30, 2026 (§1.1) |
| wf-tm-compiler | Compiler | Experimental; pin a commit and record it | Pin the same commit; audit before real value |
| wf-tm-audit | Review | Optional | Independent review expected (the official guide says to check the repo and release notes before shipping value) |

### 17.12 Common Compiler, Script and Transaction Errors
<!-- id: wf-error-table | world: W3 | difficulty: 3 | prereqs: wf-step-compile, covenant-validation-rules, silverscript-control-flow-loops, silverscript-time-locks | status: mainnet | source: https://docs.kaspa.org/toccata/script-pricing -->

Only errors grounded in the SSOT's rules, the official docs, or a cited repository change are listed. "Layer" says where the failure occurs.

| id | Symptom | Layer | Cause | Fix | Grounding |
| --- | --- | --- | --- | --- | --- |
| wf-err-auth-from | `binding = auth` with `from > 1` rejected | Compile | `auth` binding supports only `from = 1` | Use `binding = cov` or `from = 1` | SSOT §9.2, §9.3 |
| wf-err-cov-groups | `binding = cov` with `groups = multiple` rejected | Compile | Unsupported combination | Use `groups = single` | SSOT §9.3 |
| wf-err-termination | `termination = allowed` rejected | Compile | Valid only for singleton, `mode = transition` | Remove it or change topology and mode | SSOT §9.3 |
| wf-err-leader-manual-entry | Manual `entry` rejected inside a leader contract | Compile | Leader contracts forbid manual entries | Remove the entry, or add `#[covenant.allow(rule = manual_entrypoint_in_leader_contract)]` deliberately | SSOT §9.3 |
| wf-err-multi-delegate | Second `#[covenant.delegate]` rejected | Compile | At most one delegate per contract | Merge delegate logic into one function | SSOT §9.3 |
| wf-err-mixed-binding | Mixed `auth` and `cov` declarations rejected | Compile | In a leader contract all declarations must use `binding = cov` with the same `delegate_name` | Align all declarations | SSOT §9.3 |
| wf-err-time-domain | `tx.daa >= 600000000000` or a negative constant rejected | Compile | Constant outside the lock domain | Keep DAA locks below `500,000,000,000`; use `tx.time` for timestamps at or above it | SSOT §8.4 |
| wf-err-int-temporal | Type error mixing `int` and `temporal` | Compile | No implicit conversion | Convert explicitly with `temporal(x)` / `int(t)` | SSOT §8.4 |
| wf-err-loop-bound | Constant loop range rejected | Compile | Range provably exceeds `MAX_ITERATIONS` | Raise the bound or shrink the range | SSOT §8.3 |
| wf-err-require | Spend aborts on a `require` | Script | The condition was false | Fix inputs or logic; run in the debugger | SSOT §15.2 |
| wf-err-op-arith | Script aborts in arithmetic | Script | Signed 64-bit overflow, division by zero, or `OpNum2Bin` value too large for its byte size | Bound inputs; check before dividing | SSOT §4.1 |
| wf-err-op-bytes | Script aborts in byte operations | Script | `OpCat` result over 1,000,000 bytes; substring out of range; `OpAnd`/`OpOr`/`OpXor` length mismatch | Check lengths first | SSOT §4.1, §4.2 |
| wf-err-redeem-mismatch | P2SH input fails before your code runs | Script | The revealed redeem script does not hash to the spent output's lock | Reveal the exact preimage that was committed | SSOT §2.3 |
| wf-err-template-mismatch | `validateOutputState` aborts | Script | Output `scriptPubKey` differs from the rebuilt `[prefix][encode(new_state)][suffix]` lock | Build the output from the same template and encode the state exactly | SSOT §8.5 |
| wf-err-binding-invalid | Transaction rejected for a covenant binding | Consensus | `authorizing_input` out of range, or the ID is neither a valid Continuation nor a valid Genesis | Reuse the spent UTXO's ID, or compute the §5.2 hash exactly | SSOT §5.1, §5.2 |
| wf-err-gas-lane | Transaction rejected over `gas` | Consensus | `gas > 0` outside a V1 user lane, or an invalid namespace | Set `gas = 0` on native lanes | SSOT §3.5 |
| wf-err-budget-low | Validation fails though the logic is right | Consensus | Input consumed more script units than `compute_budget × 10,000 + 9,999` | Re-estimate and raise `compute_budget` (§18.3) | Official Script Pricing guide; the error name `ExceededCommittedScriptUnits` appears only in a third-party tool description (`unverified`) |
| wf-err-version-fields | Node rejects a transaction at submit | Consensus/RPC | Non-zero `computeBudget` on a version 0 transaction, or non-zero `sigOpCount` on version 1 | Use `version = 1` with `sig_op_count = 0` and a budget | Python SDK pull request citing `rpc/core/src/convert/tx.rs` |
| wf-err-storage-mass | Transaction rejected for mass | Mempool/consensus | Storage mass too high, e.g. one small input fanning out to many small outputs | Add inputs, merge outputs, enlarge outputs (§18.5) | KIP-9 |

### 17.13 Glossary Additions for §17
<!-- id: wf-glossary-additions | world: W3 | difficulty: 1 | prereqs: wf-tool-map | status: unverified | source: https://docs.kaspa.org/toccata/silverscript -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| wf-gloss-silverc | **silverc** | The Silverscript compiler program. | Compiler binary in the Silverscript workspace; flags unconfirmed. |
| wf-gloss-cli-debugger | **cli-debugger** | A tool that runs one entry of a contract step by step. | Source-level debugger crate in the Silverscript workspace. |
| wf-gloss-fixture | **Covenant fixture** | A ready-made test case proving a covenant behaves. | Test data under `silverscript-lang/tests`. |
| wf-gloss-testnet | **Testnet** | A practice network where coins are worthless. | A Kaspa network type with prefix `kaspatest`; numbered by suffix. |

