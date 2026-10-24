## 0. Kaspa Fundamentals & The Envelope Mental Model
<!-- id: kaspa-fundamentals | world: W1 | difficulty: 1 | prereqs: none | status: unverified -->

### 0.1 BlockDAG, GHOSTDAG, DAA Score, and Blue Score
<!-- id: blockdag-ghostdag-daa | world: unmapped | difficulty: 2 | prereqs: none | status: unverified -->

Kaspa replaces the sequential, single-chain topology of traditional Nakamoto consensus with a directed acyclic graph of blocks (BlockDAG) ordered deterministically via the GHOSTDAG protocol. Rather than discarding concurrently mined blocks as orphans, GHOSTDAG incorporates parallel blocks into the ledger and establishes a canonical topological ordering over the mergeset of each accepting chain block. Because multiple blocks enter the ledger simultaneously, smart contracts and sequencing commitments cannot rely on a linear block height; instead, they anchor temporal and ordering logic to DAG-native progression metrics.

Two distinct consensus counters govern time and progression across the Kaspa BlockDAG. The **DAA Score (block_daa_score / tx.daa)** is the Difficulty Adjustment Algorithm score, functioning as Kaspa's monotonic block-count analog. It increments as blocks are added to the DAG and serves as the primary height-like clock for absolute transaction locktimes (tx.daa >= N) and relative UTXO age locks (this.ageDaa >= N). By contrast, the **Blue Score (blue_score)** is the GHOSTDAG consensus metric measuring the cumulative number of well-connected honest ("blue") blocks in the causal past of a given block. Under KIP-21, blue_score is cryptographically committed inside MergesetContextHash(B) and governs the inactivity horizon F after which idle application lanes are purged from the active state tree. Crucially, block header timestamps along the selected-parent chain are not strictly monotonic due to sub-second block creation rates; applications requiring strict temporal monotonicity must enforce timestamp progression within covenant state transitions or rely on monotonic DAA and blue scores.

### 0.2 UTXO Anatomy & Native Denominations
<!-- id: utxo-anatomy-sompi | world: W1 | difficulty: 1 | prereqs: none | status: unverified -->

Kaspa's ledger state is distributed entirely across immutable Unspent Transaction Outputs (UTXOs) rather than centralized account balances. The base atomic unit of value on Kaspa is the **sompi**, where 1\text{ KAS} = 10^8\text{ sompi}. Every live UTXO in the consensus set is uniquely addressed by an **outpoint**—comprising the 32-byte creating transaction identifier (tx_id) and a 32-bit little-endian output index (index)—and stores a UtxoEntry containing five consensus fields:

```
UtxoEntry {
    amount: u64,                      // Value in sompi
    script_public_key: ScriptPublicKey, // Version (u16) + locking script bytes
    block_daa_score: u64,             // DAA score of the creating block
    is_coinbase: bool,                // Whether created by a coinbase tx
    covenant_id: Option<Hash32>,      // KIP-20 consensus lineage identifier
}
```

Because an outpoint can be consumed only once in the history of the ledger, spending a UTXO permanently destroys that entry and creates zero or more new UTXOs. Independent UTXOs share no mutable global storage slots, enabling unrelated transactions to validate and execute in parallel without state contention.

### 0.3 Transaction Mass Model (KIP-9 & KIP-25)
<!-- id: tx-mass-model | world: unmapped | difficulty: 3 | prereqs: utxo-anatomy-sompi | status: mainnet -->

To prevent network resource exhaustion across bandwidth, computation, and long-term UTXO storage, Kaspa bounds block capacity using a unified **Transaction Mass** metric calculated as the maximum of three independent mass dimensions:

\text{Mass}(tx) = \max\left(\text{Mass}_{\text{transient}}(tx),\; \text{Mass}_{\text{compute}}(tx),\; \text{Mass}_{\text{storage}}(tx)\right)

