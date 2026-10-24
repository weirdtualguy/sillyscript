## 15. Complete 56-Term Dual-Layer Glossary (glossary.js Master Sync)
<!-- id: glossary | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

This section serves as the 1:1 master table for js/data/glossary.js, providing every curriculum term ID (id), display name (term), category (cat), beginner plain-English analogy (s), and formal consensus/compiler specification (p).

### 15.1 Category: Basics (14 Terms)
<!-- id: glossary-basics | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| ID (id) | Term (term) | Plain-English Curriculum Definition (s) | Formal Consensus & Technical Specification (p) |
| --- | --- | --- | --- |
| utxo | **UTXO** | A sealed envelope of coins that nobody has opened yet. An owner never edits it in place: opening it once destroys it and replaces it with brand-new envelopes. | Unspent Transaction Output (UtxoEntry). Kaspa state is distributed across immutable UTXOs; spending one consumes the outpoint and creates new UTXOs. |
| `toccata` | **Toccata** | The Kaspa mainnet upgrade (June 30, 2026) that made smart-contract programming possible while keeping the fast, parallel envelope model. | Kaspa's UTXO-native mainnet programmability stack (activated June 30, 2026 at DAA score 474,165,565): KIP-16 (inline ZK), KIP-17 (covenants & introspection), KIP-20 (Covenant IDs), KIP-21 (partitioned sequencing), KIP-24 (Transaction V1), and KIP-25 (script pricing). |
| kip | **KIP** | A Kaspa Improvement Proposal: a numbered technical design document specifying a protocol rule or upgrade. | Kaspa Improvement Proposal. The Toccata hard fork comprises KIP-16, KIP-17, KIP-20, KIP-21, KIP-24, and KIP-25 (building alongside KIP-9 and KIP-10). |
| p2sh | **P2SH** | Pay-to-Script-Hash. The outside of the envelope shows only a 32-byte hash fingerprint of the script; the full script and its sticky-note state are revealed when spent. | Pay-to-Script-Hash (byte[37] SPK). The output commits to the BLAKE2b-256 hash of a redeem script. Stateful covenants store runtime state in that redeem script preimage. |
| redeem-script | **Redeem script** | The complete executable script hidden inside a P2SH envelope, containing the fixed rule code and the mutable sticky-note state. | The script preimage ([template_prefix][runtime_state][template_suffix]) revealed in an input's signature_script whose BLAKE2b hash matches the spent P2SH output. |
| state | **State** | The facts a covenant remembers from one spend to the next—such as a counter, an owner identifier, or a token balance. | Mutable runtime data (runtime_state) encoded in the middle span of a P2SH redeem script preimage. Updating state produces a new P2SH script_public_key. |
| daa-score | **DAA score** | A network counter that ticks upward as blocks are added to the BlockDAG, functioning like a monotonic block height clock. | Difficulty Adjustment Algorithm score (u64); Kaspa's block-count analog used for absolute locktimes (tx.daa < 500,000,000,000) and relative age locks (this.ageDaa). |
| blue-score | **Blue score** | A consensus counter measuring how many well-connected honest ("blue") blocks precede a block in the GHOSTDAG ordering. | GHOSTDAG consensus progression metric (u64) committed in KIP-21 MergesetContextHash(B) and used to trigger lane inactivity purges after F blue-score units. |
| introspection | **Introspection** | The ability of a script to inspect the transaction spending it—reading inputs, outputs, amounts, locks, and its own input index. | KIP-17 and KIP-20 opcodes (0xb2–0xd6) that push transaction-level fields, input/output attributes, and covenant bindings onto the script stack. |
| signature | **Signature** | Cryptographic proof that the holder of a private key approved a specific transaction or message digest. | A 65-byte transaction signature (sig, used by checkSig / checkSigEcdsa) or 64-byte data signature (datasig, used by checkMsgSig / checkMsgSigEcdsa). |
| pubkey | **Public key** | The shareable half of a cryptographic key pair stored inside a lock to verify signatures from the owner. | Silverscript primitive type pubkey representing a 32-byte Schnorr public key (ECDSA built-ins use byte[33] compressed keys). |
| blake2b | **BLAKE2b** | A cryptographic hash function that condenses arbitrary data into a 32-byte fingerprint; used for P2SH locks and Covenant IDs. | BLAKE2b-256 (OpBlake2b 0xaa, OpBlake2bWithKey 0xa7). Used for P2SH script hashing and KIP-20 Genesis hashing with domain tag "CovenantID". |
| blake3 | **BLAKE3** | A fast cryptographic hash function used to compute code template hashes, entrypoint dispatch tags, and V1 payload digests. | 32-byte BLAKE3 hash (OpBlake3 0xd9, OpBlake3WithKey 0xda). Used for KCC-01 template_hash, 4-byte dispatch tags, and Transaction V1 payload commitments. |
| opcode | **Opcode** | A single low-level instruction executed by Kaspa's stack-based script engine. | A 1-byte virtual machine instruction (such as OpTxOutputAmount 0xc2 or OpZkPrecompile 0xa6) to which Silverscript source code compiles. |

