## 8. Silverscript Language Reference
<!-- id: silverscript-reference | world: W2,W3,W6 | difficulty: 2 | prereqs: none | status: unverified -->

### 8.1 Contract Structure: Constructor Constants vs. Mutable State Synthesis
<!-- id: silverscript-contract-structure | world: W2,W3 | difficulty: 2 | prereqs: p2sh-state-covenant-lifecycle | status: unverified -->

A Silverscript program is defined inside a contract block preceded by a version pragma (pragma silverscript ^0.1.0;). Understanding how the compiler partitions contract variables between **immutable template bytes** and **mutable runtime state** is fundamental to reading and writing covenants:

```
pragma silverscript ^0.1.0;

contract CounterExample(int stepSize, pubkey adminPk) {
    // 1. Compile-time constant: folded directly into template opcodes
    int constant MIN_COUNT = 0;

    // 2. Mutable state field: initialized from a constructor param or literal,
    //    extracted into the middle [runtime_state] slice and bundled into `State`
    int count = 0;

    // 3. Raw entrypoint: callable directly via 4-byte KCC-01 dispatch tag
    entry adminReset(sig adminSig) {
        require(checkSig(adminSig, adminPk));
        validateOutputState(0, State { count: MIN_COUNT });
    }

    // 4. Declarative covenant policy: compiler synthesizes the entrypoint wrapper
    #[covenant.singleton]
    function increment(State prev_state, State new_state) {
        require(new_state.count == prev_state.count + stepSize);
    }
}

```

In this structure, **Constructor Parameters (contract Name(T1 p1, T2 p2))** are fixed when the contract template is instantiated; unless assigned to a contract-body state variable, they remain immutable and are baked directly into template_prefix or template_suffix. Conversely, **Mutable State Fields (T fieldName = initExpr;)** declared inside the contract body (without the constant keyword) form the contract's mutable sticky-note state. The compiler automatically synthesizes an implicit struct named **State** containing all mutable state fields in declaration order (e.g., struct State { int count; }) and encodes those fields into the middle [runtime_state] span of the P2SH redeem script.

Silverscript also distinguishes between **entry** and **function** declarations. An entry name(args...) { ... } block declares a direct spending entrypoint that a spender selects by appending its 4-byte KCC-01 dispatch tag to the signature script. By contrast, function name(args...) [: (ReturnType)] { ... } is used with #[covenant(...)] and #[covenant.delegate] attribute macros. Covenant policy and delegate functions are compiler-invoked hooks that cannot be called directly from Silverscript source code; instead, the compiler wraps them in generated entrypoint boilerplate that performs input/output enumeration, state deserialization, and template verification.

### 8.2 Data Types
<!-- id: silverscript-data-types | world: W2 | difficulty: 2 | prereqs: silverscript-contract-structure | status: unverified -->

| Silverscript Type | Underlying Size & Encoding | Literal / Usage Example | Semantic Notes & Constraints |
| --- | --- | --- | --- |
| int | 64-bit signed integer (8-byte signed-magnitude in state) | 42, -100, 1000 | Arithmetic aborts on 64-bit overflow or divide-by-zero. |
| temporal | 64-bit signed time value in milliseconds | 30 seconds, timeout | Same operators/representation as int, but strictly distinct type. |
| bool | 1-byte boolean (0x00 or 0x01) | true, false | Used in if conditions, require, and state flags. |
| byte | Single raw byte (1 byte) | 0xff, 0x00 | Cannot be used directly in arithmetic without signed(b) / unsigned(b). |
| byte[N] | Fixed-size byte array (N\text{ bytes}) | byte[32], byte[36] | Used for hashes (byte[32]), P2PK SPKs (byte[36]), P2SH SPKs (byte[37]). |
| byte[] | Dynamic-length byte array | byte[](spk) | Standard dynamic byte slice type (replaces legacy bytes alias). |
| pubkey | 32-byte Schnorr public key | pubkey pk | 32-byte x-only public key; ECDSA uses byte[33] compressed keys. |
| sig | 65-byte transaction signature | sig s | 64-byte signature + 1-byte sighash type flag. |
| datasig | 64-byte raw message signature | datasig ds | Used with checkMsgSig and checkMsgSigEcdsa (no sighash byte). |
| string | UTF-8 character sequence | "x must be positive" | Used for require error diagnostics and metadata. |
| T[N] / T[] | Fixed-size or dynamic typed array | int[4], State[] | Used for covenant state arrays (prev_states, new_states) and loops. |

