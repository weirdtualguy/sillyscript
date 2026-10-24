## Appendix A: Silverscript $\rightarrow$ Opcode Quick Reference
<!-- id: appendix-silverscript-opcode-quickref | world: unmapped | difficulty: 2 | prereqs: opcode-reference | status: unverified -->

| Silverscript Construct | Lowered Opcode | Hex |
| :--- | :--- | :---: |
| `tx.version` | `OpTxVersion` | `0xb2` |
| `tx.inputs.length` | `OpTxInputCount` | `0xb3` |
| `tx.outputs.length` | `OpTxOutputCount` | `0xb4` |
| `tx.daa` / `tx.time` | `OpTxLockTime` | `0xb5` |
| `OpTxSubnetId()` | `OpTxSubnetId` | `0xb6` |
| `OpTxGas()` | `OpTxGas` | `0xb7` |
| `OpTxPayloadSubstr(s, e)` | `OpTxPayloadSubstr` | `0xb8` |
| `this.activeInputIndex` | `OpTxInputIndex` | `0xb9` |
| `tx.inputs[i].outpointTxId` | `OpOutpointTxId` | `0xba` |
| `tx.inputs[i].outpointIndex` | `OpOutpointIndex` | `0xbb` |
| `this.ageDaa` | `OpTxInputSeq` | `0xbd` |
| `tx.inputs[i].value` | `OpTxInputAmount` | `0xbe` |
| `tx.inputs[i].scriptPubKey` | `OpTxInputSpk` | `0xbf` |
| `OpTxInputDaaScore(i)` | `OpTxInputDaaScore` | `0xc0` |
| `OpTxInputIsCoinbase(i)` | `OpTxInputIsCoinbase` | `0xc1` |
| `tx.outputs[i].value` | `OpTxOutputAmount` | `0xc2` |
| `tx.outputs[i].scriptPubKey` | `OpTxOutputSpk` | `0xc3` |
| `OpTxPayloadLen()` | `OpTxPayloadLen` | `0xc4` |
| `checkSig(s, pk)` | `OpCheckSig` | `0xac` |
| `checkSigEcdsa(s, pk)` | `OpCheckSigECDSA` | `0xab` |
| `checkMsgSig(ds, msg, pk)` | `OpCheckSigFromStack` | `0xd7` |
| `checkMsgSigEcdsa(ds, msg, pk)` | `OpCheckSigFromStackECDSA` | `0xd8` |
| `sha256(data)` | `OpSha256` | `0xa8` |
| `blake2b(data)` | `OpBlake2b` | `0xaa` |
| `blake2bWithKey(data, key)` | `OpBlake2bWithKey` | `0xa7` |
| `blake3(data)` | `OpBlake3` | `0xd9` |
| `blake3WithKey(data, key)` | `OpBlake3WithKey` | `0xda` |
| `val as byte[N]` | `OpNum2Bin` | `0xcd` |
| `int(bytes)` | `OpBin2Num` | `0xce` |
| `OpAuthOutputCount(idx)` | `OpAuthOutputCount` | `0xcb` |
| `OpAuthOutputIdx(idx, k)` | `OpAuthOutputIdx` | `0xcc` |
| `OpInputCovenantId(idx)` | `OpInputCovenantId` | `0xcf` |
| `OpCovInputCount(id)` | `OpCovInputCount` | `0xd0` |
| `OpCovInputIdx(id, k)` | `OpCovInputIdx` | `0xd1` |
| `OpCovOutputCount(id)` | `OpCovOutputCount` | `0xd2` |
| `OpCovOutputIdx(id, k)` | `OpCovOutputIdx` | `0xd3` |
| `OpChainblockSeqCommit(hash)` | `OpChainblockSeqCommit` | `0xd4` |
| `OpOutputCovenantId(idx)` | `OpOutputCovenantId` | `0xd5` |
| `OpOutputAuthorizingInput(idx)` | `OpOutputAuthorizingInput` | `0xd6` |
| `g16.verify(...)` / `OpZkPrecompile` | `OpZkPrecompile` (tags `0x20` / `0x21`) | `0xa6` |

