## 16. Addresses & Networks
<!-- id: addr-networks-module | world: W1 | difficulty: 2 | prereqs: utxo-anatomy-sompi, p2sh-state-covenant-lifecycle | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

The existing SSOT talks about `script_public_key` bytes (§0.2, §8.5, §10.3) but never explains the **address** string that wallets and explorers show instead. This module fills that gap. In the envelope model (§0.4), the address is the *label you read off the outside flap* of an envelope; the `script_public_key` is what consensus actually stores. Everything here was checked against the `kaspa-addresses` crate in `rusty-kaspa`; where this module goes beyond that crate it says so.

### 16.1 Anatomy of an Address
<!-- id: addr-anatomy | world: W1 | difficulty: 1 | prereqs: utxo-anatomy-sompi | status: mainnet | source: https://kaspa.aspectron.org/wallets/primitives/addresses.html -->

A Kaspa address is a text string with three logical parts:

| Part | Example (mainnet, all-zero test key) | Meaning |
| --- | --- | --- |
| **Network prefix** | `kaspa` | Names the network the address belongs to (§16.5). |
| **Separator** | `:` | A single colon. An address with no colon is rejected as "missing prefix". |
| **Encoded body** | `qqqq…qkx9awp4e` | A base-32 string made of the *payload* (version byte plus key or hash) followed by an `8-character checksum`. |

The body is **not** the raw public key. It is the *version byte* followed by the *payload*, repacked into 5-bit groups and written with a 32-character alphabet (§16.3), then followed by a checksum that also covers the network prefix. Two consequences follow directly:

- The same key on two networks yields two different strings, and a string copied onto the wrong network fails the checksum.
- The string carries **no** amount, no Covenant ID, no state, and no hint of which testnet it belongs to (§16.5).

<!-- id: addr-term-payload | world: W1 | difficulty: 1 | prereqs: addr-anatomy | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->
**Payload** = the bytes after the version byte: a 32-byte x-only Schnorr public key, a 33-byte compressed ECDSA public key, or a 32-byte script hash, depending on the version (§16.2).

### 16.2 Address Versions: Schnorr, ECDSA and P2SH
<!-- id: addr-version-bytes | world: W1 | difficulty: 2 | prereqs: addr-anatomy, silverscript-data-types, silverscript-builtins-casting | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

The first byte inside the encoded body is the **version byte**. Only three values exist; anything else is rejected with an "invalid version" error.

| Rust enum (`kaspa-addresses`) | Version byte | Payload | Payload length | Spends with | Silverscript counterpart |
| --- | :---: | --- | :---: | --- | --- |
| `PubKey = 0` | `0x00` | x-only Schnorr public key | 32 bytes | `OpCheckSig` (`0xac`) | `pubkey`, `checkSig(sig, pk)` (§8.2, §8.5) |
| `PubKeyECDSA = 1` | `0x01` | compressed ECDSA public key | 33 bytes | `OpCheckSigECDSA` (`0xab`) | `byte[33]`, `checkSigEcdsa(sig, pk)` |
| `ScriptHash = 8` | `0x08` | BLAKE2b-256 hash of a redeem script | 32 bytes | P2SH reveal (§2.3) | `new ScriptPubKeyP2SH(byte[32])` |

Version `8` (not `2`) is the P2SH value. That value is why mainnet P2SH addresses start with `kaspa:p` while Schnorr and ECDSA addresses start with `kaspa:q` (the first 5-bit group of version `8` is `00001`, which is the letter `p` in the alphabet; versions `0` and `1` both begin with `00000`, the letter `q`).

<!-- id: addr-term-version-byte | world: W1 | difficulty: 1 | prereqs: addr-version-bytes | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->
**Version byte** = the first byte of the address body; it selects the payload type and therefore the locking-script template the address stands for.

Two points matter for covenant work:

1. **Every covenant UTXO is paid to a `ScriptHash = 8` address**, because stateful covenants are P2SH outputs whose hash commits to `[template_prefix][runtime_state][template_suffix]` (§2.3, §10.1). Because `state_1 != state_0` changes that hash, the address of a stateful covenant output *changes on every spend*. The stable identity is the Covenant ID (§5.1), which is **not** part of the address.
2. A `PubKey = 0` address contains the public key itself, not a hash of it. Anyone holding the address already knows the key; this differs from hash-based addresses in some other chains (§16.11).

### 16.3 How the Address String Is Built
<!-- id: addr-encoding-algorithm | world: W1 | difficulty: 3 | prereqs: addr-version-bytes, utxo-anatomy-sompi | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

