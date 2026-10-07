# sillyscript — Complete File Manifest

The single owner of per-module test counts. Every verification gate
(master-prompt.md, platform-pins.md, SillyBible.md 0.11) is deliberately
count-free and points HERE. Counts drift; this file is regenerated when
they do.

~/sillyscript/
├── .gitignore                     node_modules/, *.bak*, session artifacts
├── package.json                   npm manifest: @noble/hashes ^1.4.0, @noble/curves ^1.6.0
│
├── SillyBible.md                 THE CANON — mental model, covenant mechanics, pattern catalog
├── platform-pins.md               THE FACTS — graded protocol pins, codec rules, incident registry
├── master-prompt.md               THE BOOT SECTOR — session load order + count-free gate
├── SAFETY.md                      THE STRATEGY — mainnet-first rails, fee/wallet limits
├── README.md                      THE ENTRY POINT — quick-start, providers, typegen
├── Files-Manifest.md              THIS MANIFEST — inventory + test-count owner
│
├── index.js                       PACKAGE ROOT: exports Contract, Provider, typegen, primitives
├── contract.js                    CONTRACT LAYER: state-aware Contract abstraction
├── provider.js                    TRANSPORT LAYER: Provider, KaspaRestProvider, MockProvider
├── silly-compile.js               COMPILE LAYER: silverc invocation + fail-closed verification
├── silly-typegen.js               TOOLING: CLI & programmatic TypeScript type generator
├── sil-abi.js                     CODEC 1: artifact loader, tag verifier, state decoder
├── sil-encoder.js                 CODEC 2: minimal/explicit push builder, columnar struct arrays
├── kaspa-crypto.js                CRYPTO 3: bech32, covenant ID, P2SH/P2PK formats
├── kaspa-sighash.js               SIGHASH 4: v1 signing hash (covenant commitments)
├── kaspa-tx.js                    TX 5: tx builder, computeBudget assignment, mass/fee
├── kaspa-wrpc.js                  NETWORK 6: wRPC broadcast, endpoint rotation, gauntlet-B4
├── genesis-verify.js           GENESIS VERIFY: source/artifact vs on-chain covenant
│
├── vesting.sil                    REFERENCE CONTRACT: vesting escrow source
├── vesting.json                   REFERENCE ARTIFACT: compiled JSON
├── vesting.d.ts                   REFERENCE TYPES: generated declarations
├── counter-abi.json              REFERENCE ARTIFACT: Counter — chain-verified testnet-10 deploy (genesis bd4085b1…, pins 3.3b)
│
├── bin/
│   ├── silly.js                   CLI: setup / init / check (check parses all templates)
│   └── templates/                 SCAFFOLD SOURCE — copied verbatim by silly init
│       ├── lib.js.txt             shared runtime: env, keys, record I/O, pending recovery
│       ├── deploy.js.txt          genesis (bind-after-build, pending crash marker)
│       ├── interact.js.txt        state transition (record-driven, re-runnable)
│       └── close.js.txt           termination (budget 60, full carrier to owner)
│
└── probes/                        VERIFICATION LAYER
    ├── verify-tags.js             dispatch-tag + template-hash conformance sweep
    ├── validate-mainnet.js        covenant ID vs mainnet genesis
    ├── verify-schnorr-fixed.js    sighash + schnorr vs live mainnet genesis
    ├── gauntlet-v13.js            full vertical integration vs v13 artifact
└── resolve-authindex.js     authIndex semantics vs chain truth (pins 3.2)


## Modules — The Executable Layer

| File | Tests | What it does |
|---|---|---|
| `genesis-verify.js` | 21 | Genesis verification: source/artifact vs on-chain covenant — state/script/consensus layers, chain-read covenant_id as the verdict source (19 core + 2 chain-anchored Counter positives, active when counter-abi.json is present). Deferred: UTXO-lookup genesis discovery (Path B); heterogeneous covenant groups report per-output detail under ALL-match strictness. |
| `index.js` | — | Unified package entrypoint: Contract, Provider, generateTypes, primitives. |
| `contract.js` | 18 | High-level Contract: state reflection, arg normalization, next-state derivation, input population, continuation binding. |
| `provider.js` | 16 | Abstract Provider, KaspaRestProvider (mainnet/testnet), MockProvider with UTXO tracking and block simulation. |
| `silly-compile.js` | 13 | silverc invocation, constructor-arg baking, fail-closed artifact verification gates. |
| `silly-typegen.js` | 17 | TypeScript declaration generator: typed state, entry args, tuples, Contract classes. |
| `sil-abi.js` | — | Artifact loader; derives and asserts dispatch tags; verifies template hashes; decodes state. Verified via consumers and silly check. |
| `sil-encoder.js` | 36 | Sigscripts from ABI params; minimal arg pushes, explicit state pushes, columnar struct arrays. |
| `kaspa-crypto.js` | 19 | CashAddr-variant bech32; KIP-20 covenant ID; P2SH/P2PK script public keys. |
| `kaspa-sighash.js` | 4 | v1 sighash: keyed blake2b over the 16-field preimage with covenant bindings. |
| `kaspa-tx.js` | 29 | Tx assembly (auto computeBudget 10/60), P2PK and covenant signing, mass/fee estimation. |
| `kaspa-wrpc.js` | 26 | wRPC broadcast: gauntlet-B4 schema, BigInt serialization, rotation on error and rejection. |

**Total: 199 tests across 10 self-test modules** — `npm test` prints ten
`ALL n PASS` lines; their sum is the contract.

## The Scaffold — `silly init <name>`

Generates: `contracts/Counter.sil` (close entry uses ScriptPubKeyP2PK —
pins §3.3b), fail-closed `.env`, `package.json` (sillyscript `file:` link +
noble pins derived from the library's own package.json), and the four
lifecycle scripts copied verbatim from `bin/templates/`.

**Lifecycle proven end-to-end on testnet-10 (2026-10-05)**: deploy →
interact ×2 (the second an UNMODIFIED re-run) → close from elevated state
(count=2n). Citations in pins §3.3b. Known wart: the 100M change guard
burns sub-guard change as fee (pins §11 S7) — fix pending the dust-floor
probe.

## Probes — The Verification Layer

| File | What it verifies |
|---|---|
| `probes/resolve-authindex.js` | Settles the covenant-ID authIndex semantics (previous-outpoint index, not input position) against chain truth; dumps the testnet-10 retrieval schema. |
| `probes/verify-tags.js` | Derives every entry's dispatch tag from artifact params; verifies template hashes. |
| `probes/validate-mainnet.js` | Fetches mainnet genesis via REST, computes the covenant ID, checks it against the chain. |
| `probes/verify-schnorr-fixed.js` | Reconstructs the sighash from mainnet genesis data, verifies the schnorr signature. |
| `probes/gauntlet-v13.js` | Four-phase integration: load, sigscript build, mock tx assembly, verification. |

## The Dependency Footprint

@noble/hashes ^1.4.0     blake2b, blake3
@noble/curves ^1.6.0     schnorr (secp256k1)

Two packages, zero WASM, pure JavaScript. Node and Termux proven; the
browser claim awaits the isomorphic (Uint8Array) pass — README audit item.

## Publishing Notes (pre-publish checklist)

- `files` whitelist REQUIRED before `npm publish` — the repo now carries git
  history and strays; the default would ship everything. Must include
  `bin/` and `bin/templates/` or the scaffold ships broken.
- noble pinned to 1.x — v2 subpath exports are incompatible (pins §5.3).
- silverc revision dependency: c7d17a1 proven (pins §1.6) — document in
  README during the docs audit.
