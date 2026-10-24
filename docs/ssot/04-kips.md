## 5. KIP-20: Covenant IDs
<!-- id: kip20-covenant-ids | world: W1,W4 | difficulty: 3 | prereqs: none | status: mainnet -->

### 5.1 Core Lineage Concept
<!-- id: covenant-id-lineage | world: W1,W4 | difficulty: 3 | prereqs: what-is-a-covenant, p2sh-state-covenant-lifecycle | status: mainnet -->

KIP-20 introduces consensus-tracked 32-byte identifiers (covenant_id: Hash32) that attach to UTXOs and persist across spending transactions. Consensus admits a Transaction V1 output carrying covenant_binding = Some({ authorizing_input: a, covenant_id: id }) if and only if a < tx.inputs.length and **at least one** of two mutually exclusive lineage rules holds for the group of outputs sharing (a, id). Under the **Continuation** rule, input in[a] spends a UTXO whose consensus UtxoEntry already carries covenant_id == Some(id). Under the **Genesis** rule, input in[a] acts as the unique entropy anchor for a brand-new covenant family, and id equals the deterministic CovenantIDHash computed over in[a].previous_outpoint and the ordered list of outputs in the transaction claiming (a, id).

### 5.2 Deterministic Genesis Hashing
<!-- id: covenant-id-genesis-hash | world: W4 | difficulty: 4 | prereqs: covenant-id-lineage | status: mainnet -->

When a new covenant family is initialized via the Genesis rule, its 32-byte covenant_id is derived using **BLAKE2b-256** with the domain-separation key/tag "CovenantID":

\text{covenant\_id}(O, \text{auth\_outputs}) = \text{BLAKE2b-256}_{\text{"CovenantID"}}\left(O.\text{tx\_id} \;\|\; \text{le\_u32}(O.\text{index}) \;\|\; \text{le\_u64}(|\text{auth\_outputs}|) \;\|\; \bigoplus_{(j, \text{out}) \in \text{auth\_outputs}} \text{Ser}(j, \text{out})\right)

where O = \text{tx.inputs}[a].\text{previous\_outpoint} and each authorized genesis output \text{Ser}(j, \text{out}) is serialized as:

\text{Ser}(j, \text{out}) = \text{le\_u32}(j) \;\|\; \text{le\_u64}(\text{out.value}) \;\|\; \text{le\_u16}(\text{out.spk.version}) \;\|\; \text{le\_u64}(|\text{out.spk.script}|) \;\|\; \text{out.spk.script}

Three consensus invariants govern Genesis hashing. First, auth_outputs must be ordered by strictly increasing output index j. Second, the covenant_binding field itself is excluded from \text{Ser}(j, \text{out}) so the hash can be computed without circular self-reference before stamping id onto the outputs. Third, because the UTXO outpoint O can only be spent once in the history of the BlockDAG, no future transaction can ever reproduce the same genesis covenant_id.

### 5.3 Disambiguating OpAuthOutput\* and OpCovOutput\* Across Genesis vs. Continuation
<!-- id: genesis-vs-continuation-opcodes | world: W4 | difficulty: 4 | prereqs: covenant-id-genesis-hash, opcodes-covenant-id | status: mainnet -->

A critical distinction separates input-authorized output introspection (OpAuthOutputCount, OpAuthOutputIdx) from family-wide continuation introspection (OpCovInput\*, OpCovOutput\*).

| Introspection Family | Opcodes | Behavior in Continuation Transactions | Behavior in Genesis Transactions |
| --- | --- | --- | --- |
| **Input-Authorized (binding=auth)** | OpAuthOutputCount(i) (0xcb), OpAuthOutputIdx(i, k) (0xcc) | Enumerates all outputs out[j] where out[j].covenant.authorizing_input == i and out[j].covenant.covenant_id == tx.utxo(i).covenant_id. | Returns 0 / aborts if tx.utxo(i).covenant_id is None (since OpAuthOutput\* requires continuation from input i's existing covenant_id). |
| **Direct Output Inspection** | OpOutputCovenantId(j) (0xd5), OpOutputAuthorizingInput(j) (0xd6) | Returns out[j]'s bound covenant_id and authorizing_input. | Returns the newly minted genesis covenant_id and authorizing_input of out[j] (used by KCC20Minter.init via OpOutputCovenantId(0)). |
| **Covenant Group (binding=cov)** | OpCovInputCount(id) (0xd0), OpCovInputIdx(id, k) (0xd1), OpCovOutputCount(id) (0xd2), OpCovOutputIdx(id, k) (0xd3) | Enumerates all inputs spending id (OpCovInput\*) and all continuation outputs carrying id (OpCovOutput\*) in strictly increasing index order. | For a newly created genesis id, OpCovInputCount(id) is 0; scripts inspecting a child covenant created in the same tx use OpOutputCovenantId(j) directly. |

### 5.4 Non-Forgeability & Security Boundary
<!-- id: covenant-id-nonforgeability | world: W4 | difficulty: 3 | prereqs: covenant-id-lineage | status: mainnet -->

KIP-20 makes covenant-labeled UTXOs **unforgeable at the consensus layer**: an attacker cannot attach an existing family's covenant_id to a malicious output without spending an existing UTXO that already carries that covenant_id (which triggers that UTXO's covenant script) or finding a 256-bit BLAKE2b preimage collision. However, **the Covenant ID only guards family admission; the script must judge the transition**. Consensus does not inspect what bytes are inside script_public_key when verifying a continuation binding—if a covenant script forgets to validate the successor's template and state, the spender can legally bind the family covenant_id to an output locked by a trivial P2PK script and drain the covenant.

