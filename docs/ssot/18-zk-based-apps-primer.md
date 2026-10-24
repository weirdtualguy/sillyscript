## 22. ZK & Based-Apps Primer
<!-- id: zkp-module | world: W6 | difficulty: 3 | prereqs: tx-compute-budget, kip21-scaling-thesis, kip16-proof-systems | status: mainnet | source: https://docs.kaspa.org/toccata/inline-zk -->

This module is a bridge into §6 (KIP-21 partitioned sequencing) and §7 (KIP-16 inline ZK). It introduces the general ideas first (what a proof is, what a based app is), then maps them to Kaspa's specific opcodes, tags and numbers. All numbers agree with §3.2, §6.3 and §7.1; the few additions come from the official Toccata guides and are cited.

### 22.1 The Problem a Proof Solves
<!-- id: zkp-problem | world: W6 | difficulty: 1 | prereqs: envelope-metaphor-map | status: pedagogical | source: https://docs.kaspa.org/toccata/inline-zk -->

Suppose someone claims, "I ran a long computation and the answer is `y`." You could re-run it yourself, which defeats the point of delegating, or you could trust them, which defeats the point of a blockchain. A **zero-knowledge proof** (ZK proof) is a small piece of data that lets you check the claim *much faster than recomputing it*. Think of a stamped receipt: checking the stamp is quick; producing it required the full work.

The word "zero-knowledge" names an optional extra: the proof can be built so it reveals nothing about secret inputs. Kaspa's own guide frames the main benefits as *compression* (a short check replaces a long computation) and, when wanted, *hiding* (the public chain sees a commitment, not the data).

<!-- id: zkp-term-statement-witness | world: W6 | difficulty: 2 | prereqs: zkp-problem | status: pedagogical | source: https://docs.kaspa.org/toccata/inline-zk -->
**Statement and witness.** The *statement* is the public claim ("state commitment `A` moves to state commitment `B` under program `P`"). The *witness* is the private material that makes it true (the full states and secret inputs).

### 22.2 Parts of a Proof System
<!-- id: zkp-parts | world: W6 | difficulty: 2 | prereqs: zkp-problem | status: pedagogical | source: https://docs.kaspa.org/toccata/inline-zk -->

| id | Part | Role | On Kaspa |
| --- | --- | --- | --- |
| zkp-part-program | Program / circuit | The computation being proven | A circuit (Groth16) or a RISC Zero guest program |
| zkp-part-prover | Prover | Runs the computation and produces the proof; expensive; runs off-chain | An off-chain runtime (for based apps, `vprogs`, §22.7) |
| zkp-part-proof | Proof | The compact evidence | The `proof` argument to `OpZkPrecompile` (`0xa6`) |
| zkp-part-key | Verifying key / program identity | Identifies *which* program the proof is about | Verifying key (Groth16, tag `0x20`) or image id (RISC Zero, tag `0x21`) |
| zkp-part-public | Public inputs | The values the verifier is told | State commitments, lane tips, journal hashes |
| zkp-part-verifier | Verifier | Cheaply checks the proof against key and public inputs | The L1 script engine via `OpZkPrecompile` |

