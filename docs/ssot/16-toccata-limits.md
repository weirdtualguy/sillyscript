## 20. What Toccata Does Not Allow
<!-- id: lim-module | world: unmapped | difficulty: 3 | prereqs: architecture-mental-model, script-engine-limits, covenant-validation-rules | status: mainnet | source: https://docs.kaspa.org/toccata/covenant-state -->

Knowing what a system refuses to do is as useful as knowing what it does. Each row below states a limit or non-goal, **why** it exists, and **what to do instead**. Rows are drawn from the existing SSOT, the Kaspa KIPs and the official Toccata guides; a row whose support is only an inference from the SSOT's tables is marked `unverified`. Rows are written as single, testable statements so they can seed quiz questions (§20.7).

### 20.1 Execution Model
<!-- id: lim-execution-model | world: W1 | difficulty: 2 | prereqs: architecture-mental-model, utxo-model-vs-account | status: mainnet | source: https://docs.kaspa.org/toccata/covenant-state -->

| id | Limit or non-goal | Why it exists | What to do instead | SSOT |
| --- | --- | --- | --- | --- |
| lim-no-global-vm | There is no global virtual machine with shared, contended storage slots. | Toccata is UTXO-native: independent UTXOs share no mutable state, so unrelated spends validate in parallel. | Spread state over many UTXO cells, or use a Based App (§6) for genuinely shared state. | §1.1, §1.2, §2.1 |
| lim-no-shared-mutable-state | No contract can update a shared variable in place. | A spend consumes a UTXO and creates successors; entries are immutable. | Model a change as `state_0` to `state_1` in a successor output (§2.3). | §0.2, §2.3 |
| lim-no-auto-run | A covenant never runs by itself or on a timer. | Its script executes only when someone spends its UTXO. | Make sure a party with an incentive can submit the spend; use time locks (`tx.daa`, `this.ageDaa`) to define *when* a spend becomes valid, not to trigger it. | §2.3, §8.4 |
| lim-no-calls | A covenant cannot call another contract. | Kaspa Script has no dynamic `eval` or external call. | Co-spend both UTXOs in one transaction and cross-check IDs and templates (ICC, §13.3). | §13.3 |
| lim-single-tx-view | A covenant sees only the spending transaction it runs in. | Introspection opcodes read the current transaction's inputs, outputs and fields. | Pass facts through co-spent inputs, outputs, `payload`, or witness arguments. | §2.2, §4.1 |
| lim-no-global-ordering | A covenant cannot rely on a linear block height. | The ledger is a BlockDAG; header timestamps are not strictly monotonic. | Use DAA score (`tx.daa`, `this.ageDaa`) or enforce timestamp progression in state (§0.1). | §0.1 |

### 20.2 Control Flow and Arithmetic
<!-- id: lim-control-arithmetic | world: W2 | difficulty: 3 | prereqs: silverscript-control-flow-loops, silverscript-data-types | status: mainnet | source: ssot §8.3 -->