**Transient (Bandwidth) Mass** scales linearly with the serialized byte size of the transaction, including input signature_script witness data (capped at 250,000\text{ bytes} per input post-Toccata) and raw transaction payloads. **Compute Mass (KIP-25)** replaces Transaction V0's legacy signature-operation counting (sig_op_count) with a per-input compute_budget: u16 committed in tx::hash, pricing script execution in compute-grams across arithmetic, hashing, introspection, and inline ZK verification. **Storage Mass (KIP-9)** penalizes transactions that increase net UTXO set bloat by creating multiple low-value outputs relative to the inputs consumed. Under KIP-20, any UTXO carrying a covenant_id incurs an additional 32-byte footprint in storage mass accounting. Furthermore, KIP-9 storage mass economics directly motivate the KCC20 Borrower Path extension (0xFF), which allows senders to deposit tokens into an existing recipient UTXO in place rather than funding the KAS storage mass of a fresh UTXO.

### 0.4 The Canonical Envelope Metaphor Mapping
<!-- id: envelope-metaphor-map | world: unmapped | difficulty: 1 | prereqs: utxo-anatomy-sompi | status: pedagogical -->

In the SillyKuest educational curriculum, every consensus primitive is introduced through a concrete physical analogy—a sealed envelope containing coins and a sticky note—before unveiling its formal specification term. To maintain strict pedagogical consistency across lessons, interactive widgets, and technical documentation, all educational artifacts map to the following canonical correspondence.

| Physical Analogy (Curriculum Layer) | Consensus / Silverscript Term | Technical Mechanism & Role |
| --- | --- | --- |
| **Sealed Envelope** | UTXO (UtxoEntry) | An immutable container of coins; never edited in place, only opened once (spent) and replaced by new envelopes. |
| **Coins Inside the Envelope** | value / amount (u64) | Native KAS value denominated in sompi, inspected via tx.inputs[i].value and tx.outputs[i].value. |
| **Fingerprint on the Outside Flap** | P2SH (ScriptPublicKey) | A 37-byte locking script (new ScriptPubKeyP2SH(hash)) committing to the BLAKE2b hash of the inner redeem script; changes whenever state changes. |
| **Full Script Hidden Inside** | Redeem Script Preimage | The actual executable script revealed in the spending input's signature_script, laid out as [template_prefix][runtime_state][template_suffix]. |
| **Sticky Note Inside the Envelope** | State (runtime_state) | Mutable contract fields encoded as fixed/variable byte slices in the middle of the redeem script preimage. |
| **Immutable Name Printed on the Envelope** | Constructor Parameter | Constants baked directly into template_prefix or template_suffix when the contract is compiled and instantiated. |
| **Rule Stapled to the Envelope** | Covenant (KIP-17) | A spending condition that introspects and constrains the entire spending transaction (outputs, amounts, templates, and bindings). |
| **Door on the Contract** | entry + Dispatch Tag | A specific spending path selected by a 4-byte KCC-01 selector (blake3("entryName(...)")[0..4]) appended to the signature script. |
| **Permanent Family Badge / Wax Seal** | Covenant ID (KIP-20 Hash32) | A consensus-tracked 32-byte identifier that remains invariant across generations even as the P2SH fingerprint changes on every state update. |
| **Approval Tag on a New Envelope** | Covenant Binding | The V1 output struct { authorizing_input: u16, covenant_id: Hash32 } linking a successor output to its parent input and family. |
| **Co-Signing at the Same Table** | Inter-Covenant Communication (ICC) | Multi-contract coordination achieved by spending two covenant UTXOs in the same transaction and cross-checking OpInputCovenantId. |
| **Dedicated App Highway Lane** | User Lane (KIP-21) | A V1 transaction carrying a 4-byte namespace in subnetwork_id ([ns: 4B, 0x00 \* 16]) enabling O(\text{activity}) ZK sequencing proofs. |

## 1. Overview & Architecture
<!-- id: overview-architecture | world: W1,W6 | difficulty: 1 | prereqs: none | status: unverified -->

### 1.1 What Is Toccata?
<!-- id: toccata-overview | world: W1 | difficulty: 1 | prereqs: utxo-anatomy-sompi | status: mainnet -->

Toccata is Kaspa's mainnet programmability hard fork, activated on **June 30, 2026, at DAA score `474,165,565`**. The upgrade is strictly **UTXO-native** rather than account-native, avoiding a global virtual machine with contended shared storage slots in favor of empowering UTXO locking scripts to inspect transactions, track stateful lineage across spends, verify zero-knowledge proofs inline, and anchor off-chain execution to partitioned Layer-1 sequencing commitments.

