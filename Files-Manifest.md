# sillyscript — Complete File Manifest

The single owner of per-module test counts. Every verification gate
(master-prompt.md, platform-pins.md, SillyBible.md 0.11) is deliberately
count-free and points HERE. Counts drift; this file is regenerated when
they do.

```text
~/sillyscript/
├── .gitignore                     node_modules/, *.bak*, session artifacts
├── package.json                   npm manifest: @noble/hashes ^1.4.0, @noble/curves ^1.6.0, ws ^8.22.0
├── LICENSE                        MIT
├── SECURITY.md                    vulnerability reporting + scope
│
├── SillyBible.md                  THE CANON — mental model, covenant mechanics, pattern catalog
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
├── test-cli.js                    TESTS: offline smoke tests for bin/silly.js (not shipped to npm)
├── test-kcc1.js                   TESTS: KCC-1 section 6 conformance vectors (not shipped to npm)
├── test-kcc2-20.js                TESTS: KCC-2 and KCC-20 codec vectors (not shipped to npm)
├── test-docs.js                   TESTS: docs integrity (SSOT modules, KCC headers, links, test wiring)
├── test-ui.js                     TESTS: local UI server (loopback guards, API parity)
├── ui/                            local UI: server.js (zero-dep, loopback only) + index.html (single page)
├── tools/ssot-build.js            concatenates docs/ssot modules into one SSOT.md
├── docs/                          README.md (authority order), KCC-CONFORMANCE.md, kcc/ (KCC-1, 2, 20 Final), ssot/ (21 modules + ERRATA.md + modules.json)
├── make-session-pack.js           TOOLING: builds SESSION-PACK.md (chat-handoff pack; pack itself is a gitignored build artifact)
├── sil-abi.js                     CODEC 1: artifact loader, tag verifier, state decoder
├── sil-encoder.js                 CODEC 2: minimal/explicit push builder, columnar struct arrays
├── kaspa-crypto.js                CRYPTO 3: bech32, covenant ID, P2SH/P2PK formats
├── kaspa-sighash.js               SIGHASH 4: v1 signing hash (covenant commitments)
├── kaspa-tx.js                    TX 5: tx builder, computeBudget assignment, mass/fee
├── kaspa-wrpc.js                  NETWORK 6: wRPC broadcast, endpoint rotation, gauntlet-B4
├── genesis-verify.js              GENESIS VERIFY: source/artifact vs on-chain covenant
│
├── vesting.sil                    REFERENCE CONTRACT: vesting escrow source
├── vesting.json                   REFERENCE ARTIFACT: compiled JSON
├── vesting.d.ts                   REFERENCE TYPES: generated declarations
├── counter-abi.json               REFERENCE ARTIFACT: Counter — chain-verified testnet-10 deploy (genesis bd4085b1…, pins 3.3b)
│
├── bin/
│   ├── silly.js                   CLI: setup / init / check / genesis verify / ui / --version (check parses all templates)
│   └── templates/                 SCAFFOLD SOURCE — copied verbatim by silly init
│       ├── lib.js.txt             shared runtime: env, keys, record I/O, pending recovery
│       ├── deploy.js.txt          genesis (bind-after-build, pending crash marker)
│       ├── interact.js.txt        state transition (record-driven, re-runnable)
│       └── close.js.txt           termination (budget 60, full carrier to owner)
│
├── test-vectors/                  FROZEN CHAIN DATA: mainnet genesis anchors for the sighash and covenant-ID self-tests
└── probes/                        VERIFICATION LAYER
    ├── verify-tags.js             dispatch-tag + template-hash conformance sweep
    ├── validate-mainnet.js        covenant ID vs mainnet genesis
    ├── verify-schnorr-fixed.js    sighash + schnorr vs live mainnet genesis
    ├── gauntlet-v13.js            full vertical integration vs v13 artifact
    ├── dump-vector.js             freeze a chain-verified mainnet genesis into test-vectors/
    ├── resolve-authindex.js       authIndex semantics vs chain truth (pins 3.2)
    ├── mass-probe.js              TN10 mixed-input storage-mass shape probe (pins 4.9); dry run unless --go
    └── dust-probe.js              TN10 storage-mass boundary probe (pins 4.9); dry run unless --go
```


## Modules — The Executable Layer