The encoding is a `bech32`-style scheme (the `kaspa-addresses` crate describes it as a "`bech32`-encoded" string), with a Kaspa-specific separator and checksum length:

1. Build the byte string `[version][payload]`.
2. Regroup its bits into 5-bit values, padding the last group with zero bits.
3. Compute a **40-bit BCH checksum** over: the low 5 bits of each prefix character, one zero value (the separator slot), the 5-bit data values, and eight zero values.
4. Append the checksum as eight 5-bit values.
5. Map every 5-bit value to the alphabet `qpzry9x8gf2tvdw0s3jn54khce6mua7l` and write `prefix`, `:`, then the characters.

A reference implementation, with the published `rusty-kaspa` test vectors as assertions, is in `code/kaspa_address_encode.py`. The checksum generator constants in that file were *not* read from the crate's `bech32` module; they are confirmed by the fact that the script reproduces all five published test addresses exactly.

Length of a full address string (computed from the rule above and confirmed by the reference script):

| Address kind | Body groups (payload) | + checksum | + prefix and `:` | Total length |
| --- | :---: | :---: | :---: | :---: |
| Mainnet `PubKey = 0` | 53 | 8 | 6 | `67` |
| Mainnet `ScriptHash = 8` | 53 | 8 | 6 | `67` |
| Mainnet `PubKeyECDSA = 1` | 55 | 8 | 6 | `69` |
| Testnet `PubKeyECDSA = 1` | 55 | 8 | 10 | `73` |

The payload group count is $\lceil 8 \times (1 + \text{payload\_len}) / 5 \rceil$: for 32-byte payloads, $\lceil 264/5 \rceil = 53$; for the 33-byte ECDSA payload, $\lceil 272/5 \rceil = 55$.

### 16.4 Worked Example: Reading a Test-Vector Address
<!-- id: addr-worked-decode | world: W1 | difficulty: 2 | prereqs: addr-encoding-algorithm | status: pedagogical | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

<!-- id: addr-example-zero-key | world: W1 | difficulty: 2 | prereqs: addr-encoding-algorithm | status: pedagogical | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->
**Example (test vector, not a usable wallet).** The `rusty-kaspa` unit tests encode the 32-byte all-zero key as a mainnet `PubKey = 0` address:

`kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e`

| Step | Result |
| --- | --- |
| Split at `:` | prefix `kaspa`; body of 61 characters |
| First 53 characters | all `q`, which is the 5-bit value `00000` repeated; 53 × 5 = 265 bits, of which the first 264 are `[0x00][32 × 0x00]` and the last bit is padding |
| Version byte | first 8 bits `00000000` → `0` → `PubKey = 0` |
| Payload | 32 zero bytes |
| Last 8 characters | `kx9awp4e`, the checksum |
| Verification | the BCH check over prefix, separator slot, data and checksum must evaluate to zero |

The same key under the testnet prefix is `kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhqrxplya`: the 53 payload characters are identical and only the checksum (`hqrxplya` instead of `kx9awp4e`) differs, because the prefix feeds the checksum.

<!-- id: addr-example-p2sh-zero | world: W1 | difficulty: 2 | prereqs: addr-version-bytes | status: pedagogical | source: unverified -->
**Example (computed by `code/kaspa_address_encode.py`, not an official vector).** A mainnet `ScriptHash = 8` address over an all-zero 32-byte hash is `kaspa:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqlmtfk4dg`. It starts with `p` because of version `8`. It is a format illustration; a real covenant address is the hash of a real redeem script.

### 16.5 Network Prefixes
<!-- id: addr-network-prefixes | world: W1 | difficulty: 1 | prereqs: addr-anatomy | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

| Network type | Prefix | `kaspad` selection | Notes |
| --- | --- | --- | --- |
| Mainnet | `kaspa` | default | Real value; Toccata activated here on June 30, 2026 (§1.1). |
| Testnet | `kaspatest` | `--testnet` (default suffix `10`), or `--testnet --netsuffix=<id>` | **One** prefix for *all* testnets: an address cannot tell you whether it is for testnet-10 or testnet-11. |
| Simnet | `kaspasim` | `--simnet` | Local simulation network. |
| Devnet | `kaspadev` | `--devnet` | Local development network. |

<!-- id: addr-term-network-prefix | world: W1 | difficulty: 1 | prereqs: addr-network-prefixes | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->
**Network prefix** = the leading text before the colon (`kaspa`, `kaspatest`, `kaspasim`, `kaspadev`). It is a checksum input, so a testnet address pasted into a mainnet wallet is rejected.