## 6. KIP-21: Partitioned Sequencing & User Lanes
<!-- id: kip21-partitioned-sequencing | world: W6 | difficulty: 4 | prereqs: none | status: mainnet -->

### 6.1 Core Scaling Thesis
<!-- id: kip21-scaling-thesis | world: W6 | difficulty: 3 | prereqs: tx-subnetwork-user-lanes | status: mainnet -->

In a naïve based-rollup architecture on a high-throughput BlockDAG, an off-chain prover must scan and prove every transaction in every mergeset to demonstrate that no unapplied transactions targeted its application—scaling proof cost with global network throughput O(\text{DAG throughput}). KIP-21 eliminates this bottleneck by partitioning block sequencing commitments by application lane (lane_id = tx.subnetwork_id), reducing application proof complexity to **O(\text{lane activity})**.

### 6.2 Hierarchical Commitment Structure
<!-- id: kip21-commitment-structure | world: W6 | difficulty: 5 | prereqs: kip21-scaling-thesis, blockdag-ghostdag-daa | status: mainnet -->

Post-activation, the block header field accepted_id_merkle_root is repurposed to hold the recursive 32-byte partitioned sequencing commitment SeqCommit(B):

\text{SeqCommit}(B) = H_{\text{seq}}\Big(\text{SeqCommit}(\text{parent}(B)),\; \text{SeqStateRoot}(B)\Big) \text{SeqStateRoot}(B) = H_{\text{seq}}\Big(\text{ActivityRoot}(B),\; \text{PayloadAndContextDigest}(B)\Big) \text{ActivityRoot}(B) = H_{\text{activity\_root}}\Big(\text{InactivityShortcut}(B),\; \text{ActiveLanesRoot}(B)\Big)

Additionally, PayloadAndContextDigest(B) commits to two vital block-level structures required by based ZK verifiers. First, the **Accepting Block Context (MergesetContextHash(B))** provides a verifiable L1 clock relative to SeqCommit(B) by hashing the selected parent's header timestamp, the accepting block's DAA score, and the accepting block's blue score:

\text{MergesetContextHash}(B) = H_{\text{mergeset\_context}}\Big(\text{le\_u64}(\text{selected\_parent}(B).\text{timestamp}) \;\|\; \text{le\_u64}(B.\text{daa\_score}) \;\|\; \text{le\_u64}(B.\text{blue\_score})\Big)

Second, the **Miner Payload Commitment (MinerPayloadRoot(B))** commits raw coinbase payload bytes from all mergeset blocks X of accepting block B (ordered with selected_parent(B) first, followed by remaining mergeset blocks in deterministic consensus topological order), binding each leaf to X.\text{hash} and X.\text{header.blue\_work}.

### 6.3 Consensus Lane Rules, Inactivity Purging & Two-Anchor Proving
<!-- id: kip21-lane-rules-proving | world: W6 | difficulty: 5 | prereqs: kip21-commitment-structure, kip16-proof-systems | status: mainnet -->

A transaction's lane ID is its 20-byte tx.subnetwork_id. Each block may touch at most **50** distinct non-coinbase lanes, and the sum of tx.gas across any single lane within a block must not exceed **1,000,000,000** (10^9), while native and reserved system lanes must set gas = 0. A lane that records no activity for **F** blue-score units is purged from ActiveLanesRoot(B) so active-set state does not grow unboundedly. When a purged lane later re-appears, consensus anchors its reactivated tip directly to SeqCommit(parent(B)), re-attaching it to a globally committed checkpoint without requiring nodes to retain expired lane tips.

To settle a batch of user-lane transactions on L1, a Based App's settlement covenant invokes OpChainblockSeqCommit(block_hash) (opcode 0xd4), which verifies that block_hash is a valid chain-block ancestor within consensus horizon depth bounds and pushes its 32-byte SeqCommit(B) onto the stack. The ZK proof verified by OpZkPrecompile then checks a **two-anchor lane transition** between \text{SeqCommit}(B_{\text{start}}) and \text{SeqCommit}(B_{\text{end}}) using lane-inclusion (or non-inclusion checkpoint) witnesses under both B_{\text{start}} and B_{\text{end}} alongside a compressed lane-diff witness scaling strictly with the blocks where the lane was active between B_{\text{start}} and B_{\text{end}}.

## 7. KIP-16: Inline ZK Precompiles
<!-- id: kip16-zk-precompiles | world: W6 | difficulty: 4 | prereqs: none | status: mainnet -->

### 7.1 Supported Proof Systems & Precompile Tags
<!-- id: kip16-proof-systems | world: W6 | difficulty: 4 | prereqs: tx-compute-budget | status: mainnet -->

KIP-16 introduces OpZkPrecompile (0xa6), enabling L1 covenant scripts to verify succinct cryptographic proofs of arbitrary off-chain computation. Each proof system is isolated behind a 1-byte dispatch tag so a cryptographic flaw in one library cannot compromise other precompiles.

| Precompile Tag | Proof System & Backend Library | Post-Quantum Security | Proof Footprint | Verification Latency | Relative Cost vs. ECDSA |
| --- | --- | --- | --- | --- | --- |
| 0x20 | **Groth16** (Arkworks BN254/BLS12-381) | No | Compact (3 group elements) | 1.649\text{ ms} (1,649\text{ }\mu\text{s}) | \sim 134\times |
| 0x21 | **RISC Zero Succinct** (STARK) | Yes | Larger (succinct STARK) | 9.081\text{ ms} (9,081\text{ }\mu\text{s}) | \sim 738\times |
| *(Baseline)* | **ECDSA Signature Verification** | No | 64\text{–}65\text{ bytes} | 12.311\text{ }\mu\text{s} | 1\times |