### 15.2 Category: Silverscript (10 Terms)
<!-- id: glossary-silverscript | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| ID (id) | Term (term) | Plain-English Curriculum Definition (s) | Formal Consensus & Technical Specification (p) |
| --- | --- | --- | --- |
| silverscript | **Silverscript** | The high-level, human-readable programming language used to write Kaspa covenants that compile down to Kaspa Script opcodes. | CashScript-inspired statically typed covenant language and compiler targeting Kaspa Script (pragma silverscript ^0.1.0;). |
| contract | **Contract** | A complete Silverscript program defining the immutable parameters, sticky-note state fields, and spending rules for a class of UTXOs. | Top-level compilation unit encapsulating constructor parameters, constants, mutable State fields, manual entry blocks, and #[covenant] hooks. |
| constructor | **Constructor parameter** | An immutable configuration value fixed when the contract is created, baked directly into the template code. | Header parameters in contract Name(T1 p1, ...) compiled into template_prefix or template_suffix constants. |
| entry | **Entry** | A specific door for spending a contract; a single contract can expose multiple entries with different rules. | A public spend entrypoint selected at runtime by a 4-byte KCC-01 dispatch tag (blake3("name(types)")[0..4]) at the end of signature_script. |
| require | **require** | A mandatory guard statement: if the condition inside is false, script execution aborts immediately and the spend is rejected. | Assertion statement require(boolExpr[, "msg"]); that compiles to OpVerify (0x69) and aborts transaction validation on false. |
| temporal | **temporal** | A dedicated 64-bit integer type representing millisecond time values so timestamps cannot be accidentally mixed with plain numbers. | 64-bit signed time type in milliseconds (tx.time >= T). Shares int representation and operators but requires explicit compile-time cast temporal(x) / int(t). |
| unroll-bound | **Unroll bound** | The compile-time maximum number of iterations a for loop may execute, copied out statically by the compiler. | The 4th argument MAX_ITERATIONS in for(i, start, end, MAX_ITERATIONS). Compiler emits MAX_ITERATIONS guarded copies (if (i < end)). |
| state-field | **State field** | A mutable variable declared in the contract body that lives on the sticky note and updates across spends. | Contract-body variable declaration (int count = init_count;) packed into the compiler-synthesized State struct and encoded in runtime_state. |
| verification-mode | **Verification mode** | The spender proposes the new state in the witness, and the covenant policy function checks that the proposed state obeys all rules. | Default #[covenant] mode when the policy function has no return type; receives State new_state or State[] new_states as input arguments. |
| transition-mode | **Transition mode** | The covenant policy function computes the next state directly from the old state and witness inputs and returns it. | Default #[covenant] mode when the policy declares a return type : (State) or : (State[]) and exits via return(next_state);. |