<!-- id: addr-term-testnet-suffix | world: W1 | difficulty: 2 | prereqs: addr-network-prefixes | status: testnet | source: https://kaspa.org/?p=52928 -->
**Testnet suffix** = the number that distinguishes parallel testnets (`10`, `11`, …). It selects a network inside `kaspad` (`--netsuffix`), but it is *not* encoded in addresses.

The `--simnet` and `--devnet` flag spellings are inferred from the `match (testnet, devnet, simnet)` structure visible in the `kaspad` argument source and are marked `unverified` in `REPORT-coverage.md`.

### 16.6 Network Endpoints (Ports)
<!-- id: addr-network-endpoints | world: W1 | difficulty: 2 | prereqs: addr-network-prefixes | status: testnet | source: https://kaspa.aspectron.org/rpc/ports.html -->

A node exposes several interfaces. Defaults documented for `kaspad`:

| Interface | Mainnet default | Testnet default | Flag |
| --- | :---: | :---: | --- |
| P2P (consensus) | `16111` | `16211` | `--listen` |
| gRPC | `16110` | `16210` | `--rpclisten` |
| wRPC (Borsh) | `17110` | `17210` | `--rpclisten-borsh` |
| wRPC (JSON) | `18110` | `18210` | `--rpclisten-json` |

When two testnet nodes share a machine, the customary gRPC ports are `16210` for Testnet-10 and `16310` for Testnet-11; simnet's default gRPC port is `16510`. These are conventions of the documentation, not part of consensus. Ports for devnet are not documented in the sources consulted (`unverified`).

### 16.7 From Address to `script_public_key`
<!-- id: addr-to-spk | world: W1 | difficulty: 3 | prereqs: addr-version-bytes, silverscript-builtins-casting, state-encoding-byte-walkthroughs | status: mainnet | source: https://docs.rs/kascov-decode -->

Consensus never stores an address. A UTXO stores a `script_public_key` (§0.2): a `u16` version plus script bytes. Wallets convert between the two.

| Address version | Script bytes inside the `script_public_key` | Serialized length (2-byte version + script) | Support |
| --- | --- | :---: | --- |
| `PubKey = 0` | `0x20` ‖ 32-byte key ‖ `0xac` | 36 bytes | SSOT §8.5 (`ScriptPubKeyP2PK`) |
| `ScriptHash = 8` | `0xaa` ‖ `0x20` ‖ 32-byte hash ‖ `0x87` | 37 bytes | SSOT §8.5/§10.3 and `kascov-decode` |
| `PubKeyECDSA = 1` | `0x21` ‖ 33-byte key ‖ `0xab` | 37 bytes | derived by analogy; `unverified` |

In every row the script version is `0`, written `00 00`. Counting bytes in the P2SH row shows why the SSOT says 37: $2 + (1 + 1 + 32 + 1) = 37$. The §10.3 P2SH row also lists "script len" among the parts; that length prefix is not part of the 37-byte total (see `REPORT-coverage.md`, "Possible SSOT issues").

Direction matters: any of these three standard scripts maps back to exactly one address, but an arbitrary script has **no address** unless it is wrapped in P2SH. This is why a covenant's logic never shows up in an address: the address only commits to the script's hash.

### 16.8 Why Covenants Make Addresses Awkward
<!-- id: addr-covenant-implications | world: W3 | difficulty: 3 | prereqs: addr-to-spk, p2sh-state-covenant-lifecycle, covenant-id-lineage | status: mainnet | source: https://docs.kaspa.org/toccata/covenant-state -->

Three practical effects, all following from §2.3 and §5.1:

- **Moving address.** A stateful covenant's P2SH hash changes whenever its state changes, so the address of the *current* cell changes after each spend. Never treat a covenant address as a permanent account number.
- **Stable name = Covenant ID.** To follow a family across spends, indexers track the 32-byte `covenant_id` and every live UTXO carrying it (see the indexer list in the official Covenant State guide); the address alone is insufficient.
- **Hidden state.** The address reveals only the hash. The redeem script preimage (and therefore the state) becomes visible when the UTXO is spent, or when the creator publishes the preimage. A decoder such as `kascov-decode` works from that revealed signature-script push.

### 16.9 Public vs. Private
<!-- id: addr-public-private | world: W1 | difficulty: 1 | prereqs: addr-anatomy | status: pedagogical | source: https://docs.kaspa.org/toccata/covenant-state -->

