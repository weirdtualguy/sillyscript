# sillyscript — Complete File Manifest

```
~/sillyscript/
├── .gitignore                     Excludes node_modules/
├── package.json                   npm manifest: @noble/hashes, @noble/curves
│
├── SilverBible.md                 THE CANON — mental model, covenant mechanics, pattern catalog
├── platform-pins.md               THE FACTS — empirical protocol pins, codec rules, incident registry
├── master-prompt.md               THE BOOT SECTOR — session prompt for SilverScript development
├── SAFETY.md                      THE STRATEGY — mainnet-first development rails & fee guards
├── README.md                      THE ENTRY POINT — quick-start, provider & typegen guide
├── Files-Manifest.md              THIS MANIFEST — exhaustive inventory of canonical assets
│
├── index.js                       PACKAGE ROOT: exports Contract, Provider, typegen, & primitives
├── contract.js                    CONTRACT LAYER: state-aware Contract abstraction
├── provider.js                    TRANSPORT LAYER: Provider, KaspaRestProvider, MockProvider
├── silly-typegen.js               TOOLING LAYER: CLI & programmatic TypeScript type generator
│
├── sil-abi.js                     CODEC MODULE 1: artifact loader, tag verifier, state decoder
├── sil-encoder.js                 CODEC MODULE 2: minimal/explicit push builder, columnar struct arrays
├── kaspa-crypto.js                CRYPTO MODULE 3: bech32, covenant ID, P2SH/P2PK formats
├── kaspa-sighash.js               SIGHASH MODULE 4: v1 transaction signing hash (covenant commitments)
├── kaspa-tx.js                    TX MODULE 5: tx builder, computeBudget assignment, fee discovery
│
├── vesting.sil                    REFERENCE CONTRACT: SilverScript source for vesting escrow
├── vesting.json                   REFERENCE ARTIFACT: compiled JSON artifact
├── vesting.d.ts                   REFERENCE TYPES: auto-generated TypeScript declarations
│
└── probes/                        VERIFICATION LAYER
    ├── verify-tags.js             PROBE 1: conformance sweep across compiled artifacts
    ├── validate-mainnet.js        PROBE 2: covenant ID validation vs mainnet genesis
    ├── verify-schnorr-fixed.js    PROBE 3: sighash + schnorr vs live mainnet genesis tx
    └── gauntlet-v13.js            PROBE 4: full vertical integration test against v13 artifact
```

## Documents — The Knowledge Layer

| File | Purpose |
|---|---|
| `SilverBible.md` | The canon: mental model (§1), language card (§2), covenant mechanics (§3), DECL macros (§4), pattern catalog P1-P10 (§8), workflow protocol (§9), operating rules for AI agents (§0). |
| `platform-pins.md` | Every platform fact, graded `[SPEC]/[REF]/[PIN]/[LAW]/[TODO-verify]`: compiler & ABI (§1), codec (§2), crypto (§3), tx & network (§4), environment (§5), incident registry (§6), checklist (§8). |
| `master-prompt.md` | The session boot sector: load order, verification gate, ten catastrophic-failure rules, interaction protocol. |
| `SAFETY.md` | Mainnet-first development strategy: mainnet for standard operations, testnet for first-spend smoke tests. Hard limits (MAX_FEE, dedicated dev wallet, cool-down rule). |
| `README.md` | Entry point: architecture, quick-start guide, provider documentation, typegen CLI guide. |

## Modules — The Executable Layer

| File | Tests | What it does |
|---|---|---|
| `index.js` | — | Unified package entrypoint: exposes `Contract`, `Provider`, `generateTypes`, and core primitives. |
| `contract.js` | 13 | High-level `Contract` abstraction: state reflection, order-independent arg normalization, next-state derivation, input population, and continuation binding. |
| `provider.js` | 13 | Decoupled transport layer: abstract `Provider`, production `KaspaRestProvider` (mainnet/testnet), and zero-network in-memory `MockProvider` with local UTXO tracking and block simulation. |
| `silly-typegen.js` | 15 | CLI and programmatic TypeScript declaration generator: emits typed state interfaces, entry argument schemas, positional tuples, and typed Contract classes directly from `.json` artifacts. |
| `sil-abi.js` | — | Loads SilverScript artifacts; derives and asserts every dispatch tag (`blake3` formula with `{fields}` struct recursion); verifies template hashes; decodes state spans into `BigInt`. |
| `sil-encoder.js` | 35 | Builds entry sigscripts from ABI params at runtime; minimal pushes for args, explicit pushes for state; columnar struct array packaging; 250KB consensus gate. |
| `kaspa-crypto.js` | 19 | Kaspa CashAddr-variant Bech32 addresses; KIP-20 covenant ID computation; P2SH (`aa20...87`) and P2PK (`20...ac`) script public keys; pubkey extraction from UTXO script. |
| `kaspa-sighash.js` | 4 | Kaspa v1 transaction signing hash: keyed `blake2b('TransactionSigningHash')` over the 16-field preimage with covenant binding commitments. |
| `kaspa-tx.js` | 27 | Transaction assembly (auto `computeBudget`: P2PK=10, P2SH=60); P2PK and covenant Schnorr signing; mass estimation (`estimateMass`); proactive fee calculation (`proactiveFee`); 64-bit sequence disable (`SEQUENCE_DISABLE`). |

## Probes — The Verification Layer

| File | What it verifies |
|---|---|
| `probes/verify-tags.js` | Derives every entry's dispatch tag from artifact params and compares to stored tags; verifies template hashes. |
| `probes/validate-mainnet.js` | Fetches mainnet genesis tx via REST, computes covenant ID from on-chain data, and verifies against the chain's `covenant_id`. |
| `probes/verify-schnorr-fixed.js` | Reconstructs sighash from mainnet genesis tx data, extracts pubkey from the UTXO's P2PK script, and verifies the Schnorr signature. |
| `probes/gauntlet-v13.js` | Four-phase integration test against a live v13 artifact: load, sigscript build, mock transaction assembly, and verification. |

## The Dependency Footprint

```
@noble/hashes@1.4.0     blake2b, blake3
@noble/curves@1.6.0     schnorr (secp256k1)
```

Two packages. Zero WASM. Pure JavaScript. Runs on Termux, Node.js, and modern browser environments.