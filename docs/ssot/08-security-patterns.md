## 12. Security Considerations, Anti-Patterns & Curriculum Bug-Hunt Bank
<!-- id: security-antipatterns-bugbank | world: W3,W6 | difficulty: 3 | prereqs: none | status: unverified -->

### 12.1 Core Security Invariants
<!-- id: security-core-invariants | world: W6 | difficulty: 3 | prereqs: covenant-id-nonforgeability, type-casting-reference | status: unverified -->

Five defensive engineering invariants govern secure covenant development on Kaspa Toccata. First, **the Covenant ID guards the door while the script judges the move**: KIP-20 Covenant IDs enforce family membership at consensus, but scripts must explicitly validate every state transition and successor template. Second, **templates must always be authenticated via hash**: a covenant must never assume an output is valid because its state bytes match, and must verify its code prefix and suffix via validateOutputState or expectedTemplateHash. Third, **signed 64-bit integers must be constrained against underflow**: because int is signed (i64), any conservation check (in_sum >= out_sum or total == prev_state.amount) is trivially bypassed unless every output amount is constrained with require(new_states[i].amount >= 0);. Fourth, **dynamic byte lengths must be validated before casting**: functional casts such as byte[32](data) are unchecked compile-time assertions and must always be preceded by require(data.length == 32);. Fifth, **loop bounds must be enforced explicitly**: developers should never rely on transient compiler runtime assertions for loop bounds in manual entry functions and must guard array lengths with require(arr.length <= MAX);.

### 12.2 Architectural Anti-Pattern Matrix
<!-- id: antipattern-matrix | world: W6 | difficulty: 3 | prereqs: security-core-invariants | status: unverified -->

| Anti-Pattern | Failure Mode / Vulnerability | Correct Toccata Pattern |
| --- | --- | --- |
| **Account-Style Global Storage** | Contention bottleneck; single UTXO cannot be spent by thousands of concurrent users. | Partition state across parallel UTXO branches or use a KIP-21 Based App for shared state. |
| **Assuming Covenant ID Checks Rules** | Attacker continues covenant_id into a P2PK output and steals funds. | Validate both successor state and template hash inside the covenant script. |
| **Unchecked Successor Template** | Copycat contract with valid-looking state bytes replaces covenant logic. | Use validateOutputState or validateOutputStateWithInputTemplate. |
| **Putting compute_budget in txid** | Breaks outpoint references when fee/compute estimators adjust budget. | Remember compute_budget is committed only in tx::hash, never txid or sighash. |
| **Legacy V0 Hashing on V1 Tx** | Invalid digest computation on payload and covenant bindings. | Transaction V1 hashes payload via BLAKE3 in txid/sighash and commits covenant_binding. |
| **Covenant Spend per Based-App Op** | Defeats O(\text{activity}) lane batching and creates L1 UTXO contention. | Submit user ops as ordinary V1 payload txs on a user lane; settle batches via ZK proof. |
| **Using Based Apps for Simple Rules** | Unnecessary off-chain prover complexity for non-contended workflows. | Use pure L1 covenants (Mecenas, VaultNM, KCC20) whenever UTXO parallelism suffices. |
| **Recursive Tx Preimage Lineage** | Exponential script size growth across generations. | Use KIP-20 native 32-byte covenant_id lineage. |

### 12.3 Annotated Curriculum Bug-Hunt Bank (bug Quiz Reference)
<!-- id: bug-hunt-bank | world: W3,W6 | difficulty: 3 | prereqs: security-core-invariants | status: pedagogical -->

The following 8 buggy code patterns serve as the verified ground-truth bank for bug steps in SillyKuest and security audits.