The Toccata architecture comprises six coordinated consensus upgrades. **Inline ZK Precompiles (KIP-16)** introduce `OpZkPrecompile` (`0xa6`) to verify Arkworks Groth16 (`0x20`) and RISC Zero Succinct STARK (`0x21`) proofs directly within L1 scripts. **Covenants & Introspection (KIP-17)** provide transaction, input, output, byte-manipulation, arithmetic, and cryptographic opcodes that allow scripts to constrain spending transactions. **Covenant IDs (KIP-20)** establish consensus-validated 32-byte lineage identifiers for unforgeable family identity across changing P2SH state commitments. **Partitioned Sequencing Commitments (KIP-21)** maintain per-lane Merkle and activity commitments (`SeqCommit`) exposed via `OpChainblockSeqCommit` (`0xd4`), reducing based-app proving cost from $O(\text{global throughput})$ to $O(\text{lane activity})$. **Transaction V1 (KIP-24)** introduces per-input `compute_budget`, per-output `covenant_binding`, BLAKE3 payload hashing in `txid`, and user-lane subnetwork rules. Finally, **Script Pricing (KIP-25)** replaces legacy `sig_op_count` limits with a compute-gram fee model granting $\text{compute\_budget} \times 10,000 + 9,999$ script units per input.

### 1.2 The Core Architectural Mental Model
<!-- id: architecture-mental-model | world: W6 | difficulty: 3 | prereqs: toccata-overview, utxo-model-vs-account | status: unverified -->

Every Toccata application—whether a pure Layer-1 covenant or a Layer-2 Based App—is governed by a unified set of UTXO-native architectural principles. Because Kaspa has no global mutable state, application state is distributed across discrete, immutable UTXO cells where mutable fields reside inside the redeem script preimage of a P2SH UTXO. When a covenant UTXO is spent, its redeem script executes and validates the code template and state of its own successor outputs. Because modifying state alters the redeem script bytes, the P2SH script_public_key changes on every spend; KIP-20 Covenant IDs bridge this gap by maintaining a permanent 32-byte family identifier across changing script hashes.

At the transaction layer, Transaction V1 separates resource commitment from user intent by committing compute_budget in tx::hash while excluding it from txid and sighash, whereas output covenant_binding fields are committed across txid, tx::hash, and sighash (when covered by the sighash flag). Because covenants cannot dynamically call external contracts via eval, multi-contract applications compose by co-spending witness UTXOs in the same atomic transaction. When an application requires high-contention shared state that thousands of users update concurrently, it operates as a Based App: users submit ordinary V1 payload transactions on a dedicated KIP-21 user lane ([namespace: 4 bytes, 0x00 \* 16]), an off-chain runtime executes the ordered lane activity, and an L1 settlement covenant verifies a KIP-16 ZK proof anchored to OpChainblockSeqCommit. Crucially, KIP-21 lanes partition transaction sequencing commitments so proofs scale with lane activity rather than total DAG throughput; the term "lane" must never be conflated with parallel UTXO execution. Finally, because Silverscript, KCC-0001/0020, Argent, and vprogs APIs continue to evolve rapidly, engineers must verify compiler and repository versions before deploying production contracts.

### 1.3 Ecosystem Repository & Standards Map
<!-- id: ecosystem-repos-map | world: unmapped | difficulty: 1 | prereqs: toccata-overview | status: unverified -->

| Repository / Specification | Architectural Scope & Role |
| --- | --- |
| rusty-kaspa | Core consensus node, Transaction V1 serialization, hashing, script engine, KIP-25 pricing, and KIP-21 SeqCommit state trees. |
| kips | Formal specifications for KIP-9, KIP-10, KIP-16, KIP-17, KIP-20, KIP-21, KIP-24, and KIP-25. |
| silverscript | High-level CashScript-inspired covenant compiler, #[covenant] attribute macros, ABI codec, worked examples (kcc20.sil, kcc20-minter.sil), and cli-debugger (sil-debug). |
| kcc (KCC-0001 / KCC-0020) | Language-independent Kaspa Covenant Contract interoperability conventions covering dispatch tags, template commitments, state layouts, leader/delegator roles, and fungible token descriptors. |
| kascov-decode | Rust library for decoding lowered Silverscript templates, extracting state spans, and providing typed access to KCC20 state headers. |
| argent | Experimental multi-contract actor frontend that compiles high-level actors to standard Silverscript and packages portable runtime artifacts for argent-runtime. |
| vprogs | Evolving based-app execution runtime and RISC Zero proving pipeline. |
| docs | Official rendered MDX developer documentation (docs.kaspa.org/toccata). |

