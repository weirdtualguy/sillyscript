## 4. KIP-17: Covenants & Introspection Opcodes
<!-- id: kip17-introspection-opcodes | world: unmapped | difficulty: 2 | prereqs: none | status: mainnet -->

### 4.1 Complete Opcode Reference Table (51 Toccata Opcodes in `reference.js` + 4 Core Crypto Opcodes = 55 Total)
<!-- id: opcode-reference | world: unmapped | difficulty: 2 | prereqs: what-is-a-covenant | status: mainnet -->

The following consolidated tables document all **51 Toccata & curriculum opcodes** in `js/data/reference.js` (`SK.opcodes`) alongside **4 foundational Kaspa Script cryptographic opcodes** (`OpCheckSig`, `OpCheckSigECDSA`, `OpSha256`, `OpBlake2b`, referenced in `SK.cheat` and `SK.opDisabled`), totaling **55 opcodes** across KIP-16, KIP-17, KIP-20, KIP-21, and core Kaspa Script. Across the Toccata introspection range `0xb2`–`0xda`, `0xd4` is assigned to `OpChainblockSeqCommit` (KIP-21) and `0xca` remains unassigned/reserved, while legacy splice and shift opcodes `OpLeft` (`0x80`), `OpRight` (`0x81`), `OpLShift` (`0x98`), and `OpRShift` (`0x99`) remain disabled.

#### Category 1: Transaction-Level Introspection (6 Opcodes)
<!-- id: opcodes-tx-level | world: unmapped | difficulty: 2 | prereqs: opcode-reference | status: mainnet -->

| Opcode | Hex | Stack Transition | Description & Failure Semantics |
| --- | --- | --- | --- |
| OpTxVersion | 0xb2 | [] -> [version] | Pushes the transaction version (tx.version) as a script number. |
| OpTxLockTime | 0xb5 | [] -> [lock_time] | Pushes the transaction lock_time field as a script number. |
| OpTxSubnetId | 0xb6 | [] -> [subnet_id_bytes] | Pushes the 20-byte subnetwork_id (lane tag) as raw bytes. |
| OpTxGas | 0xb7 | [] -> [gas] | Pushes the transaction gas field as a script number. |
| OpTxPayloadSubstr | 0xb8 | [start, end] -> [substr] | Extracts zero-based slice [start, end) from tx.payload. |
| OpTxPayloadLen | 0xc4 | [] -> [len] | Pushes the byte length of tx.payload. |

#### Category 2: Input & Output Introspection (18 Opcodes)
<!-- id: opcodes-input-output | world: unmapped | difficulty: 2 | prereqs: opcode-reference | status: mainnet -->

| Opcode | Hex | Stack Transition | Description & Failure Semantics |
| --- | --- | --- | --- |
| OpTxInputCount | 0xb3 | [] -> [count] | Pushes total number of inputs (tx.inputs.length). |
| OpTxOutputCount | 0xb4 | [] -> [count] | Pushes total number of outputs (tx.outputs.length). |
| OpTxInputIndex | 0xb9 | [] -> [active_idx] | Pushes index of the input currently executing (this.activeInputIndex). |
| OpOutpointTxId | 0xba | [idx] -> [txid_32b] | Pushes 32-byte creating tx_id of input idx (tx.inputs[idx].outpointTxId). |
| OpOutpointIndex | 0xbb | [idx] -> [vout_idx] | Pushes outpoint index of input idx (tx.inputs[idx].outpointIndex). |
| OpTxInputScriptSigSubstr | 0xbc | [idx, s, e] -> [substr] | Extracts slice [s, e) from input idx's signature_script. |
| OpTxInputSeq | 0xbd | [idx] -> [seq_8b_le] | Pushes input idx's sequence field as 8 little-endian bytes. |
| OpTxInputAmount | 0xbe | [idx] -> [amount] | Pushes value in sompi of UTXO spent by input idx (tx.inputs[idx].value). |
| OpTxInputSpk | 0xbf | [idx] -> [spk_bytes] | Pushes serialized script_public_key of UTXO spent by input idx. |
| OpTxInputDaaScore | 0xc0 | [idx] -> [daa_score] | Pushes creating block's DAA score for input idx's UTXO. |
| OpTxInputIsCoinbase | 0xc1 | [idx] -> [bool] | Pushes 1 if input idx spends a coinbase output, else 0. |
| OpTxOutputAmount | 0xc2 | [idx] -> [amount] | Pushes value in sompi of output idx (tx.outputs[idx].value). |
| OpTxOutputSpk | 0xc3 | [idx] -> [spk_bytes] | Pushes serialized script_public_key of output idx (tx.outputs[idx].scriptPubKey). |
| OpTxInputSpkLen | 0xc5 | [idx] -> [len] | Pushes byte length of input idx's serialized script_public_key. |
| OpTxInputSpkSubstr | 0xc6 | [idx, s, e] -> [substr] | Extracts slice [s, e) from input idx's serialized script_public_key. |
| OpTxOutputSpkLen | 0xc7 | [idx] -> [len] | Pushes byte length of output idx's serialized script_public_key. |
| OpTxOutputSpkSubstr | 0xc8 | [idx, s, e] -> [substr] | Extracts slice [s, e) from output idx's serialized script_public_key. |
| OpTxInputScriptSigLen | 0xc9 | [idx] -> [len] | Pushes byte length of input idx's signature_script. |