| File | Tests | What it does |
|---|---|---|
| `genesis-verify.js` | 21 | Genesis verification: source/artifact vs on-chain covenant — state/script/consensus layers, chain-read covenant_id as the verdict source (19 core + 2 chain-anchored Counter positives, active when counter-abi.json is present). Deferred: UTXO-lookup genesis discovery (Path B); heterogeneous covenant groups report per-output detail under ALL-match strictness. |
| `index.js` | — | Unified package entrypoint: Contract, Provider, generateTypes, primitives. |
| `contract.js` | 33 | High-level Contract: state reflection, arg normalization, next-state derivation, input population, continuation binding. |
| `provider.js` | 46 | Abstract Provider, KaspaRestProvider (mainnet/testnet), MockProvider with UTXO tracking and block simulation. |
| `silly-compile.js` | 23 | silverc invocation, constructor-arg baking, fail-closed artifact verification gates. |
| `silly-typegen.js` | 17 | TypeScript declaration generator: typed state, entry args, tuples, Contract classes. |
| `sil-abi.js` | — | Artifact loader; derives and asserts dispatch tags; verifies template hashes; decodes state. Verified via consumers and silly check. |
| `sil-encoder.js` | 51 | Sigscripts from ABI params; minimal arg pushes, explicit state pushes, columnar struct arrays. |
| `kaspa-crypto.js` | 29 | CashAddr-variant bech32; KIP-20 covenant ID; P2SH/P2PK script public keys. |
| `kaspa-sighash.js` | 14 | v1 sighash: keyed blake2b over the 16-field preimage with covenant bindings. |
| `kaspa-tx.js` | 51 | Tx assembly (auto computeBudget 10/60), P2PK and covenant signing, mass/fee estimation. |
| `test-kcc1.js` | 64 | KCC-1 section 6 vectors: BLAKE3, type names, pushes, scalars, composites, dispatch tags, P2SH, state, template hashes, continuation. |
| `test-kcc2-20.js` | 16 | KCC-2 authority hashes and encodings; KCC-20 dispatch tags, 112-byte state, transfer arguments, hash chain. |
| `test-docs.js` | 11 | SSOT module set and build, unique heading ids, KCC headers, local links, every `test-*.js` wired into `npm test`. |
| `test-ui.js` | 52 | Local UI: Host/Origin guards, CSP, fail-closed artifact load, encode/state/tag/address parity, docs allowlist, front-end sanity. |
| `test-cli.js` | 12 | Offline CLI smoke tests: version, unknown command, project-name and `--rev` validation, scaffold contents, `.env` mode 0600, `silly check`. |
| `kaspa-wrpc.js` | 36 | wRPC broadcast: gauntlet-B4 schema, BigInt serialization, rotation on error and rejection. |

**Total: 476 tests across 15 self-test modules** — `npm test` prints fifteen
`ALL n PASS` lines; their sum is the contract.

## The Scaffold — `silly init <name>`

Generates: `contracts/Counter.sil` (close entry uses ScriptPubKeyP2PK —
pins §3.3b), fail-closed `.env`, `package.json` (sillyscript `file:` link +
noble pins derived from the library's own package.json), and the four
lifecycle scripts copied verbatim from `bin/templates/`.

**Lifecycle proven end-to-end on testnet-10 (2026-10-05)**: deploy →
interact ×2 (the second an UNMODIFIED re-run) → close from elevated state
(count=2n). Citations in pins §3.3b. Resolved 2026-10-11: the 100M change guard was replaced by a
storage-mass check (pins §4.9, §11 S7).
Re-verified 2026-10-13 on commit 1c0be13: deploy e9ccb5565be8848b, interact 1b5eec118979cf62, close e2bd1e16acf5e63f (covenant c1e7ad7800367a76).
The check weighs covenant-bound outputs 4x and handles unequal inputs (pins §4.9).

## Probes — The Verification Layer

| File | What it verifies |
|---|---|
| `probes/resolve-authindex.js` | Settles the covenant-ID authIndex semantics (previous-outpoint index, not input position) against chain truth; dumps the testnet-10 retrieval schema. |
| `probes/verify-tags.js` | Derives every entry's dispatch tag from artifact params; verifies template hashes. |
| `probes/validate-mainnet.js` | Fetches mainnet genesis via REST, computes the covenant ID, checks it against the chain. |
| `probes/verify-schnorr-fixed.js` | Reconstructs the sighash from mainnet genesis data, verifies the schnorr signature. |
| `probes/dump-vector.js` | Freezes a chain-verified mainnet genesis into `test-vectors/`; writes nothing unless the covenant ID recomputes and the on-chain signature verifies. |
| `test-vectors/mainnet-genesis-f6ebb717.json` | Frozen chain data: the sighash and covenant-ID anchors asserted by the kaspa-sighash and kaspa-crypto self-tests. |
| `probes/gauntlet-v13.js` | Four-phase integration: load, sigscript build, mock tx assembly, verification. |
| `probes/mass-probe.js` | TN10 storage-mass shape probe: `--ins` picks wallet UTXOs by exact amount, `--outs` sets outputs, prints the repo, node-style and harmonic predictions; use vectors over the 500000 limit so the node rejects them and reports its mass; dry run unless `--go`; the evidence behind pins 4.9 (unequal inputs, P2SH and covenant outputs). `--p2sh-out <i>` and `--covenant-out <i>` make output i a plain P2SH or a genesis-bound one. |
| `probes/dust-probe.js` | TN10 storage-mass boundary probe: one P2PK self-send of `--amount` sompi, dry run unless `--go`; the evidence behind pins 4.9. |

## The Dependency Footprint

```text
@noble/hashes ^1.4.0     blake2b, blake3
@noble/curves ^1.6.0     schnorr (secp256k1)
ws            ^8.22.0    wRPC transport (kaspa-wrpc.js)
```

Three packages, zero WASM, pure JavaScript. Node and Termux proven; the
browser claim awaits the isomorphic (Uint8Array) pass — README audit item.

## Publishing Notes (pre-publish checklist)

- `files` whitelist is in place (runtime modules, `bin/`, docs, vectors); verify
  with `npm pack --dry-run` before `npm publish`. `bin/` must ship with
  `bin/templates/` or the scaffold is broken.
- noble pinned to 1.x — v2 subpath exports are incompatible (pins §5.3).
- silverc revision dependency: c7d17a1 proven (pins §1.6) — documented in
  the README.