### 8.3 Control Flow & Compile-Time Unrolled Loops
<!-- id: silverscript-control-flow-loops | world: W2 | difficulty: 3 | prereqs: silverscript-data-types | status: unverified -->

Silverscript provides if (...) { ... } else if (...) { ... } else { ... } branching, require(condition[, "message"]); assertions, and bounded for loops:

```
for(i, start, end, MAX_ITERATIONS) {
    // Loop body executed while i < end
}
```

In a Silverscript for loop, the loop variable i increments from start up to end - 1 (start inclusive, end exclusive), performing zero iterations whenever start >= end. Because Kaspa Script has no backward jumps, the compiler **unrolls the loop at compile time**, emitting exactly MAX_ITERATIONS guarded copies of the loop body (if (i < end) { ... }), where MAX_ITERATIONS must be a compile-time constant or constructor parameter. The runtime range must satisfy end - start <= MAX_ITERATIONS, and if a constant range provably exceeds MAX_ITERATIONS, compilation fails immediately. Although the compiler currently emits a runtime check asserting end - start <= MAX_ITERATIONS before entering the loop, this assertion is a transient compiler behavior that may be removed in future releases. Consequently, in handwritten entry functions, developers must validate dynamic array lengths explicitly (require(arr.length <= MAX_ITERATIONS);), whereas in #[covenant(from = X, to = Y)] declarations, the compiler's generated wrapper automatically enforces prev_states.length <= X and new_states.length <= Y.

### 8.4 Time Locks (tx.daa, tx.time, this.ageDaa)
<!-- id: silverscript-time-locks | world: W2 | difficulty: 3 | prereqs: silverscript-data-types, tx-v1-schema | status: unverified -->

| Silverscript Expression | Expected Type | Lock Mechanism | Valid Domain & Consensus Threshold Rules |
| --- | --- | --- | --- |
| tx.daa >= N | int | Absolute DAA-score lock (CLTV) | 0 \le N < 500,000,000,000 (LOCK_TIME_THRESHOLD). |
| tx.time >= T | temporal | Absolute ms timestamp lock (CLTV) | T \ge 500,000,000,000 (1985-11-05T00:53:20Z in Unix ms). |
| this.ageDaa >= N | int | Relative UTXO DAA-age lock (CSV) | 0 \le N < 2^{32} (4,294,967,296 DAA units). |

Known out-of-domain constants (such as tx.daa >= 600000000000 or negative values) are rejected at compile time; dynamic thresholds are verified by compiler-emitted script guards before CLTV/CSV executes. Plain int values never implicitly convert to temporal, preventing accidental clock-domain confusion.

### 8.5 Built-in Functions & Unified Type-Casting Rules
<!-- id: silverscript-builtins-casting | world: W2,W3,W6 | difficulty: 3 | prereqs: silverscript-data-types | status: unverified -->

#### Cryptographic, Proof & Sequencing Built-ins
<!-- id: builtins-crypto-proof-seq | world: W2,W3,W6 | difficulty: 3 | prereqs: silverscript-data-types | status: unverified -->

| Silverscript Function Signature | Lowered Opcode(s) | Description & Failure Behavior |
| :--- | :--- | :--- |
| `blake2b(byte[] data) -> byte[32]` | `OpBlake2b` (`0xaa`) | Unkeyed 32-byte BLAKE2b-256 digest. |
| `blake2bWithKey(byte[] data, byte[] key) -> byte[32]` | `OpBlake2bWithKey` (`0xa7`) | Keyed BLAKE2b-256 digest (`key.length <= 64`). |
| `blake3(byte[] data) -> byte[32]` | `OpBlake3` (`0xd9`) | Unkeyed 32-byte BLAKE3 digest. |
| `blake3WithKey(byte[] data, byte[32] key) -> byte[32]` | `OpBlake3WithKey` (`0xda`) | Keyed 32-byte BLAKE3 digest. |
| `sha256(byte[] data) -> byte[32]` | `OpSha256` (`0xa8`) | Standard 32-byte SHA-256 digest. |
| `checkSig(sig s, pubkey pk) -> bool` | `OpCheckSig` (`0xac`) | Verifies Schnorr signature over current transaction `sighash`. |
| `checkSigEcdsa(sig s, byte[33] pk) -> bool` | `OpCheckSigECDSA` (`0xab`) | Verifies ECDSA signature over current transaction `sighash`. |
| `checkMsgSig(datasig s, byte[32] msg, pubkey pk) -> bool` | `OpCheckSigFromStack` (`0xd7`) | Verifies 64-byte Schnorr signature against arbitrary 32-byte digest. |
| `checkMsgSigEcdsa(datasig s, byte[32] msg, byte[33] pk) -> bool` | `OpCheckSigFromStackECDSA` (`0xd8`) | Verifies 64-byte ECDSA signature against arbitrary 32-byte digest. |
| `g16.verify(byte[] verifyingKey, byte[] proof, byte[32] ...publicInputs)` | `OpZkPrecompile` (`0xa6`, tag `0x20`) | Verifies Groth16 proof; **aborts script execution immediately on failure** (RISC Zero Succinct STARKs use `OpZkPrecompile` `0xa6` with tag `0x21` directly). |
| `OpChainblockSeqCommit(byte[32] blockHash) -> byte[32]` | `OpChainblockSeqCommit` (`0xd4`) | Returns 32-byte KIP-21 `SeqCommit` for ancestor chain block `blockHash`. |