## Appendix B: Kaspa Improvement Proposals (KIP) Status Matrix
<!-- id: appendix-kip-status-matrix | world: unmapped | difficulty: 1 | prereqs: none | status: mainnet -->

| KIP | Specification Title | Consensus Scope | Status | Activation Milestone |
| :---: | :--- | :--- | :---: | :--- |
| **KIP-9** | Storage Mass Accounting | Penalizes UTXO bloat; motivates KCC20 `0xFF` Borrower Path | Active | Crescendo / Pre-Toccata |
| **KIP-10** | Conditional Spending & Smart Contracts | Foundational roadmap for L1 covenant programmability | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |
| **KIP-16** | ZK Precompile Opcodes | `OpZkPrecompile` (`0xa6`) with Groth16 (`0x20`) and RISC Zero (`0x21`) | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |
| **KIP-17** | Covenants & Introspection Opcodes | Transaction, input/output, byte, math, and hash opcodes | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |
| **KIP-20** | Covenant IDs | Consensus-tracked 32-byte `covenant_id` lineage (`0xcb`–`0xd6`) | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |
| **KIP-21** | Partitioned Sequencing Commitments | Per-lane `SeqCommit(B)` and `OpChainblockSeqCommit` (`0xd4`) | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |
| **KIP-24** | Transaction V1 | `compute_budget`, `covenant_binding`, BLAKE3 payload digest, user lanes | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |
| **KIP-25** | Script Pricing | Compute-gram fee model ($\text{compute\_budget} \times 10,000 + 9,999$ units) | Active | Toccata (June 30, 2026 — DAA `474,165,565`) |

## Appendix C: SillyKuest Curriculum World & Lesson Map (worlds.js / w1..w6.js)
<!-- id: appendix-curriculum-world-map | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| World | World Name & Badge | Boss Fight Persona | Lessons (id: Title) & Core SSOT Sections |
| --- | --- | --- | --- |
| **1** | **Envelope Town** Badge: *Postmaster* | **The Ledger Goblin** *"Insists everything is an account balance."* | 1-1 Coins live in envelopes (§0.2, §2.1) 1-2 Envelopes with rules (§2.2) 1-3 The sticky note inside (§2.3, §5.1) 1-4 Meet Toccata (§1.1, §3.1–§3.4) |
| **2** | **Speak Silver** Badge: *Silver Tongue* | **The Syntax Gremlin** *"Swaps your >= for a <= when you blink."* | 2-1 Anatomy of a contract (§8.1, P2PK, TransferWithTimeout) 2-2 Types: labels on the boxes (§8.2, §8.5) 2-3 Decisions and loops (§8.3) 2-4 Clocks (§8.4) 2-5 Peeking at the transaction (§8.6, Mecenas) |
| **3** | **First Covenants** Badge: *Copycat Catcher* | **The Copycat Imp** *"Swaps your code for a lookalike."* | 3-1 Your first covenant: the counter (§8.1, §9.5, Counter) 3-2 The copy-paste rule (§8.5, §10.1) 3-3 One family, one live envelope (§9.4, §9.6, SingletonTermination) 3-4 Challenge: build and debug (§9.5, §12.3) |
| **4** | **Family Trees** Badge: *Family Historian* | **The Forger Fox** *"Prints family badges at home."* | 4-1 The shape of a spend (§9.1, §9.4) 4-2 Family badges (§5.1–§5.4) 4-3 Auth or cov? (§9.2, §9.3) 4-4 Challenge: the pot splitter (§9.7, PotSplitter) |
| **5** | **Teamwork** Badge: *Team Player* | **The Tangle Troll** *"Thinks covenants can call each other."* | 5-1 Covenants can't phone each other (§11.1, §13.3) 5-2 Leader and delegates (§9.8, §13.2, VaultNM) 5-3 Tokens with KCC20 (§11.2, §11.3, KCC20) 5-4 The minter (§11.4, §11.5, KCC20Minter) |
| **6** | **Toccata Sky** Badge: *Sky Walker* | **The Overengineer** *"Uses a ZK proof to add two numbers."* | 6-1 Proofs on L1 (§7.1, §8.5) 6-2 Lanes (§3.5, §6.1–§6.3) 6-3 Based apps (§1.2, §6.3, §14) 6-4 The safety net (§12.1–§12.3) |