### 15.3 Category: Covenants (15 Terms)
<!-- id: glossary-covenants | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| ID (id) | Term (term) | Plain-English Curriculum Definition (s) | Formal Consensus & Technical Specification (p) |
| --- | --- | --- | --- |
| covenant | **Covenant** | A rule attached to an envelope that restricts what the next envelopes in the spending transaction must look like. | A UTXO locking script that uses KIP-17/KIP-20 introspection opcodes to constrain the properties, outputs, and state transitions of the spending transaction. |
| covenant-id | **Covenant ID** | An unforgeable 32-byte family badge tracked by Kaspa consensus that stays constant while P2SH fingerprints change. | KIP-20 32-byte lineage identifier (Hash32) stored in UtxoEntry.covenant_id, preserved via Continuation or initialized via Genesis hashing. |
| covenant-binding | **Covenant binding** | A label on a Transaction V1 output declaring which covenant family it belongs to and which input approved it. | Transaction V1 output struct CovenantBinding { authorizing_input: u16, covenant_id: Hash32 } committed in txid, tx::hash, and sighash. |
| continuation | **Continuation** | Creating a new envelope in an existing covenant family by spending an input envelope that already carries that family's Covenant ID. | KIP-20 lineage rule where out[j].covenant.covenant_id == tx.utxo(authorizing_input).covenant_id. |
| genesis | **Genesis** | The birth of a brand-new covenant family, whose ID is hashed from the spent input outpoint and the initial authorized outputs. | KIP-20 initialization rule where id = BLAKE2b-256["CovenantID"](in[a].previous_outpoint \|\| len(auth_outputs) \|\| serialized_auth_outputs). |
| singleton | **Singleton** | A covenant family that maintains at most one live envelope at a time: one input in, one successor output out. | 1:1 topology (#[covenant.singleton] \equiv from = 1, to = 1), optionally supporting termination = allowed in transition mode. |
| fanout | **Fan-out** | A covenant transition where a single input envelope splits into multiple successor envelopes (1:N). | 1:N topology macro #[covenant.fanout(to = Y)] (\equiv binding = auth, from = 1, to = Y). |
| topology | **Topology** | The input-to-output cardinality shape of a covenant transition: 1:1 (singleton), 1:N (fan-out), or N:M (merge/split). | The from = X, to = Y bounds declared in #[covenant(from = X, to = Y)] governing state parameter shapes. |
| auth-binding | **auth binding** | Counting covenant outputs by asking which outputs a single specific input directly authorized (1:1 and 1:N). | binding = auth in #[covenant]; lowers to OpAuthOutputCount (0xcb) and OpAuthOutputIdx (0xcc); requires from == 1. |
| cov-binding | **cov binding** | Grouping all inputs and outputs in a transaction that share the same Covenant ID (N:M leader/delegate transitions). | binding = cov in #[covenant]; lowers to OpCovInputCount/Idx (0xd0/0xd1) and OpCovOutputCount/Idx (0xd2/0xd3); makes the contract a leader. |
| leader-delegate | **Leader and delegate** | In an N:M spend, covenant input 0 (the leader) validates the entire transition while inputs 1..N-1 (delegates) verify the leader and check local auth. | N:M validation pattern where input 0 runs the binding = cov policy and remaining inputs run #[covenant.delegate] with cycle guard leader_idx < active_idx. |
| template | **Template** | The invariant code prefix and suffix of a covenant's redeem script surrounding the mutable middle state slice. | The static bytecode structure [template_prefix][runtime_state][template_suffix] emitted by the Silverscript compiler. |
| template-hash | **Template hash** | A 32-byte BLAKE3 fingerprint of a contract's prefix and suffix code used to prove an output runs genuine contract logic. | BLAKE3(serialize_script_i64(len(prefix), 8) \|\| prefix \|\| serialize_script_i64(len(suffix), 8) \|\| suffix). |
| dispatch-tag | **Dispatch tag** | A 4-byte selector placed at the end of the spend arguments telling the contract which entrypoint or policy to run. | KCC-01 selector blake3("entryName(type1,type2,...)")[0..4] appended to witness arguments in signature_script. |
| icc | **ICC** | Inter-Covenant Communication: independent covenants cooperating by being spent together in one atomic transaction. | Cross-covenant coordination without eval, combining witness Covenant ID verification (OpInputCovenantId) and foreign template validation (validateOutputStateWithInputTemplate). |

### 15.4 Category: Transactions (8 Terms)
<!-- id: glossary-transactions | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| ID (id) | Term (term) | Plain-English Curriculum Definition (s) | Formal Consensus & Technical Specification (p) |
| --- | --- | --- | --- |
| compute-budget | **Compute budget** | Per-input script work allowance in Transaction V1; too low aborts execution, while too high increases transaction mass. | u16 field per V1 input granting \text{compute\_budget} \times 10,000 + 9,999 script units (KIP-25). Committed in tx::hash, excluded from txid and sighash. |
| txid | **txid** | The unique identifier of a transaction, computed from its intent fields while excluding signatures and compute_budget. | 32-byte transaction ID committing inputs, outputs, covenant_binding, and BLAKE3 payload digest, while excluding signature_script, compute_budget, and storage_mass. |
| tx-hash | **tx::hash** | The complete transaction digest committed inside block headers, covering signatures, compute_budget, and storage_mass. | Full serialized transaction hash used in block commitments, binding witness scripts, compute_budget, raw payload, and storage_mass. |
| sighash | **Sighash** | The exact transaction digest a signer approves when generating a Schnorr or ECDSA signature. | Signature hash digest excluding signature_script, compute_budget, and storage_mass, while covering covenant_binding on signed outputs. |
| user-lane | **User lane** | A dedicated sequencing channel for a specific Based App, allowing provers to verify just that app's transactions. | A Transaction V1 carrying subnetwork_id = [namespace: 4B, 0x00 \* 16] where namespace[1..=3] != 0. Partitioned by KIP-21 for O(\text{activity}) proving. |
| subnetwork-id | **Subnetwork ID** | The 20-byte tag on a transaction identifying whether it belongs to the native lane, coinbase lane, or a user lane. | 20-byte transaction field (OpTxSubnetId 0xb6). [0x00 \* 20] is native, [0x01, 0x00 \* 19] is coinbase, and [ns: 4B, 0x00 \* 16] is a KIP-21 user lane. |
| gas | **Gas** | A bandwidth/sequencing budget field permitted only on V1 user-lane transactions. | u64 field (OpTxGas 0xb7). Must be 0 on native/system lanes; capped at 1,000,000,000 (10^9) total gas per lane per block on V1 user lanes. |
| seqcommit | **SeqCommit** | A recursive block-level fingerprint of sequenced activity partitioned by lane so Based Apps can prove their slice of history. | KIP-21 32-byte partitioned sequencing commitment stored in accepted_id_merkle_root and exposed to scripts via OpChainblockSeqCommit (0xd4). |

### 15.5 Category: Tokens (3 Terms)
<!-- id: glossary-tokens | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| ID (id) | Term (term) | Plain-English Curriculum Definition (s) | Formal Consensus & Technical Specification (p) |
| --- | --- | --- | --- |
| kcc | **KCC** | Kaspa Covenant Contract: a shared interoperability standard for covenant ABIs, dispatch tags, and tokens. | Open specification series (KCC-0001 core ABI/template conventions and KCC-0020 fungible token interface) enabling cross-wallet and indexer compatibility. |
| kcc20 | **KCC20** | A fungible token standard built from covenants where each token UTXO stores an owner, an identifier type, a balance, and a minter flag. | Token state machine covenant maintaining the 42-byte state header (ownerIdentifier, identifierType, amount, isMinter) and supporting 0x00/0x01/0x02 auth plus 0xFF borrowed receive. |
| minter | *KCC20Minter* | A companion singleton controller covenant that governs when new KCC20 tokens may be minted and enforces the supply cap. | Singleton controller covenant (kcc20Covid, amount, initialized) that co-spends with a KCC20 minter branch and authenticates minted outputs via validateOutputStateWithInputTemplate. |

### 15.6 Category: Proofs & Apps (6 Terms)
<!-- id: glossary-proofs-apps | world: unmapped | difficulty: 1 | prereqs: none | status: pedagogical -->

| ID (id) | Term (term) | Plain-English Curriculum Definition (s) | Formal Consensus & Technical Specification (p) |
| --- | --- | --- | --- |
| zk-proof | **ZK proof** | A compact cryptographic receipt proving an off-chain computation was executed correctly without re-running the computation on L1. | Zero-knowledge validity proof verified inline by L1 covenant scripts via OpZkPrecompile (0xa6, KIP-16). |
| groth16 | **Groth16** | A highly compact zero-knowledge proof system (~1.65 ms verification) that is cheap on bandwidth but not quantum-safe. | Arkworks Groth16 SNARK precompile (OpZkPrecompile tag 0x20, g16.verify), taking 1.649\text{ ms} (\sim 134\times ECDSA) with 3 group elements. |
| `stark` | **STARK** | A larger, hash-based ZK proof (~9.08 ms to verify) that needs no trusted setup and is quantum-safe. | RISC Zero Succinct STARK precompile (`OpZkPrecompile` `0xa6`, tag `0x21`). Quantum-safe proof taking $9.081\text{ ms}$ ($\sim 738\times$ ECDSA, metering $\sim 25,000,039$ script units). |
| based-app | **Based app** | An application where users post payload transactions on a dedicated L1 lane, an off-chain runtime executes them, and a ZK proof settles the new state on Kaspa. | Layer-2 architecture combining KIP-21 user-lane L1 sequencing (SeqCommit), off-chain execution, and L1 settlement covenants verifying KIP-16 ZK proofs. |
| vprogs | **vprogs** | An evolving reference toolkit and RISC Zero proving pipeline for building and proving Kaspa Based Apps. | Verifiable Programs reference runtime and proving pipeline for KIP-21/KIP-16 based applications. |
| argent | **Argent** | An experimental multi-contract compiler frontend that models cooperating covenants as communicating actors. | Experimental actor-oriented language frontend that lowers multi-contract systems into standard Silverscript and portable argent-runtime descriptors. |