#### ScriptPubKey Construction & State Transition Built-ins
<!-- id: builtins-spk-state-transition | world: W2,W3,W6 | difficulty: 4 | prereqs: silverscript-contract-structure | status: unverified -->

| Silverscript Function Signature | Return / Effect | Purpose & Lowered Verification Mechanism |
| :--- | :--- | :--- |
| `new ScriptPubKeyP2PK(pubkey pk)` | `byte[36]` | Builds a 36-byte serialized P2PK locking script (`version=0` + `0x20` + 32B `pk` + `OpCheckSig`). |
| `new ScriptPubKeyP2SH(byte[32] scriptHash)` | `byte[37]` | Builds a 37-byte serialized P2SH locking script from a 32-byte BLAKE2b script hash. |
| `new ScriptPubKeyP2SHFromRedeemScript(byte[] script)` | `byte[37]` | Hashes `script` with BLAKE2b and builds a 37-byte P2SH `scriptPubKey`. |
| `validateOutputState(int outputIndex, object newState)` | `void` (aborts on fail) | Reconstructs `[this.prefix][encode(newState)][this.suffix]` (e.g. `State { count: 0 }`) and requires `tx.outputs[outputIndex].scriptPubKey` to match its P2SH lock. |
| `validateOutputStateWithTemplate(int outputIndex, object newState, byte[] templatePrefix, byte[] templateSuffix, byte[32] expectedTemplateHash)` | `void` (aborts on fail) | Authenticates `BLAKE3(len(prefix) \|\| prefix \|\| len(suffix) \|\| suffix) == expectedTemplateHash` and verifies `tx.outputs[outputIndex]` carries `[prefix][encode(newState)][suffix]`. |
| `validateOutputStateWithInputTemplate(int outputIndex, object newState, int templateInputIndex, int templatePrefixLen, int templateSuffixLen, byte[32] expectedTemplateHash)` | `void` (aborts on fail) | Extracts `prefix` (`templatePrefixLen` bytes) and `suffix` (`templateSuffixLen` bytes) from co-spent input `templateInputIndex`'s redeem script, authenticates against `expectedTemplateHash`, and validates output `outputIndex`. |
| `readInputState(int inputIndex) -> State` | `State` | Verifies input `inputIndex` shares the current contract's template and decodes its `[runtime_state]` slice into `State`. |
| `readInputStateWithTemplate(int inputIndex, int templatePrefixLen, int templateSuffixLen, byte[32] expectedTemplateHash) -> object` | `object` / `ForeignState` | Authenticates input `inputIndex`'s template prefix/suffix against `expectedTemplateHash` and decodes its middle state slice. |

#### Unified Type-Casting Reference (`Type(expr)` vs. `expr as Type`)
<!-- id: type-casting-reference | world: W2,W3,W6 | difficulty: 3 | prereqs: silverscript-data-types | status: unverified -->

Silverscript supports two distinct conversion forms: **functional casts (`TargetType(expr)`)**, which reinterpret compatible underlying representations or decode byte arrays, and **`as` conversion operators (`expr as TargetType`)**, which emit explicit numeric/byte formatting opcodes.

