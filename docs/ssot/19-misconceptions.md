## 23. Common Misconceptions
<!-- id: myth-module | world: unmapped | difficulty: 2 | prereqs: envelope-metaphor-map, utxo-model-vs-account, security-core-invariants | status: mainnet | source: ssot §12.1 -->

Each row states a **Myth**, the **Reality**, **why people believe it**, and where to read more. Rows are grouped by topic, carry their own `id`, and are written so each can become a true/false or "spot the error" question. "Ref" uses existing SSOT section numbers (`§`) and the new sections of this addition (`§16`–`§22`).

### 23.1 UTXO and Account Thinking
<!-- id: myth-utxo-account | world: W1 | difficulty: 1 | prereqs: utxo-anatomy-sompi, utxo-model-vs-account | status: mainnet | source: ssot §2.1 -->

| id | Myth | Reality | Why people believe it | Ref |
| --- | --- | --- | --- | --- |
| myth-account-balance | "Kaspa keeps a balance per account." | Value lives in UTXOs; a wallet's "balance" is the sum of the UTXOs it can spend. | Exchanges and wallets display one number. | §0.2, §2.1 |
| myth-edit-in-place | "A contract updates its UTXO in place." | A spend destroys the old UTXO and creates successors; entries are immutable. | Account-chain contracts overwrite storage. | §0.2, §2.3 |
| myth-global-storage | "A covenant has storage slots like an EVM contract." | State is bytes inside the redeem script preimage of one UTXO; there is no shared storage. | "Contract state" sounds like storage. | §1.2, §20.1 |
| myth-contract-runs-itself | "A covenant runs on its own when its time lock expires." | A script executes only when someone spends the UTXO; a lock only defines when a spend becomes valid. | Time locks feel like timers. | §2.3, §20.1 |
| myth-calls | "One covenant can call another." | There is no external call or `eval`; contracts cooperate by being co-spent in one transaction. | Account chains have `CALL`. | §13.3, §20.1 |
| myth-lane-parallel | "A KIP-21 lane means parallel execution." | A lane partitions sequencing commitments so proofs scale with lane activity; parallelism comes from disjoint UTXOs. | The word "lane" suggests parallel traffic. | §1.2, §6.1, §22.6 |

### 23.2 Covenants, State and Covenant IDs
<!-- id: myth-covenants | world: W3 | difficulty: 3 | prereqs: what-is-a-covenant, covenant-id-lineage, covenant-id-nonforgeability | status: mainnet | source: ssot §5.4 -->

| id | Myth | Reality | Why people believe it | Ref |
| --- | --- | --- | --- | --- |
| myth-signature-is-covenant | "A signature lock is already a covenant." | A signature lock only authorizes; a covenant also constrains the spending transaction's outputs. | Both are "locking scripts". | §2.2 |
| myth-covid-checks-rules | "A Covenant ID makes outputs obey the covenant's rules." | Consensus checks family admission only; the script must validate the successor's state and template. | "Consensus-tracked" sounds like "consensus-enforced rules". | §5.4, §12.1 |
| myth-covid-forgeable | "Anyone can attach an existing family's ID to an output." | Only an input that already carries the ID (Continuation), or the one-time Genesis hash, admits it. | Labels seem copyable. | §5.1, §5.4 |
| myth-covid-changes | "The Covenant ID changes when the state changes." | The P2SH hash changes with state; the Covenant ID stays the same across generations. | The address changes visibly. | §2.3, §5.1 |
| myth-hash-always-changes | "The P2SH hash changes on every spend no matter what." | It changes because `state_1 != state_0` changes the redeem script bytes; identical state would give an identical script. Lineage comes from the binding, not from the hash. | The SSOT's usual example changes state each time. | §2.3, §19.5 |
| myth-address-stable | "A covenant has one permanent address." | The P2SH address encodes the current script hash and moves with state; follow the Covenant ID instead. | Account chains have fixed contract addresses. | §16.8 |
| myth-genesis-validated | "Consensus validates a covenant's initial state at deploy." | The covenant script is not executed when its output is created; the first state is whatever the deployer wrote. | Deployment feels like an "initialization call". | §19.3 |
| myth-state-hidden | "A covenant's state is secret until spent." | It is only unpublished; low-entropy states can be guessed by hashing, and a creator may publish the preimage. | "Hidden behind a hash" sounds private. | §16.9 |
| myth-macro-keeps-value | "`Counter` automatically keeps the covenant's KAS value." | `validateOutputState` checks the successor's lock, not its value; value rules need explicit checks. | Macros feel like they cover everything. | §9.5, §20.5 |
| myth-tokens-consensus | "Kaspa consensus knows about tokens." | Consensus tracks KAS and Covenant IDs; token balances are script-defined state (KCC20) or indexer-defined (inscription protocols). | Wallets show tokens beside KAS. | §11.1, §20.6, §21 |
| myth-krc20-equals-kcc20 | "KRC-20 and KCC20 are the same thing." | KRC-20 validity is decided by an indexer; KCC20 validity is enforced by covenant scripts at spend time. | Similar names. | §21.1, §21.4 |

### 23.3 Compute Budget, Mass and Fees
<!-- id: myth-fees | world: W1 | difficulty: 3 | prereqs: tx-compute-budget, fee-mass-module | status: mainnet | source: https://docs.kaspa.org/toccata/script-pricing -->