Two guarantees define a proof system: **completeness** (an honest prover's proof of a true statement verifies) and **soundness** (no one can produce a verifying proof of a false statement, except with negligible probability).

### 22.3 What On-Chain Verification Actually Checks
<!-- id: zkp-verify-checks | world: W6 | difficulty: 4 | prereqs: zkp-parts, covenant-id-nonforgeability | status: mainnet | source: https://docs.kaspa.org/toccata/inline-zk -->

`OpZkPrecompile` answers exactly one question: **does this proof verify for this key (or image id) and these public inputs?** It aborts the script on failure (§4.1, §8.5). It does **not** decide whether the proven claim is the claim *your contract needs*. The covenant script must supply that meaning.

| id | Question | Answered by |
| --- | --- | --- |
| zkp-chk-valid | Is the proof valid for the key and public inputs? | `OpZkPrecompile` |
| zkp-chk-program | Is it the *intended* program (not a different valid one)? | The script pins the verifying key or image id |
| zkp-chk-old | Does the proof start from the covenant's *current* state commitment? | The script compares the public input with the state in its own redeem script |
| zkp-chk-new | Does the proof end at the commitment the *successor output* installs? | The script rebuilds the successor lock with that commitment (§8.5 `validateOutputState`) |
| zkp-chk-lineage | Is the successor a legitimate member of the same family? | Consensus (`covenant_binding`, §5.1) plus the script |
| zkp-chk-anchor | (Based apps) Does the proof cover the lane activity that L1 actually sequenced? | The script reads `OpChainblockSeqCommit` (§6.3) and requires the proof to bind to it |

**Shape of an inline-ZK covenant (pseudocode, not Silverscript):**

```
spend(proof, old_commitment, new_commitment):
    require(old_commitment equals the state commitment in this redeem script)
    verify proof for [pinned program identity] with public inputs [old_commitment, new_commitment]
    require(successor output has the same covenant_id and a lock built from new_commitment)
```

The proof says the hidden transition is valid; the script says this transaction installs exactly that result. Both are required (the official Inline ZK guide makes the same point). A proof valid for the wrong program, or an unchecked successor, makes the covenant forgeable.

### 22.4 Groth16 vs. RISC Zero STARK in Practice
<!-- id: zkp-groth-vs-stark | world: W6 | difficulty: 3 | prereqs: zkp-verify-checks, kip16-proof-systems, tx-compute-budget | status: mainnet | source: https://docs.kaspa.org/toccata/script-pricing -->

| id | Property | Groth16 (tag `0x20`) | RISC Zero Succinct STARK (tag `0x21`) |
| --- | --- | --- | --- |
| zkp-cmp-pq | Post-quantum secure | No | Yes |
| zkp-cmp-size | Proof footprint | Compact (3 group elements) | Larger; about `222,668` bytes for the standard succinct seal (§3.2) |
| zkp-cmp-time | Verification time | `1.649 ms` (about `134×` an ECDSA check) | `9.081 ms` (about `738×`) |
| zkp-cmp-su | Script units charged | `14,000,000 + 250,000 × (public inputs + 1)` | `25,000,000` |
| zkp-cmp-budget | Typical `compute_budget` | `1,550` for 5 public inputs (§18.4) | `2,500` (§18.4) |
| zkp-cmp-setup | Trusted setup | Required by Groth16 in general (background knowledge, `unverified`) | Not required, per the SSOT glossary (§15.6) |
| zkp-cmp-identity | What the script pins | Verifying key | RISC Zero image id |
| zkp-cmp-use | Role in the current `vprogs` path | RISC Zero receipt reduced to Groth16 for a compact BN254 proof | RISC Zero Succinct receipt directly |

How to choose: the STARK path costs more script units and bytes but is post-quantum secure and needs no trusted setup; the Groth16 path is compact but is not post-quantum. Neither ratio of *latency* equals the ratio of *script units* (`25,000,000 / 100,000 = 250` signature-equivalents for the STARK, not `738`); script units are fixed consensus constants.

### 22.5 What a Based App Is
<!-- id: zkp-based-app | world: W6 | difficulty: 2 | prereqs: architecture-mental-model, antipattern-matrix | status: mainnet | source: https://docs.kaspa.org/toccata/based-apps -->

A **based app** splits an application into three jobs:

1. **Order and publish.** Users send *ordinary* Transaction V1 transactions whose `subnetwork_id` is the app's lane and whose `payload` carries an operation. Kaspa orders them and makes them available. Consensus does not interpret the payload.
2. **Execute.** An off-chain runtime applies the operations in order and keeps the app state.
3. **Settle.** A settlement covenant on L1 holds a commitment to the app state. Periodically someone submits a spend carrying a ZK proof that the runtime applied the sequenced operations correctly; the covenant verifies the proof and installs the new commitment.

Analogy (light use of the highway metaphor in §0.4): ordinary traffic and the app's traffic share the same road, but the app has its own *lane*, and a receipt covering only that lane lets a settlement officer check the app without inspecting every other vehicle.

Why not make each user operation a covenant spend? Because a single covenant UTXO can be spent once per transaction, a shared balance sheet would become a bottleneck (§12.2); based apps exist for exactly that high-contention case.

### 22.6 What SeqCommit Lanes Do
<!-- id: zkp-seqcommit-lanes | world: W6 | difficulty: 4 | prereqs: zkp-based-app, kip21-commitment-structure, kip21-lane-rules-proving | status: mainnet | source: ssot §6.2 -->

- **Lane.** A transaction's lane is its 20-byte `subnetwork_id` (§3.5, §6.3). A lane is a *sequencing partition*, not parallel execution (§20, `lim-lane-not-parallel`).
- **SeqCommit(B).** A 32-byte recursive commitment stored in a block's `accepted_id_merkle_root`, covering per-lane activity. It combines the parent's commitment with the block's sequencing state (§6.2).
- **Why it helps.** Without partitioning, a prover would have to show it accounted for *every* transaction in the DAG to prove nothing relevant was skipped, so cost would scale with global throughput. With lanes, the proof covers the app's own lane activity (§6.1).
- **Two anchors.** A settlement proof checks a lane transition between `SeqCommit(B_start)` and `SeqCommit(B_end)`, with lane-inclusion (or non-inclusion checkpoint) witnesses under both blocks and a compressed lane-diff witness (§6.3).
- **Reading it in script.** `OpChainblockSeqCommit` (`0xd4`) pushes `SeqCommit(B)` for a chain-block ancestor inside the consensus horizon; the official guide ties that window to finality depth, with mainnet finality duration `43,200` seconds (about 12 hours).
- **Housekeeping.** A lane idle for `F` blue-score units is purged from the active set and re-anchors to a checkpoint when it returns; each block touches at most `50` non-coinbase lanes; lane gas per block is at most `1,000,000,000` (§6.3).
- **L1 clock.** `MergesetContextHash(B)` commits the selected parent's timestamp, DAA score and blue score so a proof can reason about time against `SeqCommit(B)` (§6.2).

### 22.7 The Settlement Journal
<!-- id: zkp-journal | world: W6 | difficulty: 4 | prereqs: zkp-seqcommit-lanes | status: unverified | source: https://docs.kaspa.org/toccata/based-apps -->

The reference runtime `vprogs` (an evolving toolkit, not a frozen SDK) summarizes what a settlement proof asserts in a fixed-layout **journal**. The official Based Apps guide lists ten fields in a `320`-byte `StateTransition` journal (which implies `32` bytes per field if all are equal width; that arithmetic is inferred):

| id | Field | Meaning |
| --- | --- | --- |
| zkp-j-prev-state | `prev_state` | App state root before the bundle |
| zkp-j-prev-tip | `prev_lane_tip` | Lane tip entering the bundle |
| zkp-j-new-state | `new_state` | App state root after the bundle |
| zkp-j-new-tip | `new_lane_tip` | Lane tip after the bundle |
| zkp-j-seqcommit | `new_seq_commit` | Chain-block `SeqCommit` derived from the final lane proof |
| zkp-j-covid | `covenant_id` | The settlement covenant's ID |
| zkp-j-tx-image | `tx_image_id` | Transaction-processor guest identity |
| zkp-j-batch-image | `batch_image_id` | Batch-processor guest identity |
| zkp-j-permission | `permission_spk_hash` | Exit permission script hash, or zero if no exits |
| zkp-j-lane-key | `lane_key` | KIP-21 lane key |

The settlement script hashes the journal in this order and requires that the proof produced exactly that journal; this binds the old root, the lane span, the new root, the program identities and the covenant together. The field list is `unverified` for the long term because the guide calls the stack early and evolving.

### 22.8 Inline ZK or Based App?
<!-- id: zkp-decision | world: W6 | difficulty: 3 | prereqs: zkp-based-app, agent-brief | status: mainnet | source: https://docs.kaspa.org/toccata/inline-zk -->

| id | Situation | Better fit | Reason |
| --- | --- | --- | --- |
| zkp-dec-one-action | One covenant action with its own proof (private transfer, vault with private unlock) | Inline ZK | Each action settles by itself |
| zkp-dec-shared | Many users mutate one shared state root | Based app | Avoid a contended UTXO |
| zkp-dec-batch | Proofs should cover many user operations | Based app | One settlement proof per batch |
| zkp-dec-ordinary-tx | Users should submit ordinary payload transactions, not covenant spends | Based app | User operations live on a lane |
| zkp-dec-simple | None of the above; UTXOs can run in parallel | Pure L1 covenant | No prover needed (§14) |

### 22.9 Glossary Additions for §22
<!-- id: zkp-glossary-additions | world: W6 | difficulty: 1 | prereqs: zkp-module | status: pedagogical | source: https://docs.kaspa.org/toccata/inline-zk -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| zkp-gloss-statement | **Statement** | The public claim a proof is about. | The relation between public inputs that the verifier checks. |
| zkp-gloss-witness | **Witness** | The private facts that make the claim true. | Prover-side input never revealed to the verifier. |
| zkp-gloss-public-input | **Public input** | A value the verifier is shown. | Argument bound into the proof, passed to `OpZkPrecompile`. |
| zkp-gloss-image-id | **Image id** | The identity of the program a RISC Zero proof is about. | Program digest pinned by the script for tag `0x21`. |
| zkp-gloss-journal | **Journal** | The summary of what a proof asserted. | Fixed-layout output committed by the proof; hashed by the settlement script. |
| zkp-gloss-settlement | **Settlement** | Putting the result of off-chain work onto Kaspa. | A covenant spend that verifies a proof and installs the new state root. |
| zkp-gloss-completeness-soundness | **Completeness and soundness** | True claims can be proven; false claims cannot. | The two core guarantees of a proof system. |