#### Category 3: Covenant ID Introspection (9 Opcodes — KIP-20)
<!-- id: opcodes-covenant-id | world: unmapped | difficulty: 3 | prereqs: opcodes-input-output, covenant-id-lineage | status: mainnet -->

| Opcode | Hex | Stack Transition | Description & Failure Semantics |
| --- | --- | --- | --- |
| OpAuthOutputCount | 0xcb | [input_idx] -> [count] | Pushes number of outputs authorized by input_idx. |
| OpAuthOutputIdx | 0xcc | [input_idx, k] -> [out_idx] | Pushes output index of the k-th output authorized by input_idx. |
| OpInputCovenantId | 0xcf | [input_idx] -> [cov_id_32b] | Pushes 32-byte covenant_id of input input_idx, or 32 zero bytes if none. |
| OpCovInputCount | 0xd0 | [cov_id] -> [count] | Pushes count of inputs carrying cov_id. |
| OpCovInputIdx | 0xd1 | [cov_id, k] -> [input_idx] | Pushes transaction input index of the k-th input carrying cov_id. |
| OpCovOutputCount | 0xd2 | [cov_id] -> [count] | Pushes count of continuation outputs carrying cov_id. |
| OpCovOutputIdx | 0xd3 | [cov_id, k] -> [out_idx] | Pushes transaction output index of the k-th output carrying cov_id. |
| OpOutputCovenantId | 0xd5 | [out_idx] -> [cov_id_32b] | Pushes 32-byte covenant_id of output out_idx, or 32 zero bytes if none. |
| OpOutputAuthorizingInput | 0xd6 | [out_idx] -> [input_idx] | Pushes authorizing_input index of output out_idx, or -1 if unbound. |

#### Category 4: Signatures & Cryptographic Hashes (5 Toccata Opcodes in `SK.opcodes` + 4 Core Opcodes = 9 Total)
<!-- id: opcodes-sig-hash | world: unmapped | difficulty: 2 | prereqs: opcode-reference | status: mainnet -->

| Opcode | Hex | Stack Transition | Description & Failure Semantics |
| :--- | :---: | :--- | :--- |
| `OpCheckSig` *(Core — in `SK.cheat`)* | `0xac` | `[sig, pk] -> [bool]` | Verifies 65-byte Schnorr tx signature (`checkSig(sig, pk)`). |
| `OpCheckSigECDSA` *(Core — in `SK.cheat`)* | `0xab` | `[sig, pk33] -> [bool]` | Verifies ECDSA tx signature (`checkSigEcdsa(sig, pk)`). |
| `OpCheckSigFromStack` | `0xd7` | `[sig64, msg32, pk32] -> [bool]` | Verifies 64-byte Schnorr signature over arbitrary 32-byte digest (`checkMsgSig`). |
| `OpCheckSigFromStackECDSA` | `0xd8` | `[sig64, msg32, pk33] -> [bool]` | Verifies 64-byte ECDSA signature over arbitrary 32-byte digest (`checkMsgSigEcdsa`). |
| `OpSha256` *(Core — in `SK.cheat`)* | `0xa8` | `[data] -> [hash32]` | Computes standard 32-byte SHA-256 digest (`sha256(data)`). |
| `OpBlake2b` *(Core — in `SK.cheat`)* | `0xaa` | `[data] -> [hash32]` | Computes unkeyed 32-byte BLAKE2b-256 digest (`blake2b(data)`). |
| `OpBlake2bWithKey` | `0xa7` | `[data, key] -> [hash32]` | Computes keyed BLAKE2b-256 digest (`0 <= key.len <= 64`). |
| `OpBlake3` | `0xd9` | `[data] -> [hash32]` | Computes unkeyed 32-byte BLAKE3 digest (`blake3(data)`). |
| `OpBlake3WithKey` | `0xda` | `[data, key32] -> [hash32]` | Computes keyed 32-byte BLAKE3 digest (`key.len == 32` required). |

