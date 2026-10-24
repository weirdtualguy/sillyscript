### 8.7 Canonical Stateless & Fixed-Lock Contracts (P2PK, TransferWithTimeout, Mecenas)
<!-- id: canonical-stateless-contracts | world: W2 | difficulty: 2 | prereqs: silverscript-contract-structure | status: unverified -->

#### Contract 1: P2PK (Stateless Signature Lock — World 2)
<!-- id: contract-p2pk | world: W2 | difficulty: 1 | prereqs: silverscript-contract-structure | status: unverified -->

```
pragma silverscript ^0.1.0;

contract P2PK(pubkey pk) {
    entry spend(sig s) {
        require(checkSig(s, pk));
    }
}
```

| Code Line | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| pragma silverscript ^0.1.0; | Specifies the Silverscript compiler version for this contract. | Compiler version constraint. |
| contract P2PK(pubkey pk) { | Declares a contract named P2PK with one immutable constructor parameter pk (the owner's 32-byte public key). | pk is baked into the script template. |
| entry spend(sig s) { | Defines a spending entrypoint named spend that requires a 65-byte signature s from the spender. | Dispatched via 4-byte KCC-01 tag blake3("spend(sig)")[0..4]. |
| require(checkSig(s, pk)); | Aborts the spend unless s is a valid Schnorr signature from pk over this transaction. | Compiles to OpCheckSig (0xac) + OpVerify; checkSigEcdsa is the ECDSA equivalent. |

#### Contract 2: TransferWithTimeout (Multi-Entry + Absolute Timestamp Lock — World 2)
<!-- id: contract-transfer-with-timeout | world: W2 | difficulty: 2 | prereqs: contract-p2pk, silverscript-time-locks | status: unverified -->

```
pragma silverscript ^0.1.0;

contract TransferWithTimeout(pubkey sender, pubkey recipient, temporal timeout) {
    entry transfer(sig recipientSig) {
        require(checkSig(recipientSig, recipient));
    }
    entry reclaim(sig senderSig) {
        require(checkSig(senderSig, sender));
        require(tx.time >= timeout);
    }
}
```

| Code Line | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| contract TransferWithTimeout(pubkey sender, pubkey recipient, temporal timeout) { | Three immutable parameters: two public keys and a millisecond deadline of type temporal. | temporal prevents mixing plain integers with timestamps. |
| entry transfer(sig recipientSig) { | Door 1: the recipient claims the funds at any time using a valid signature. | No time lock applies to transfer. |
| entry reclaim(sig senderSig) { | Door 2: the sender reclaims the funds if the recipient has not claimed them before the deadline. | Separate dispatch tag blake3("reclaim(sig)")[0..4]. |
| require(tx.time >= timeout); | Enforces that the transaction's timestamp is at or past timeout. | Absolute CLTV timestamp lock; timeout must satisfy >= 500,000,000,000. |

#### Contract 3: Mecenas (Stateless Recurring Subscription Covenant — World 2)
<!-- id: contract-mecenas | world: W2 | difficulty: 3 | prereqs: contract-transfer-with-timeout, silverscript-introspection-mapping | status: unverified -->

```
pragma silverscript ^0.1.0;

contract Mecenas(pubkey recipient, byte[32] funder, int pledge, int period) {
    entry receive() {
        require(this.ageDaa >= period);
        byte[36] spk = new ScriptPubKeyP2PK(recipient);
        require(tx.outputs[0].scriptPubKey == byte[](spk));
        int minerFee = 1000;
        int val = tx.inputs[this.activeInputIndex].value;
        int change = val - pledge - minerFee;
        if (change < pledge + minerFee) {
            require(tx.outputs[0].value == val - minerFee);
        } else {
            require(tx.outputs[0].value == pledge);
            require(tx.outputs[1].scriptPubKey == tx.inputs[this.activeInputIndex].scriptPubKey);
            require(tx.outputs[1].value == change);
        }
    }
    entry reclaim(pubkey pk, sig s) {
        require(blake2b(byte[](pk)) == funder);
        require(checkSig(s, pk));
    }
}
```

| Code Line | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| require(this.ageDaa >= period); | The envelope being spent must be at least period DAA-score units old. | Relative CSV lock (0 <= period < 2^32). |
| byte[36] spk = new ScriptPubKeyP2PK(recipient); | Constructs the 36-byte P2PK lock paying recipient. | Cast to dynamic byte[] via byte[](spk) on the next line. |
| int val = tx.inputs[this.activeInputIndex].value; | Reads the sompi balance of the input currently executing this covenant script. | Lowers to OpTxInputIndex (0xb9) + OpTxInputAmount (0xbe). |
| if (change < pledge + minerFee) { | **v1.2 Audit Fix:** If the leftover change after this withdrawal cannot fund another full pledge + minerFee period, drain the remaining balance (val - minerFee) to recipient. | Using < instead of <= ensures a pot funded for exactly 2 \times (\text{pledge} + \text{minerFee}) pays out across two separate periods rather than draining on period 1. |
| require(tx.outputs[1].scriptPubKey == tx.inputs[this.activeInputIndex].scriptPubKey); | Requires output 1 to carry the exact same locking script as the spent input so the subscription pot continues. | **Stateless vs. Stateful Continuation:** Raw scriptPubKey equality works here only because Mecenas has no mutable state fields. Stateful covenants (Section 9) change their P2SH hash on every spend and must use validateOutputState and KIP-20 Covenant IDs. |

## 9. Covenant Declarations (DECL) & Canonical Stateful Contracts
<!-- id: covenant-declarations | world: W3,W4,W5 | difficulty: 3 | prereqs: none | status: unverified -->

### 9.1 Attribute Macro Syntax & Sugar Aliases
<!-- id: covenant-attribute-syntax | world: W4 | difficulty: 3 | prereqs: silverscript-contract-structure | status: unverified -->

Silverscript's #[covenant(...)] declaration macros automate KIP-20 input/output discovery, P2SH state decoding (prev_state / prev_states), and successor template validation (new_state / new_states):

```
#[covenant(
    binding = auth | cov,
    from = X,
    to = Y,
    mode = verification | transition,
    groups = single | multiple,
    termination = disallowed | allowed,
    name = public_entry_identifier,
    delegate_name = public_delegate_identifier
)]
```

Two syntactic sugar aliases simplify common topologies: #[covenant.singleton] expands to #[covenant(binding = auth, from = 1, to = 1)], while #[covenant.fanout(to = Y)] expands to #[covenant(binding = auth, from = 1, to = Y)].

### 9.2 Binding Modes (auth vs. cov)
<!-- id: covenant-binding-modes | world: W4 | difficulty: 3 | prereqs: covenant-attribute-syntax, opcodes-covenant-id | status: unverified -->

| Binding Mode | Lowered KIP-20 Opcodes | Topology Support | Architectural Role & Compiler Constraints |
| --- | --- | --- | --- |
| binding = auth | OpAuthOutputCount (0xcb), OpAuthOutputIdx (0xcc) | 1:1 or 1:N (from **must** equal 1) | Default when from == 1. Input inspects only the outputs it directly authorized; supports groups = multiple in the same transaction. |
| binding = cov | OpCovInputCount (0xd0), OpCovInputIdx (0xd1), OpCovOutputCount (0xd2), OpCovOutputIdx (0xd3) | N:M (from >= 1, to >= 1) | Default when from > 1. Groups all inputs and outputs in the transaction carrying the family's covenant_id; turns the contract into a **leader contract**. |

### 9.3 Complete Compiler Validation Rules for #[covenant]
<!-- id: covenant-validation-rules | world: W4 | difficulty: 4 | prereqs: covenant-binding-modes | status: unverified -->

The Silverscript compiler enforces strict static validation over #[covenant] attributes. Specifying binding = auth with from > 1 is a compile error, while specifying binding = cov with from = 1 is allowed but emits a compiler warning recommending binding = auth. Combining binding = cov with groups = multiple is rejected as a compile error. The termination = allowed attribute is valid exclusively on singleton transitions (from = 1, to = 1, mode = transition) and defaults to disallowed; using termination on any other topology or in verification mode produces a compile error. If binding is omitted, the compiler defaults to auth when from == 1 and cov when from > 1; if mode is omitted, it defaults to verification when the function has no return type and transition when the function declares a return type : (...).

Any contract containing a binding = cov declaration becomes a **leader contract**, requiring all other #[covenant] declarations in that contract to also use binding = cov and resolve to the same delegate_name identifier (where name and delegate_name must be bare identifiers rather than string literals). A contract may declare at most one #[covenant.delegate] function, and declaring a manual entry inside a leader contract is rejected unless explicitly annotated with #[covenant.allow(rule = manual_entrypoint_in_leader_contract)]. Finally, all #[covenant] declarations operate under the **homogeneous template assumption**: every input and output in the covenant group must share the exact same contract template and State layout, whereas heterogeneous multi-contract families (such as KCC20Minter inspecting KCC20) must use explicit templated built-ins (validateOutputStateWithInputTemplate, readInputStateWithTemplate).

### 9.4 Policy Signatures Across Topologies & Modes
<!-- id: covenant-policy-signatures | world: W3,W4 | difficulty: 3 | prereqs: covenant-attribute-syntax | status: unverified -->

| Topology | Mode | Policy Function Signature Shape | Semantics |
| --- | --- | --- | --- |
| **1:1 (singleton)** | verification | function f(State prev_state, State new_state, ...witnessArgs) | Spender supplies new_state; policy validates transition. |
| **1:1 (singleton)** | transition (strict) | function f(State prev_state, ...witnessArgs) : (State) | Policy computes and returns the single next State. |
| **1:1 (singleton)** | transition (termination=allowed) | function f(State prev_state, ...witnessArgs) : (State[]) | Returns [] to terminate the family or [next] to continue. |
| **1:N (fanout)** | verification | function f(State prev_state, State[] new_states, ...witnessArgs) | Spender supplies new_states (\le N); policy validates list. |
| **1:N (fanout)** | transition | function f(State prev_state, ...witnessArgs) : (State[]) | Policy computes and returns State[] (\le N outputs). |
| **N:M (cov)** | verification | function f(State[] prev_states, State[] new_states, ...witnessArgs) | Leader input 0 validates all prev_states (\le N) and new_states (\le M). |
| **N:M (cov)** | transition | function f(State[] prev_states, ...witnessArgs) : (State[]) | Leader input 0 computes and returns State[] (\le M outputs). |

### 9.5 Contract 4: Counter (1:1 Stateful Singleton — World 3)
<!-- id: contract-counter | world: W3 | difficulty: 2 | prereqs: covenant-attribute-syntax | status: unverified -->

Promoted from a curriculum sketch to a canonical SSOT contract, Counter demonstrates a 1:1 stateful singleton in both declarative macro form and lowered validateOutputState form.

```
pragma silverscript ^0.1.0;

contract Counter(int init_count) {
    int count = init_count;

    #[covenant.singleton]
    function bump(State prev_state, State new_state) {
        require(new_state.count == prev_state.count + 1);
    }
}
```

**Equivalent Lowered Manual Entrypoint (What #[covenant.singleton] Generates Under the Hood):**

```
pragma silverscript ^0.1.0;

contract CounterManual(int init_count) {
    int count = init_count;

    entry bump(State new_state) {
        int activeIdx = this.activeInputIndex;
        require(OpInputCovenantId(activeIdx) != 0x0000000000000000000000000000000000000000000000000000000000000000);
        require(OpAuthOutputCount(activeIdx) == 1);
        int outIdx = OpAuthOutputIdx(activeIdx, 0);
        require(new_state.count == count + 1);
        validateOutputState(outIdx, new_state);
    }
}
```

| Code Line (Counter) | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| contract Counter(int init_count) { | Declares Counter with starting parameter init_count. | Constructor parameter initializes the state field. |
| int count = init_count; | Declares a mutable state field count stored on the sticky note inside the P2SH redeem script. | Compiler synthesizes struct State { int count; }. |
| #[covenant.singleton] | Declares a 1:1 transition (binding=auth, from=1, to=1). | Automatically verifies OpAuthOutputCount == 1 and validateOutputState. |
| function bump(State prev_state, State new_state) { | Receives the current state and the spender's proposed next state. | No return type \rightarrow defaults to mode = verification. |
| require(new_state.count == prev_state.count + 1); | Enforces that the counter increments by exactly 1 on every spend. | Using == instead of > prevents skipping numbers. |

### 9.6 Contract 5: SingletonTermination (1:1 Transition with Exit Door — World 3)
<!-- id: contract-singleton-termination | world: W3 | difficulty: 3 | prereqs: contract-counter, covenant-policy-signatures | status: unverified -->

```
pragma silverscript ^0.1.0;

contract SingletonTermination(pubkey owner, int init_count) {
    int count = init_count;

    #[covenant.singleton(mode = transition, termination = allowed)]
    function bump_or_terminate(State prev_state, State[] next_states, sig owner_sig) : (State[]) {
        require(checkSig(owner_sig, owner));
        require(next_states.length <= 1);
        if (next_states.length == 1) {
            require(next_states[0].count == prev_state.count + 1);
        }
        // [] => terminate covenant family (0 authorized outputs)
        // [x] => continue with exactly one successor output
        return(next_states);
    }
}
```

| Code Line | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| #[covenant.singleton(mode = transition, termination = allowed)] | A 1:1 singleton that computes/returns its successor list and is permitted to end the family. | termination = allowed is legal only on from=1, to=1, mode=transition. |
| function bump_or_terminate(State prev_state, State[] next_states, sig owner_sig) : (State[]) { | Returns (State[]); returning [] burns/exits the covenant family, while returning [x] continues with one successor. | When next_states.length == 1, the policy verifies count == prev_state.count + 1 before returning. |

### 9.7 Contract 6: PotSplitter (1:N Fan-Out Covenant — World 4)
<!-- id: contract-pot-splitter | world: W4 | difficulty: 3 | prereqs: covenant-policy-signatures, silverscript-control-flow-loops | status: unverified -->

Promoted to a canonical SSOT contract with an explicit non-negative amount guard (require(new_states[i].amount > 0);) to prevent signed 64-bit integer underflow/negative-value splitting exploits.

```
pragma silverscript ^0.1.0;

contract PotSplitter(int max_outs, int init_amount, byte[32] init_owner) {
    int amount = init_amount;
    byte[32] owner = init_owner;

    #[covenant.fanout(to = max_outs)]
    function split(State prev_state, State[] new_states, sig owner_sig) {
        require(checkSig(owner_sig, pubkey(prev_state.owner)));
        require(new_states.length > 0);
        int total = 0;
        for(i, 0, new_states.length, max_outs) {
            require(new_states[i].amount > 0);
            total = total + new_states[i].amount;
        }
        require(total == prev_state.amount);
    }
}
```

| Code Line | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| #[covenant.fanout(to = max_outs)] | Declares a 1:N fan-out (binding=auth, from=1, to=max_outs). | Compiler enforces OpAuthOutputCount <= max_outs. |
| require(checkSig(owner_sig, pubkey(prev_state.owner))); | Reinterprets the 32-byte owner state field as a pubkey and verifies the owner's signature. | Functional cast pubkey(byte[32]) is zero-cost at runtime. |
| for(i, 0, new_states.length, max_outs) { | Unrolls max_outs guarded iterations to inspect every proposed output piece. | max_outs serves as both the fan-out limit and loop unroll bound. |
| require(new_states[i].amount > 0); | **v1.2 Audit Fix:** Prevents an attacker from passing a negative int piece (e.g., 1000 and -990) to inflate positive outputs while keeping total == prev_state.amount. | Signed 64-bit int balances must always be constrained non-negative. |
| require(total == prev_state.amount); | Enforces strict value conservation across all split pieces. | Using == (never >=) prevents minting tokens out of thin air. |

### 9.8 Contract 7: VaultNM (N:M Leader/Delegate Covenant — World 5)
<!-- id: contract-vault-nm | world: W5 | difficulty: 4 | prereqs: covenant-binding-modes, contract-pot-splitter | status: unverified -->

Audited and patched in v1.2 to verify leader_sig on input 0, enforce homogeneous owner and round invariants across all prev_states[i], and require non-negative new_states[i].amount values.

```
pragma silverscript ^0.1.0;

contract VaultNM(int max_ins, int max_outs, int init_amount, byte[32] init_owner, int init_round) {
    int amount = init_amount;
    byte[32] owner = init_owner;
    int round = init_round;

    #[covenant(binding=cov, from=max_ins, to=max_outs, mode=verification)]
    function conserve_and_bump(State[] prev_states, State[] new_states, sig leader_sig) {
        require(checkSig(leader_sig, pubkey(prev_states[0].owner)));
        require(new_states.length > 0);
        int in_sum = 0;
        for(i, 0, prev_states.length, max_ins) {
            require(prev_states[i].owner == prev_states[0].owner);
            require(prev_states[i].round == prev_states[0].round);
            in_sum = in_sum + prev_states[i].amount;
        }
        int out_sum = 0;
        for(i, 0, new_states.length, max_outs) {
            require(new_states[i].amount >= 0);
            out_sum = out_sum + new_states[i].amount;
            require(new_states[i].owner == prev_states[0].owner);
            require(new_states[i].round == prev_states[0].round + 1);
        }
        require(in_sum >= out_sum);
    }

    #[covenant.delegate]
    function authorizeDelegate(sig owner_sig) {
        require(checkSig(owner_sig, pubkey(owner)));
    }
}
```

| Code Line | Plain-English Translation | Pro / Compiler Note |
| --- | --- | --- |
| #[covenant(binding=cov, from=max_ins, to=max_outs, mode=verification)] | Declares an N:M covenant grouped by covenant_id; covenant input 0 acts as the **leader**. | Lowers to OpCovInputCount/Idx and OpCovOutputCount/Idx. |
| require(checkSig(leader_sig, pubkey(prev_states[0].owner))); | **v1.2 Audit Fix:** Authenticates the leader input (input 0) using leader_sig so a 1-input spend cannot bypass signature verification. | Delegates only run on non-leader inputs (i > 0); the leader must verify its own signature. |
| require(prev_states[i].owner == prev_states[0].owner); | **v1.2 Audit Fix:** Verifies that every merged input belongs to the same owner and sits at the same round counter. | Prevents co-spending mismatched or stale covenant branches under the same covenant_id. |
| require(new_states[i].amount >= 0); | **v1.2 Audit Fix:** Prevents negative output amounts from gaming in_sum >= out_sum. | Essential whenever summing signed int fields. |
| #[covenant.delegate] | Defines the lightweight **delegate** hook executed by every non-leader covenant input (i > 0). | Generated delegate wrapper enforces leader_index < current_input_index to prevent delegation cycles and authenticates that input 0 shares the same template, plus checks authorizeDelegate locally. |

## 10. ABI, Codec & Concrete Byte-Encoding Mechanics
<!-- id: abi-codec-encoding | world: W3 | difficulty: 3 | prereqs: none | status: unverified -->

### 10.1 Script Layout & Template Hash (KCC-0001)
<!-- id: script-layout-template-hash | world: W3 | difficulty: 3 | prereqs: p2sh-state-covenant-lifecycle | status: unverified -->

When the Silverscript compiler lowers a stateful contract, it partitions the P2SH redeem script into three contiguous byte regions:

\text{RedeemScript} = \text{template\_prefix} \;\|\; \text{runtime\_state} \;\|\; \text{template\_suffix}

In the compiled artifact, state_span.offset records the exact byte offset where runtime_state begins (len(template_prefix)), and state_span.len records the byte length of runtime_state. To authenticate that a foreign or successor UTXO runs the exact same invariant contract code regardless of its current runtime_state, Silverscript computes the 32-byte **template_hash** using unkeyed **BLAKE3**, where both prefix and suffix lengths are encoded as **8-byte signed-magnitude script numbers** (TEMPLATE_PART_LENGTH_BYTES = 8):

\text{template\_hash} = \text{BLAKE3}\Big(\text{serialize\_script\_i64}(\text{len}(\text{prefix}), 8) \;\|\; \text{prefix} \;\|\; \text{serialize\_script\_i64}(\text{len}(\text{suffix}), 8) \;\|\; \text{suffix}\Big)

### 10.2 KCC-01 Entrypoint Dispatch Tags & Signature Script Format
<!-- id: kcc01-dispatch-tags | world: unmapped | difficulty: 3 | prereqs: silverscript-contract-structure | status: unverified -->

Every contract with multiple entrypoints (or covenant/delegate entrypoints) uses the KCC-01 4-byte dispatch selector technique:

\text{tag} = \text{BLAKE3}\big(\text{"entryName(type1,type2,...)"}\big)[0..4]

When spending a P2SH covenant input, the input's signature_script (maximum length **250,000 bytes**) pushes the entrypoint arguments followed by the 4-byte dispatch tag and the P2SH redeem script preimage:

\text{signature\_script} = [\text{arg}_1]\;[\text{arg}_2]\;\dots\;[\text{arg}_n]\;[\text{4-byte dispatch tag}]\;[\text{redeem\_script\_preimage}]

### 10.3 State Encoding Rules & Concrete Byte Walkthroughs
<!-- id: state-encoding-byte-walkthroughs | world: unmapped | difficulty: 3 | prereqs: script-layout-template-hash | status: unverified -->

All fields in a contract's State struct are serialized contiguously inside runtime_state according to deterministic fixed/variable rules. For example, a KCC20 token UTXO stores four state fields: byte[32] ownerIdentifier at bytes [0..32], byte identifierType at byte [32..33], int amount at bytes [33..41] (such as 1000 encoded in 8-byte signed-magnitude as e8 03 00 00 00 00 00 00), and bool isMinter at byte [41..42], yielding a fixed runtime_state span of exactly 32 + 1 + 8 + 1 = 42\text{ bytes}.

| Silverscript Type | Byte Length | Encoding Specification | Concrete Worked Hex Example |
| --- | --- | --- | --- |
| int / temporal | 8\text{ bytes} | **8-byte little-endian signed-magnitude** (sign bit in MSB 0x80 of the 8th byte) | +42 \rightarrow 2a 00 00 00 00 00 00 00 -5 \rightarrow 05 00 00 00 00 00 00 80 0 \rightarrow 00 00 00 00 00 00 00 00 |
| bool | 1\text{ byte} | 0x00 for false, 0x01 for true | true \rightarrow 01; false \rightarrow 00 |
| byte | 1\text{ byte} | Raw single byte | 0x02 (covenant ID owner type) \rightarrow 02 |
| pubkey / byte[32] | 32\text{ bytes} | Raw 32-byte sequence | 0xaa \* 32 \rightarrow 32 bytes of aa |
| sig | 65\text{ bytes} | 64-byte Schnorr sig + 1-byte sighash flag | 65 raw bytes |
| datasig | 64\text{ bytes} | 64-byte raw signature | 64 raw bytes |
| ScriptPubKeyP2PK | 36\text{ bytes} | le_u16(version=0) (00 00) + u64_len / push 0x20 + 32B pk + OpCheckSig (ac) | 36-byte serialized SPK compared against tx.outputs[i].scriptPubKey |
| ScriptPubKeyP2SH | 37\text{ bytes} | le_u16(version=0) (00 00) + script len + OpBlake2b (aa) + push 0x20 + 32B hash + OpEqual (87) | 37-byte serialized P2SH locking script |

### 10.4 Compiler ABI Artifact Structure (SilAbiArtifact)
<!-- id: abi-artifact-structure | world: unmapped | difficulty: 3 | prereqs: script-layout-template-hash | status: unverified -->

```
SilAbiArtifact {
    schema_version: u32,                            // Currently 1
    compiler_version: String,                       // e.g., "0.1.0"
    structs: BTreeMap<String, StructArtifact>,      // Includes synthesized `State`
    contracts: BTreeMap<String, SilContractArtifact>, // Template spans, hash, entry selectors
}
```

