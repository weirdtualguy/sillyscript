## 3. Transaction V1 (KIP-24) & Script Pricing (KIP-25)
<!-- id: transaction-v1-pricing | world: W1,W6 | difficulty: 2 | prereqs: none | status: mainnet -->

![Image](media/image1.jpg)

### 3.1 Transaction V1 Schema
<!-- id: tx-v1-schema | world: W1 | difficulty: 2 | prereqs: toccata-overview | status: mainnet -->

Activated by KIP-24, Transaction V1 (tx.version == 1) updates the transaction data structure to support covenant lineage bindings, deterministic script resource budgeting, and partitioned sequencing lanes.

| Transaction V1 Component | Field Name | Data Type | Consensus Purpose & Version Difference |
| --- | --- | --- | --- |
| **Header** | version | u16 | Set to 1 for Toccata V1 transactions (0 for legacy transactions). |
| **Input (inputs[])** | previous_outpoint | Outpoint | 32-byte tx_id + 4-byte index (u32) of the UTXO being spent. |
| **Input (inputs[])** | signature_script | Vec\<u8> | Witness args, P2SH redeem script preimage, and 4-byte dispatch tag (\le 250,000 bytes). |
| **Input (inputs[])** | sequence | u64 | 8-byte little-endian sequence number used for relative DAA locks (this.ageDaa). |
| **Input (inputs[])** | compute_budget | u16 | **New in V1:** Replaces V0 sig_op_count: u8; defines per-input script-unit allowance. |
| **Output (outputs[])** | value | u64 | Output amount in sompi. |
| **Output (outputs[])** | script_public_key | ScriptPublicKey | 2-byte version (u16) + locking script byte array. |
| **Output (outputs[])** | covenant_binding | Option\<CovenantBinding> | **New in V1:** Optional { authorizing_input: u16, covenant_id: Hash32 }. |
| **Transaction Tail** | lock_time | u64 | Absolute lock threshold: < 500,000,000,000 is DAA score; \ge 500,000,000,000 is ms timestamp. |
| **Transaction Tail** | subnetwork_id | [u8; 20] | 20-byte lane identifier (0x00 native, 0x01 coinbase, or 4-byte user-lane namespace). |
| **Transaction Tail** | gas | u64 | Non-zero only on V1 user-lane transactions (\le 10^9 per lane per block); 0 on native/system lanes. |
| **Transaction Tail** | payload | Vec\<u8> | Raw application payload bytes inspected via OpTxPayloadSubstr and OpTxPayloadLen. |
| **Transaction Tail** | storage_mass | u64 | Transient/storage mass field committed in tx::hash but excluded from txid and sighash. |

### 3.2 Compute Budget & KIP-25 Script Pricing
<!-- id: tx-compute-budget | world: W1 | difficulty: 3 | prereqs: tx-v1-schema | status: mainnet -->

In Transaction V1, each input declares a `compute_budget: u16` that determines the maximum number of script execution units (compute-grams) that input's locking and unlocking scripts may consume:

$$\text{Allowance}(\text{input}_i) = \text{compute\_budget}_i \times 10,000 + 9,999 \text{ script units}$$

Under this formula, even `compute_budget = 0` grants a baseline allowance of $9,999$ script units, which suffices for simple stateless signature checks (`P2PK`), while complex stateful covenants or inline ZK verifications (`OpZkPrecompile`) increment `compute_budget` to purchase larger execution allowances. Because `compute_budget` is a pure resource commitment rather than part of user intent, modifying `compute_budget` does not alter `txid` and does not invalidate existing transaction signatures (`sighash`), allowing wallets or fee estimators to tune `compute_budget` without re-signing. If an input's actual script execution exceeds $\text{compute\_budget} \times 10,000 + 9,999$ units, script validation aborts and the transaction is rejected; conversely, setting `compute_budget` unnecessarily high inflates the transaction's KIP-25 compute mass, increasing required miner fees and making block admission harder.