| id | Limit or non-goal | Why it exists | What to do instead | SSOT |
| --- | --- | --- | --- | --- |
| lim-no-runtime-loops | There are no runtime (backward-jumping) loops. | Kaspa Script has no backward jumps; the compiler unrolls `for` loops. | Put a compile-time `MAX_ITERATIONS` on every loop (§8.3). | §8.3 |
| lim-loop-bound-explicit | Do not rely on the compiler's own check of loop length in hand-written entries. | The emitted `end - start <= MAX_ITERATIONS` assertion is described as transient behavior. | Write `require(arr.length <= MAX_ITERATIONS)` yourself; `#[covenant(from = X, to = Y)]` wrappers enforce it for you. | §8.3, §12.1 |
| lim-int-64bit | `int` is a signed 64-bit value; there is no arbitrary-precision arithmetic. | Script numbers are at most 8 bytes; overflow aborts. | Bound amounts; check non-negativity of every summed field (§12.1). | §8.2, §4.1 |
| lim-div-zero | Division or modulo by zero, and `i64::MIN / -1`, abort the script. | Defined failure semantics for `OpDiv`/`OpMod`. | Check divisors with `require` first. | §4.1 |
| lim-num2bin-range | `OpNum2Bin` handles sizes `1` to `8` bytes only and fails on overflow. | Fixed-size encodings of script numbers. | Choose `N` large enough, or store amounts as `int` (8 bytes). | §4.1, §8.5 |
| lim-disabled-shifts | `OpLeft`, `OpRight`, `OpLShift`, `OpRShift` remain disabled. | Legacy splice and shift opcodes stay off. | Use `OpSubstr`, `OpCat`, `OpMul`, `OpDiv`. | §4.1 |
| lim-casts-unchecked | `byte[N](dynamicBytes)` does not check the length. | It is a compile-time assertion only. | `require(dynamicBytes.length == N)` before casting. | §8.5, §12.1 |
| lim-no-implicit-clock | `int` never converts implicitly to `temporal`. | Prevents mixing DAA scores and millisecond timestamps. | Convert with `temporal(x)` / `int(t)`; keep each constant in its domain. | §8.4 |

### 20.3 Size and Resource Limits
<!-- id: lim-size-resource | world: W1 | difficulty: 3 | prereqs: tx-compute-budget, script-engine-limits | status: mainnet | source: https://docs.kaspa.org/toccata/script-pricing -->

| id | Limit or non-goal | Why it exists | What to do instead | SSOT |
| --- | --- | --- | --- | --- |
| lim-script-element | A stack element is at most `1,000,000` bytes (`MAX_SCRIPT_ELEMENT_SIZE`). | Bounds memory per element (raised from `520`). | Commit to large data by hash. | §4.3 |
| lim-script-size | Scripts total at most `1,000,000` bytes and `1,000,000` ops (`MAX_SCRIPTS_SIZE`, `MAX_OPS_PER_SCRIPT`). | Bounds validation work; ops are further capped by the compute budget. | Keep contracts small; split logic across co-spent contracts. | §4.3 |
| lim-sigscript-size | A `signature_script` is at most `250,000` bytes. | Bounds witness size. | Reveal only what must be revealed. | §3.1, §4.3 |
| lim-opcat-size | `OpCat` fails if the result exceeds `1,000,000` bytes; substring bounds are strict. | Same element cap. | Check lengths before concatenating. | §4.1, §4.2 |
| lim-budget-cap | No input can buy more than `655,359,999` script units. | `compute_budget` is a `u16`: `65,535 × 10,000 + 9,999`. | Split heavy work across inputs or proofs; practical limits are mass limits long before this one. | §3.1, §3.2, §18.2 |
| lim-budget-binds | An input that exceeds `compute_budget × 10,000 + 9,999` units fails even if its logic is correct. | Execution room is purchased, not unlimited. | Estimate script units and raise the budget (§18.3). | §3.2 |
| lim-state-small | State must stay small enough for script limits and transaction mass. | Every spend re-pushes the redeem script and rebuilds the successor. | Store large data off-chain with an on-chain commitment (hash). | §10.1 |
| lim-fanout-mass | Fanning one small input out to many small outputs is priced out. | KIP-9 storage mass punishes UTXO bloat. | Merge first, use larger outputs, or use the `0xFF` path for tokens (§18.5, §18.6). | §0.3, §11.3 |
| lim-lane-count | At most `50` distinct non-coinbase lanes appear in a block. | Bounds per-block sequencing state. | Share a lane namespace sensibly; do not spawn lanes per user. | §6.3 |
| lim-lane-gas | A lane's gas in one block must not exceed `1,000,000,000`; native and reserved lanes must set `gas = 0`. | Admission control per lane. | Keep payload operations within the lane's gas policy. | §3.5, §6.3 |