| Item | Public? | Where it appears |
| --- | --- | --- |
| Address string | Public by design | Wallets, explorers, QR codes |
| Public key (Schnorr/ECDSA) | Public; for `PubKey = 0` it *is* the payload | Inside the address and the output's script |
| `script_public_key` | Public | In every UTXO and transaction output |
| Redeem script preimage (template + state) | Hidden until the output is spent or the preimage is published | `signature_script` of the spending input |
| Signature | Public once the transaction exists | `signature_script` |
| Private key / seed phrase | **Never public** | Only on the signer's device; it never appears in any transaction field |
| Amount of an unspent output | Public | `UtxoEntry.amount` |

"Hidden until spent" describes *where the bytes are published*, not a secrecy guarantee: if the possible states are few, anyone can enumerate and hash candidates to match the P2SH hash.

### 16.10 Address Decoding Errors
<!-- id: addr-decode-errors | world: W2 | difficulty: 2 | prereqs: addr-encoding-algorithm | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

| id | Error (as named in `kaspa-addresses`) | Cause | Fix |
| --- | --- | --- | --- |
| addr-err-missing-prefix | `MissingPrefix` | No `:` in the string | Include the network prefix and colon. |
| addr-err-invalid-prefix | `InvalidPrefix` | Prefix is not `kaspa`, `kaspatest`, `kaspasim` or `kaspadev` | Use the correct network's prefix. |
| addr-err-decoding-char | `DecodingError` | A character outside the 32-character alphabet (for example `1`, `b`, `i`, `o`) | Re-copy the address; letters not in the alphabet are never valid. |
| addr-err-bad-checksum | `BadChecksum` | Typo, truncation, or prefix/network mismatch | Re-copy; check the prefix matches the intended network. |
| addr-err-bad-checksum-size | `BadChecksumSize` | Checksum part is not exactly 8 characters | Address was truncated or has extra characters. |
| addr-err-invalid-version | `InvalidVersion` | Version byte other than `0`, `1`, `8` | The address is not a standard Kaspa address. |
| addr-err-payload-length | `InvalidPayloadLength` | Payload length does not match the version (32/33/32) | The string is corrupted or not a Kaspa address. |

### 16.11 A Short Comparison with Other Chains
<!-- id: addr-cross-chain | world: unmapped | difficulty: 2 | prereqs: addr-version-bytes, utxo-model-vs-account | status: unverified | source: unverified -->

Use these only to correct habits carried over from other systems:

| Property | Kaspa | Bitcoin (segwit, bech32) | Ethereum |
| --- | --- | --- | --- |
| What the address stands for | A locking script (key, ECDSA key, or script hash) | A locking script (witness program) | An account whose state lives in global storage |
| Alphabet | 32-character `bech32` alphabet | Same alphabet | Hexadecimal |
| Checksum | 8 characters (40 bits), includes the prefix | 6 characters (30 bits) | Optional mixed-case checksum |
| Prefix style | `kaspa:` with a colon | `bc1…` with human-readable part and `1` | `0x…` |
| Key visible in address? | Yes for `PubKey = 0` | Hash of the key | Hash of the key |
| Persistent contract identity | Covenant ID (§5.1), separate from address | Not a native concept | The contract address itself (§2.1) |

The Bitcoin and Ethereum columns are background knowledge not re-verified in this session (`unverified`); the Kaspa column is sourced above.

### 16.12 Glossary Additions for §16
<!-- id: addr-glossary-additions | world: W1 | difficulty: 1 | prereqs: addr-anatomy | status: mainnet | source: https://github.com/kaspanet/rusty-kaspa/blob/master/crypto/addresses/src/lib.rs -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| addr-gloss-address | **Address** | The text label on the outside of an envelope that tells a wallet which lock to build. | `prefix:` + base-32(`[version][payload]` + 8-character checksum); decodes to a `script_public_key` for the three standard kinds. |
| addr-gloss-version-byte | **Address version byte** | A one-byte switch saying whether the address holds a Schnorr key, an ECDSA key or a script hash. | `0` = `PubKey`, `1` = `PubKeyECDSA`, `8` = `ScriptHash`. |
| addr-gloss-network-prefix | **Network prefix** | A word before the colon saying which network the address is for. | `kaspa`, `kaspatest`, `kaspasim`, `kaspadev`; included in the checksum. |
| addr-gloss-testnet-suffix | **Testnet suffix** | A number that picks one of several parallel test networks when starting a node. | `--netsuffix=<id>`; not encoded in addresses. |
| addr-gloss-payload | **Address payload** | The key or hash the address stands for. | 32 bytes (`PubKey`, `ScriptHash`) or 33 bytes (`PubKeyECDSA`). |