| Conversion Syntax | Source $\rightarrow$ Target | Runtime Opcode Emitted | Safety & Validation Rules |
| :--- | :--- | :--- | :--- |
| `temporal(intExpr)` / `int(tempExpr)` | `int` $\leftrightarrow$ `temporal` | **None** (compile-time only) | Zero-cost compile-time type label change between numeric domains. |
| `byte[](fixedBytesOrPk)` | `byte[N]` / `pubkey` $\rightarrow$ `byte[]` | **None** (compile-time only) | Widens fixed-size byte array (`byte[36]`, `pubkey`) to dynamic `byte[]`. |
| `byte[N](dynamicBytes)` | `byte[]` $\rightarrow$ `byte[N]` | **None** (unchecked assertion) | **Unchecked cast:** Always precede with `require(dynamicBytes.length == N);`. |
| `pubkey(byte32Expr)` | `byte[32]` $\rightarrow$ `pubkey` | **None** (compile-time only) | Reinterprets a 32-byte array (e.g., `prev_state.owner`) as a Schnorr `pubkey`. |
| `sig(byte65Expr)` | `byte[65]` $\rightarrow$ `sig` | **None** (compile-time only) | Reinterprets a 65-byte fixed array as a transaction signature `sig`. |
| `intExpr as byte[N]` | `int` $\rightarrow$ `byte[N]` ($1 \le N \le 8$) | `OpNum2Bin(intExpr, N)` (`0xcd`) | Encodes integer as $N$-byte signed-magnitude array; fails if value overflows $N$ bytes. |
| `int(byteNExpr)` | `byte[N]` ($1 \le N \le 8$) $\rightarrow$ `int` | `OpBin2Num(byteNExpr)` (`0xce`) | Decodes signed-magnitude byte array ($\le 8$ bytes) into minimal script `int`. |
| `boolExpr as int` | `bool` $\rightarrow$ `int` | **None** (`true`=1, `false`=0) | Converts boolean value to integer `1` or `0`. |
| `signed(byteExpr)` / `unsigned(byteExpr)` | `byte` $\rightarrow$ `int` | `OpBin2Num` / `0x00` pad + `OpBin2Num` | Required before using a scalar `byte` with arithmetic operators. |

### 8.6 Complete KIP-17 Transaction Introspection Mapping
<!-- id: silverscript-introspection-mapping | world: W2 | difficulty: 3 | prereqs: opcodes-input-output, silverscript-data-types | status: unverified -->

Silverscript exposes everyday transaction, input, and output fields as high-level dot-properties (`tx.*` and `this.*`), while specialized KIP-17 and KIP-20 introspection opcodes are invoked directly as built-in opcode functions:

| Silverscript Expression / Built-in | Return Type | Kind | Lowered KIP-17 / KIP-20 Opcode |
| :--- | :---: | :---: | :--- |
| `tx.version` | `int` | Dot-property | `OpTxVersion` (`0xb2`) |
| `tx.daa >= N` / `tx.time >= T` | `bool` | Lock expression | `OpTxLockTime` (`0xb5`) + CLTV checks |
| `this.ageDaa >= N` | `bool` | Lock expression | `OpTxInputSeq` (`0xbd`) + CSV checks |
| `this.activeInputIndex` | `int` | Dot-property | `OpTxInputIndex` (`0xb9`) |
| `this.activeScriptPubKey` | `byte[]` | Dot-property | `OpTxInputIndex` (`0xb9`) + `OpTxInputSpk` (`0xbf`) |
| `tx.inputs.length` | `int` | Dot-property | `OpTxInputCount` (`0xb3`) |
| `tx.inputs[i].value` | `int` | Dot-property | `OpTxInputAmount` (`0xbe`) |
| `tx.inputs[i].scriptPubKey` | `byte[]` | Dot-property | `OpTxInputSpk` (`0xbf`) |
| `tx.inputs[i].outpointTxId` | `byte[32]` | Dot-property | `OpOutpointTxId` (`0xba`) |
| `tx.inputs[i].outpointIndex` | `int` | Dot-property | `OpOutpointIndex` (`0xbb`) |
| `tx.outputs.length` | `int` | Dot-property | `OpTxOutputCount` (`0xb4`) |
| `tx.outputs[i].value` | `int` | Dot-property | `OpTxOutputAmount` (`0xc2`) |
| `tx.outputs[i].scriptPubKey` | `byte[]` | Dot-property | `OpTxOutputSpk` (`0xc3`) |
| `OpTxSubnetId()` | `byte[20]` | Opcode built-in | `OpTxSubnetId` (`0xb6`) |
| `OpTxGas()` | `int` | Opcode built-in | `OpTxGas` (`0xb7`) |
| `OpTxPayloadLen()` | `int` | Opcode built-in | `OpTxPayloadLen` (`0xc4`) |
| `OpTxPayloadSubstr(start, end)` | `byte[]` | Opcode built-in | `OpTxPayloadSubstr` (`0xb8`) |
| `OpTxInputDaaScore(i)` | `int` | Opcode built-in | `OpTxInputDaaScore` (`0xc0`) |
| `OpTxInputIsCoinbase(i)` | `bool` | Opcode built-in | `OpTxInputIsCoinbase` (`0xc1`) |