### 20.4 What a Script Cannot See
<!-- id: lim-introspection | world: W2 | difficulty: 4 | prereqs: opcode-reference, tx-v1-commitments | status: unverified | source: https://docs.kaspa.org/toccata/transaction-v1 -->

The first two rows are inferences from the *absence* of an opcode in §4.1's 55-opcode tables; they should be confirmed against KIP-17 (see `REPORT-coverage.md`).

| id | Limit or non-goal | Why it exists | What to do instead | Basis |
| --- | --- | --- | --- | --- |
| lim-no-own-txid | No opcode in §4.1 pushes the current transaction's own `txid` or `sighash`. | A transaction id commits to the outputs a script is validating, so a script reading it would be circular. | Validate outputs and outpoints directly (`OpOutpointTxId`, `OpTxOutputSpk`). | Inference (`unverified`) |
| lim-no-resource-fields | `compute_budget` and `storage_mass` are not exposed to scripts. | They are resource commitments excluded from `txid` and `sighash` (§3.4). | Size budgets in the transaction builder, outside policy. | Inference (`unverified`); SSOT §3.4 |
| lim-no-header-clock | Scripts read time only through `lock_time` (`tx.daa`, `tx.time`), an input's creating DAA score, and `OpChainblockSeqCommit`. | These are the exposed clocks in §4.1 and §6.3. | Anchor time-dependent logic to those. | SSOT §4.1, §6.3 |
| lim-seqcommit-window | `OpChainblockSeqCommit` accepts only a chain-block ancestor within the consensus horizon. | Bounds how far back a script may anchor. The official guide ties the window to finality depth; mainnet finality duration is `43,200` seconds. | Settle based-app batches before the anchor ages out. | SSOT §6.3; Based Apps guide |
| lim-covid-not-rules | A Covenant ID does not make an output obey your rules. | Consensus checks family admission only; it does not read output scripts. | Validate the successor's state and template in the script (§5.4). | SSOT §5.4 |
| lim-zero-covid | `OpInputCovenantId` and `OpOutputCovenantId` return 32 zero bytes for "none". | A sentinel value; unbound output authorizing input is `-1`. | Compare against the zero hash explicitly. | SSOT §4.1 |

### 20.5 Silverscript Declaration Rules
<!-- id: lim-silverscript-rules | world: W4 | difficulty: 3 | prereqs: covenant-validation-rules, pattern-leader-delegate | status: mainnet | source: ssot §9.3 -->

| id | Limit or non-goal | Why it exists | What to do instead | SSOT |
| --- | --- | --- | --- | --- |
| lim-auth-from-one | `binding = auth` requires `from = 1`. | `auth` asks which outputs one input authorized. | Use `binding = cov` for many inputs. | §9.2, §9.3 |
| lim-cov-no-multi-groups | `binding = cov` cannot combine with `groups = multiple`. | Rejected by the compiler. | Use `groups = single`. | §9.3 |
| lim-termination-scope | `termination = allowed` works only for singleton, `mode = transition`. | Exit semantics are defined for 1:1 only. | Model exits differently in other topologies. | §9.3 |
| lim-homogeneous-template | `#[covenant]` assumes every input and output shares one template and `State` layout. | The generated wrapper decodes states uniformly. | For heterogeneous families use `validateOutputStateWithInputTemplate` and `readInputStateWithTemplate`. | §9.3 |
| lim-leader-manual-entry | A leader contract cannot declare a manual `entry` unless explicitly allowed. | Prevents bypassing the generated leader wrapper. | Use the annotation only deliberately. | §9.3 |
| lim-one-delegate | At most one `#[covenant.delegate]` per contract. | Single delegate hook. | Combine local checks in one function. | §9.3 |
| lim-delegate-blind | A generated delegate cannot tell which entry the leader chose. | It authenticates only the leader's template. | Put entry-specific safety in the leader policy. | §13.2 |
| lim-macro-no-value-check | The `Counter`-style macro form checks the successor's script, not its value. | `validateOutputState` compares `scriptPubKey` only. | Add explicit `value` checks if value must be preserved. | §8.5 |