| Bug ID | Vulnerable Code Line | Context | Vulnerability Explanation & Fix |
| --- | --- | --- | --- |
| **BUG-01** | require(new_state.count > prev_state.count); | Counter.bump (w3.js 3-4) | > permits skipping from 1 to 1,000,000. **Fix:** require(new_state.count == prev_state.count + 1);. |
| **BUG-02** | require(tx.time <= timeout); | TransferWithTimeout.reclaim (w3.js 3-4) | <= allows the sender to claw back funds *before* the timeout expires. **Fix:** require(tx.time >= timeout);. |
| **BUG-03** | require(total >= prev_state.amount); | PotSplitter.split (w4.js 4-4) | >= allows output pieces to sum to *more* than the input pot, creating tokens from nothing. **Fix:** require(total == prev_state.amount);. |
| **BUG-04** | total = total + new_states[i].amount; *(with no > 0 check)* | PotSplitter.split / VaultNM | Signed int allows splitting 10 into 1000 and -990 (total == 10). **Fix:** Add require(new_states[i].amount > 0); inside the loop. |
| **BUG-05** | if (change <= pledge + minerFee) | Mecenas.receive (§8.7 v1.1) | Because change = val - pledge - minerFee, <= sweeps two full periods of funds in period 1. **Fix:** if (change < pledge + minerFee). |
| **BUG-06** | function conserve_and_bump(..., sig leader_sig) *(never calling checkSig)* | VaultNM (§9.9 v1.1) | In a 1-input spend, no delegate runs; omitting checkSig(leader_sig, ...) lets anyone spend the vault without a signature. **Fix:** Verify leader_sig on prev_states[0].owner. |
| **BUG-07** | byte[32] h = byte[32](data); *(without prior .length check)* | Dynamic byte casting (w6.js 6-4) | Casts are unchecked at compile time. **Fix:** Precede with require(data.length == 32);. |
| **BUG-08** | checkSig(s, pk); *(without require(...))* | Entrypoint auth check | checkSig pushes a bool (true/false) onto the stack instead of aborting. **Fix:** Wrap in require(checkSig(s, pk));. |

## 13. Architectural Patterns
<!-- id: architectural-patterns | world: W5 | difficulty: 3 | prereqs: none | status: unverified -->

### 13.1 One-to-One Singleton (1:1) & One-to-Many Fan-Out (1:N)
<!-- id: pattern-singleton-fanout | world: unmapped | difficulty: 3 | prereqs: contract-counter, contract-pot-splitter | status: unverified -->

The **One-to-One Singleton (1:1)** pattern maintains exactly one live UTXO per covenant_id (#[covenant.singleton], lowered to OpAuthOutputCount(activeIdx) == 1) and is ideal for controllers (KCC20Minter), state roots, and monotonic counters (Counter). The **One-to-Many Fan-Out (1:N)** pattern splits a single UTXO into up to Y authorized outputs (#[covenant.fanout(to = Y)], lowered to OpAuthOutputCount and OpAuthOutputIdx), requiring a compile-time unroll bound Y, strict non-negative output checks, and conservation of value.

### 13.2 Many-to-Many Leader/Delegate (N:M)
<!-- id: pattern-leader-delegate | world: W5 | difficulty: 4 | prereqs: contract-vault-nm | status: unverified -->

The **Many-to-Many Leader/Delegate (N:M)** pattern aggregates and redistributes up to N inputs into M outputs sharing a covenant_id (#[covenant(binding = cov, from = N, to = M)]). Under this pattern, the **Leader at Covenant Input 0** executes the full N:M transition policy over prev_states and new_states, while **Delegates at Covenant Inputs 1..N-1** verify that a valid leader exists at a strictly lower input index (leader_index < current_input_index, preventing delegation cycles), authenticate that the leader uses the same contract template, and execute the local #[covenant.delegate] hook. Engineers must account for the fact that a generated delegate authenticates the contract template at input 0, but cannot inspect which specific entrypoint input 0 selected.

### 13.3 Multi-Contract Composition (ICC) & Two-Phase Genesis
<!-- id: pattern-icc-two-phase-genesis | world: W5 | difficulty: 4 | prereqs: contract-kcc20-minter | status: unverified -->

Because Kaspa Script has no dynamic eval or external contract call, multi-contract systems separate asset rules (KCC20) from policy rules (KCC20Minter) and link them via two mechanisms. First, **Two-Phase Genesis Binding** creates the controller covenant first (C), then spends C in the asset genesis transaction and binds C to the new asset covenant ID (A) via OpOutputCovenantId(0). Second, **Co-Spent Covenant-ID Ownership & Foreign Template Validation** stores C as the ownerIdentifier (identifierType = 0x02) of the asset's minter branch; in every mint transaction, both UTXOs are co-spent so KCC20 verifies OpInputCovenantId(wIdx) == C while KCC20Minter verifies the KCC20 outputs via validateOutputStateWithInputTemplate.