| id | Myth | Reality | Why people believe it | Ref |
| --- | --- | --- | --- | --- |
| myth-budget-signed | "Changing `compute_budget` invalidates signatures." | It is committed in `tx::hash` but excluded from `txid` and `sighash`, so it can be tuned without re-signing. | Most fields are signed. | §3.2, §3.4 |
| myth-budget-max | "Always set the maximum budget to be safe." | An oversized budget inflates compute mass, fees and block-admission difficulty. | Failures are scary. | §3.2, §18.3 |
| myth-budget-zero-sig | "`compute_budget = 0` is enough to verify a signature." | One verification attempt costs `100,000` script units; budget `0` grants `9,999`; one signature needs budget `10`. (§3.2's P2PK remark conflicts; see the report.) | Budget `0` looks like "the default". | §18.3 |
| myth-sigops | "V1 inputs still carry `sig_op_count`." | V1 inputs carry `compute_budget`; a node rejects non-zero `sig_op_count` on version 1. | V0 habits. | §3.1, §17.12 |
| myth-fee-is-mass | "The fee is whatever the mass is." | The fee is `sum(inputs) - sum(outputs)` and must be at least `fee rate × mass`; the minimum rate is `1.0` sompi per gram. | At rate `1.0`, numbers coincide. | §18.7 |
| myth-many-outputs | "Splitting into many small outputs is free." | KIP-9 storage mass makes small fan-outs expensive; a 1-to-10 fan-out of 0.0999 KAS outputs reaches `991,000` grams. | Outputs look cheap to create. | §18.5 |
| myth-compounding-costly | "Merging many inputs into one output is penalized." | Compounding into equal or fewer outputs of equal value has zero storage mass. | "Consolidation" sounds like work. | §18.5 |
| myth-latency-cost | "STARK verification costs 738 times a signature in script units." | `738×` is a latency ratio; script units are fixed constants: `25,000,000` versus `100,000` per signature (`250×`). | The ratios appear together in the SSOT. | §7.1, §22.4 |

### 23.4 Cryptography, Signatures and Proofs
<!-- id: myth-crypto | world: W2 | difficulty: 3 | prereqs: silverscript-data-types, kip16-proof-systems | status: mainnet | source: ssot §8.2 -->

| id | Myth | Reality | Why people believe it | Ref |
| --- | --- | --- | --- | --- |
| myth-schnorr-ecdsa-same | "Schnorr and ECDSA addresses are interchangeable." | They use different address versions (`0` and `1`), key sizes (32 vs 33 bytes) and opcodes (`0xac` vs `0xab`). | Both are "a public key". | §16.2 |
| myth-sig-size | "A signature is 64 bytes everywhere." | `sig` is 65 bytes (64 + sighash flag); `datasig` is 64 bytes. | Raw signatures are 64 bytes. | §8.2 |
| myth-checksig-aborts | "`checkSig(s, pk);` aborts the script on a bad signature." | It pushes a boolean; without `require(...)` the failure is ignored. | Other primitives abort. | §12.3 (BUG-08) |
| myth-cast-checked | "`byte[32](data)` checks the length." | It is an unchecked assertion; check `data.length` first. | Casts usually validate. | §8.5, §12.1 |
| myth-int-nonnegative | "`int` is non-negative." | `int` is signed 64-bit; sums can be gamed with negative pieces unless each amount is constrained. | Amounts feel unsigned. | §12.1, §9.7 |
| myth-groth16-pq | "Groth16 is quantum-safe." | It is not post-quantum; the RISC Zero STARK path is. | "ZK" sounds like "future-proof". | §7.1, §22.4 |
| myth-zk-private | "Verifying a proof in script makes the application private." | Verification gives compression; privacy exists only if the design hides the witness. | "Zero-knowledge" in the name. | §22.1 |
| myth-proof-validates-output | "A valid proof means the successor output is correct." | `OpZkPrecompile` checks the proof; the script must still bind public inputs and validate the successor output. | The proof "proves the transition". | §22.3 |

### 23.5 Time, Loops and the Language
<!-- id: myth-language | world: W2 | difficulty: 2 | prereqs: silverscript-control-flow-loops, silverscript-time-locks | status: mainnet | source: ssot §8.3 -->

| id | Myth | Reality | Why people believe it | Ref |
| --- | --- | --- | --- | --- |
| myth-runtime-loops | "A Silverscript `for` loop can run any number of times." | Loops are unrolled at compile time to `MAX_ITERATIONS` guarded copies. | Loops in other languages. | §8.3, §20.2 |
| myth-monotonic-time | "Block timestamps always increase." | Sub-second block creation means timestamps along the selected-parent chain are not strictly monotonic; use DAA score or enforce progression. | Linear-chain intuition. | §0.1 |

### 23.6 Networks, Tooling and Based Apps
<!-- id: myth-networks-tooling | world: W1 | difficulty: 2 | prereqs: addr-networks-module, wf-tooling-module | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

| id | Myth | Reality | Why people believe it | Ref |
| --- | --- | --- | --- | --- |
| myth-testnet-same | "Testnet is mainnet with free coins; everything else is identical." | Prefix, ports, rule set and compiler support can differ; compiled artifacts may be network-specific while tooling is experimental. | Same software. | §16.5, §17.11 |
| myth-testnet-prefix | "A `kaspatest:` address says which testnet it belongs to." | There is one testnet prefix; the suffix (`10`, `11`, …) is not encoded in addresses. | Prefixes name networks. | §16.5 |
| myth-address-hides-key | "A Kaspa address always hides the public key behind a hash." | A `PubKey = 0` address contains the 32-byte public key itself. | Some other chains hash the key. | §16.2, §16.11 |
| myth-every-op-covenant | "Every based-app operation is a covenant spend." | User operations are ordinary V1 transactions on a lane; only settlement spends the covenant. | "Smart contract call" thinking. | §14, §22.5 |
| myth-compiler-stable | "Silverscript syntax and output are frozen." | The official guide says it is still moving toward an audited interface; spellings and selectors have changed between compiler generations. | Version `0.1.0` pragma looks stable. | §1.2, §17.3, §17.4 |