### 20.6 Cryptography and Proofs
<!-- id: lim-crypto-proofs | world: W6 | difficulty: 3 | prereqs: kip16-proof-systems, kip21-lane-rules-proving | status: mainnet | source: https://docs.kaspa.org/toccata/inline-zk -->

| id | Limit or non-goal | Why it exists | What to do instead | SSOT |
| --- | --- | --- | --- | --- |
| lim-groth16-not-pq | Groth16 proofs (`0x20`) are not post-quantum secure. | Pairing-based SNARK. | Use RISC Zero Succinct (`0x21`) when post-quantum security matters. | §7.1 |
| lim-proof-binds-program | A valid proof is meaningful only for the exact verifying key or image id and public inputs the script expects. | A proof valid for the wrong program proves nothing about yours. | Pin the key or image id and bind public inputs to old and new commitments. | §7.1 |
| lim-proof-not-output | Verifying a proof does not create or validate the successor output. | The script must still check the output it is installing. | Check `covenant_binding` and the successor lock after verification. | §5.4 |
| lim-lane-not-parallel | A "lane" is a sequencing partition, not parallel UTXO execution. | KIP-21 partitions *commitments* so proofs scale with lane activity. | Use separate UTXO branches for parallelism, lanes for proof scaling. | §1.2, §6.1 |
| lim-no-consensus-tokens | Consensus has no token type. | It tracks KAS values and Covenant IDs; token balances are script-defined state. | Use a token covenant such as KCC20 (§11, §21). | §11.1 |

### 20.7 Quiz Seeds
<!-- id: lim-quiz-seeds | world: unmapped | difficulty: 2 | prereqs: lim-module | status: pedagogical | source: ssot §4.3 -->

| id | Statement to judge | Answer | Rows |
| --- | --- | --- | --- |
| lim-quiz-1 | A covenant executes automatically when its time lock expires. | False; it runs only when spent. | lim-no-auto-run |
| lim-quiz-2 | A Silverscript `for` loop can iterate an unbounded number of times. | False; it is unrolled to `MAX_ITERATIONS`. | lim-no-runtime-loops |
| lim-quiz-3 | The largest `compute_budget` any V1 input can declare grants `655,359,999` script units. | True. | lim-budget-cap |
| lim-quiz-4 | One covenant can call a function in another covenant. | False; co-spend and cross-check. | lim-no-calls |
| lim-quiz-5 | `byte[32](data)` verifies that `data` has 32 bytes. | False; it is unchecked. | lim-casts-unchecked |
| lim-quiz-6 | Setting `covenant_id` on an output forces the output to obey the family's rules. | False; the script must validate it. | lim-covid-not-rules |
| lim-quiz-7 | A block may touch any number of lanes. | False; at most `50` non-coinbase lanes. | lim-lane-count |
| lim-quiz-8 | A stack element may be `2,000,000` bytes. | False; the cap is `1,000,000`. | lim-script-element |
| lim-quiz-9 | Groth16 verification is post-quantum secure. | False. | lim-groth16-not-pq |
| lim-quiz-10 | A script can read the current transaction's `storage_mass` through an opcode. | Not in the SSOT opcode tables (`unverified`). | lim-no-resource-fields |

### 20.8 Glossary Additions for §20
<!-- id: lim-glossary-additions | world: unmapped | difficulty: 1 | prereqs: lim-module | status: mainnet | source: ssot §4.3 -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| lim-gloss-non-goal | **Non-goal** | Something the design deliberately does not try to do. | A property the protocol excludes by design (e.g. a global VM). |
| lim-gloss-consensus-horizon | **Consensus horizon** | How far back a script may look for a sequencing anchor. | Depth bound for `OpChainblockSeqCommit`; tied to finality depth in the official guide. |
| lim-gloss-sentinel | **Sentinel value** | A special value meaning "none". | 32 zero bytes for no Covenant ID; `-1` for no authorizing input. |