## 2. Kaspa UTXO Model & Covenant Fundamentals
<!-- id: utxo-covenant-fundamentals | world: W1 | difficulty: 1 | prereqs: none | status: unverified -->

### 2.1 UTXO Model vs. Account Model
<!-- id: utxo-model-vs-account | world: W1 | difficulty: 1 | prereqs: utxo-anatomy-sompi | status: unverified -->

| Architectural Property | UTXO Model (Kaspa Toccata) | Account Model (Ethereum EVM) |
| --- | --- | --- |
| **State Representation** | Distributed across discrete, immutable UTXO cells (UtxoEntry). | Centralized in mutable global contract storage trees. |
| **State Mutation Mechanism** | Spending consumes old UTXOs and creates new successor UTXOs. | Transactions overwrite existing storage slots in place. |
| **Execution Concurrency** | Naturally parallel across independent UTXOs with disjoint outpoints. | Sequential execution required over contended shared contract storage. |
| **Smart Contract Primitive** | Covenant script verifying transaction inputs, outputs, and templates. | Imperative function call mutating internal storage variables. |
| **Persistent Identity** | KIP-20 covenant_id (Hash32) across changing P2SH script hashes. | Static 20-byte contract account address. |
| **Cross-Contract Interaction** | Atomic co-spending (ICC) and witness inspection in one transaction. | Synchronous message calls (CALL, DELEGATECALL). |

### 2.2 What Is a Covenant?
<!-- id: what-is-a-covenant | world: W1 | difficulty: 2 | prereqs: utxo-model-vs-account | status: mainnet -->

A traditional Pay-to-Public-Key (P2PK) lock is purely an **authorization check**: it verifies that the spender holds the private key corresponding to a public key (checkSig(s, pk)), but places zero restrictions on how the unlocked coins are distributed. By contrast, a **covenant** is a spending condition that constrains the properties of the spending transaction itself. Using KIP-17 and KIP-20 introspection opcodes, a covenant script can inspect and enforce rules over the number, values, and locking scripts (scriptPubKey) of the transaction's outputs, the invariant code template and mutated state bytes embedded inside successor outputs, the values, outpoints, locking scripts, and covenant IDs of co-spent inputs, and transaction-level metadata including version, locktime (tx.daa, tx.time), subnetwork lane ID, gas, and payload slices.

### 2.3 P2SH State Encoding & The Covenant Lifecycle
<!-- id: p2sh-state-covenant-lifecycle | world: W1 | difficulty: 3 | prereqs: what-is-a-covenant | status: mainnet -->

Because Kaspa UTXOs are immutable, a covenant cannot modify variables in place; instead, stateful covenants follow the four-stage **Locate, Consume, Validate, and Continue** lifecycle. First, in the **Locate and Reveal** stage, the live covenant UTXO sits on-chain locked by a 37-byte Pay-to-Script-Hash (`P2SH`) `script_public_key`. Its mutable state (`state_0`) is embedded inside the unhashed **redeem script preimage** (`[template_prefix][state_0][template_suffix]`), which the spender reveals in the spending input's `signature_script`. Second, during **Consume and Validate**, the script engine verifies that the revealed redeem script hashes to the input's P2SH lock and executes the redeem script. The covenant code validates the spender's arguments, computes or verifies the next state (`state_1`), reconstructs the expected successor redeem script (`[template_prefix][state_1][template_suffix]`), and checks that the designated successor output carries `new ScriptPubKeyP2SHFromRedeemScript(...)`. Finally, in **Continue with Stable Lineage**, because `state_1 != state_0`, the successor output has a completely different P2SH fingerprint (`hash_1 != hash_0`), but consensus verifies the output's `covenant_binding` (`authorizing_input` and `covenant_id = X`), ensuring that the new UTXO inherits the exact same 32-byte Covenant ID `X`.