While basic stack pushes (including `OP_PUSHDATA4` witness seal pushes, which meter `0` script units), arithmetic (`OpMul`, `OpDiv`), and field introspection opcodes consume minimal script units, cryptographic operations scale with computational cost:
- **Schnorr / ECDSA Signature Verification:** `~12.311 μs` benchmark baseline ($1\times$).
- **Groth16 Verification (`OpZkPrecompile` tag `0x20`):** `~1.649 ms` ($\sim 134\times$ an ECDSA verification).
- **RISC Zero Succinct STARK Verification (`OpZkPrecompile` tag `0x21`):** `~9.081 ms` ($\sim 738\times$ an ECDSA verification), metering approximately `25,000,039` script units for a standard 222,668-byte succinct seal (requiring `compute_budget >= 2,500`, which grants $25,009,999$ script units).

### 3.3 V1 Cryptographic Commitments (txid, tx::hash, sighash)
<!-- id: tx-v1-commitments | world: W1 | difficulty: 3 | prereqs: tx-v1-schema | status: mainnet -->

Kaspa V1 maintains three distinct cryptographic digests over a transaction, each tailored to a specific consensus role. First, **txid (Transaction Identity)** identifies the transaction in outpoints (previous_outpoint.tx_id) and DAG dependency graphs; it commits to all deterministic intent fields—including output covenant_binding structs and the BLAKE3 digest of payload—while excluding malleable or resource-estimation fields (signature_script, compute_budget, and storage_mass). Second, **tx::hash (Full Block Commitment)** commits to the complete serialized transaction inside block Merkle trees, binding signature_script, compute_budget, raw payload, and storage_mass so neither miners nor relays can tamper with witness data or resource budgets after block inclusion. Third, **sighash (Spender Authorization Digest)** is the message digest signed by OpCheckSig and OpCheckSigECDSA; it excludes signature_script, compute_budget, and storage_mass, while committing to output covenant_binding fields whenever the corresponding outputs are covered by the selected sighash flags.

### 3.4 V1 Field Commitment Matrix
<!-- id: tx-v1-commitment-matrix | world: W1 | difficulty: 3 | prereqs: tx-v1-commitments | status: mainnet -->

| Transaction V1 Field | txid | tx::hash | sighash |
| --- | --- | --- | --- |
| version | ✓ | ✓ | ✓ |
| inputs[].previous_outpoint & sequence | ✓ | ✓ | ✓ |
| inputs[].signature_script | Empty placeholder | ✓ | ✗ |
| inputs[].compute_budget (V1) | ✗ | ✓ | ✗ |
| outputs[].value & script_public_key | ✓ | ✓ | ✓ (subject to sighash type) |
| outputs[].covenant_binding (V1) | ✓ | ✓ | ✓ (subject to sighash type) |
| lock_time, subnetwork_id, gas | ✓ | ✓ | ✓ |
| payload | ✓ (via BLAKE3 digest) | ✓ (raw bytes) | ✓ (via BLAKE3 digest) |
| storage_mass | ✗ | ✓ | ✗ |

### 3.5 Subnetwork IDs & User Lanes
<!-- id: tx-subnetwork-user-lanes | world: W6 | difficulty: 3 | prereqs: tx-v1-schema | status: mainnet -->

Every Kaspa transaction carries a 20-byte subnetwork_id (OpTxSubnetId 0xb6) that classifies its execution and sequencing lane.

| 20-Byte subnetwork_id Shape | Classification | Consensus & Gas Rules |
| --- | --- | --- |
| [0x00, 0x00 \* 19] | **Native Lane** | Standard KAS transfers and L1 covenant spends; gas **must** equal 0. |
| [0x01, 0x00 \* 19] | **Coinbase Lane** | Block reward transactions; gas **must** equal 0. |
| [x, 0x00 \* 19] (x \notin \{0,1\}) | **Reserved System ID** | Reserved for protocol extensions; gas **must** equal 0. |
| [namespace: 4 bytes, 0x00 \* 16] | **User Lane (KIP-21)** | Valid when namespace[1..=3] is not all-zero; only V1 user-lane txs may carry gas > 0. |