#### Category 5: Byte Manipulation, Arithmetic & Conversion (11 Opcodes — KIP-17)
<!-- id: opcodes-bytes-arith | world: unmapped | difficulty: 3 | prereqs: opcode-reference | status: mainnet -->

| Opcode | Hex | Stack Transition | Description & Failure Semantics |
| --- | --- | --- | --- |
| OpCat | 0x7e | [b1, b2] -> [b1 \|\| b2] | Concatenates byte strings; fails if result > 1,000,000 bytes. |
| OpSubstr | 0x7f | [str, start, end] -> [sub] | Extracts zero-based slice [start, end); fails if start > end or out of bounds. |
| OpInvert | 0x83 | [bytes] -> [~bytes] | Bitwise NOT across all bytes in the array. |
| OpAnd | 0x84 | [b1, b2] -> [b1 & b2] | Bitwise AND; fails unless b1.len == b2.len. |
| OpOr | 0x85 | [b1, b2] -> [b1 \| b2] | Bitwise OR; fails unless b1.len == b2.len. |
| OpXor | 0x86 | [b1, b2] -> [b1 ^ b2] | Bitwise XOR; fails unless b1.len == b2.len. |
| OpMul | 0x95 | [a, b] -> [a \* b] | Signed 64-bit integer multiplication; aborts on signed overflow. |
| OpDiv | 0x96 | [a, b] -> [a / b] | Signed 64-bit integer division; aborts on division by zero or i64::MIN / -1. |
| OpMod | 0x97 | [a, b] -> [a % b] | Signed 64-bit modulo; aborts on modulo by zero. |
| OpNum2Bin | 0xcd | [num, size] -> [bytes] | Encodes script number into fixed size-byte signed-magnitude array (1 \le \text{size} \le 8). |
| OpBin2Num | 0xce | [bytes] -> [num] | Converts signed-magnitude byte array (\le 8 bytes) to minimally encoded script number. |

#### Category 6: Proofs & Partitioned Sequencing (2 Opcodes — KIP-16 & KIP-21)
<!-- id: opcodes-zk-seqcommit | world: unmapped | difficulty: 4 | prereqs: kip16-proof-systems, kip21-lane-rules-proving | status: mainnet -->

| Opcode | Hex | Stack Transition | Description & Failure Semantics |
| --- | --- | --- | --- |
| OpZkPrecompile | 0xa6 | [tag, vk, proof, pub_in...] -> [] | Verifies ZK proof (0x20 Groth16, 0x21 RISC Zero STARK); aborts script on failure. |
| OpChainblockSeqCommit | 0xd4 | [block_hash32] -> [seqcommit32] | Pushes 32-byte SeqCommit(B) from accepted_id_merkle_root of chain ancestor B. |

### 4.2 Substring & Indexing Rules
<!-- id: substring-indexing-rules | world: unmapped | difficulty: 3 | prereqs: opcodes-bytes-arith | status: mainnet -->

All substring opcodes (OpSubstr, OpTxPayloadSubstr, OpTxInputScriptSigSubstr, OpTxInputSpkSubstr, OpTxOutputSpkSubstr) enforce identical boundary semantics. Byte positions are strictly zero-based, with start inclusive and end exclusive, returning end - start bytes. Execution aborts immediately if start < 0, end < 0, start > end, or end exceeds the length of the target byte vector, or if the resulting slice exceeds MAX_SCRIPT_ELEMENT_SIZE (1,000,000\text{ bytes}).

### 4.3 Post-Toccata Script Engine Limits
<!-- id: script-engine-limits | world: unmapped | difficulty: 2 | prereqs: opcode-reference | status: mainnet -->

| Consensus Limit Parameter | Pre-Toccata Limit | Post-Toccata Limit | Impact on Covenant Engineering |
| --- | --- | --- | --- |
| MAX_SCRIPT_ELEMENT_SIZE | 520\text{ bytes} | 1,000,000\text{ bytes} | Enables large P2SH redeem scripts, state arrays, and STARK proofs on the stack. |
| MAX_SCRIPTS_SIZE | 10,000\text{ bytes} | 1,000,000\text{ bytes} | Supports multi-contract transactions and unrolled N:M validation loops. |
| MAX_OPS_PER_SCRIPT | 201\text{ ops} | 1,000,000\text{ ops} | Bounded dynamically per input by KIP-25 compute_budget allowance. |
| MAX_SIGNATURE_SCRIPT_LEN | 10,000\text{ bytes} | 250,000\text{ bytes} | Accommodates large witness payloads and P2SH redeem script preimages. |

