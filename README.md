# sillyscript

Lightweight, pure-JS covenant companion to `silverc`. An end-to-end
SilverScript toolchain for Kaspa: compile `.sil` contracts, deploy
covenants, drive state transitions, terminate them — from Termux.

sillyscript grew out of real Kaspa covenant work, not as a demo: it is the
toolkit for taking a contract from source to an on-chain lifecycle, with
the state, addresses and tags derived from the compiled artifact every
time — never hardcoded.

**Status — v1.3.0, development toolkit**
- Proven end-to-end on testnet-10: two full lifecycles, on-chain,
  record-driven (citations in `platform-pins.md` §3.3b).
- Mainnet is **not** proven end-to-end: read `SAFETY.md` before using
  funds, and never develop from your main holding wallet.
- Not yet published to npm. Install from this repo (see below).
- Requires Node.js >= 18. Node.js and Termux are the proven
  environments; browser support is planned, not claimed.

**Compiler dependency:** `silverc` at revision `c7d17a1`. Artifact format
and tag derivation are revision-sensitive (`platform-pins.md` §1.6) —
recompile and re-verify canonical contracts on any upgrade.

## Install

```bash
git clone https://github.com/weirdtualguy/sillyscript.git
cd sillyscript
npm install
npm test   # 476 tests across 15 self-test modules, zero FAIL
```

Or, from another project, `npm install /path/to/sillyscript`.
To compile contracts you also need `silverc` — `node bin/silly.js setup`
builds it from source on Termux (elsewhere it needs `git` and `cargo`
on PATH; see [CLI](#cli)).

**Keys:** the local UI never handles private keys and makes no outbound
requests. Signing and broadcasting stay in the CLI and your scripts, with
the key in the generated project's own `.env` — never in this repo.

- **Zero-WASM**: pure JavaScript (`Buffer`, `BigInt`, `@noble/hashes`,
  `@noble/curves`). Node.js and Termux are the proven environments.
  Browser support is planned (isomorphic pass) — not claimed.
- **ABI-driven**: dispatch tags, template hashes, state spans, and
  columnar struct arrays are derived from the artifact at runtime.
  Never hardcode tags or clone builders between versions.
- **Fail-closed**: every artifact's template hash and dispatch tags are
  re-derived and asserted at load time.
- **High-level Contract API**: Viem/Ethers-style `Contract` with named
  arguments, continuation derivation, and state-derived addresses.
- **Pluggable providers**: `KaspaRestProvider` for live networks,
  `MockProvider` for offline deterministic tests.
- **The scaffold**: `silly init` generates a complete, proven covenant
  lifecycle — deploy, interact (re-runnable), close — driven by a single
  deployment record.

---

## What it is — and what it is not

| | |
|---|---|
| A compiler companion | Compiles `.sil` via `silverc`, then verifies the artifact fail-closed before anything trusts it. |
| A lifecycle runner | `silly init` scaffolds deploy → interact → close, driven by one deployment record, so `interact` re-runs without edits. |
| A library | `Contract`, providers, tx assembly, sighash and wRPC broadcast, usable without the scaffold. |
| Not a wallet | It never holds funds and the UI never sees a key; you bring a funded, dedicated dev address. |
| Not a mainnet guarantee | Testnet-10 is proven; mainnet end-to-end is not. `SAFETY.md` is required reading, not boilerplate. |

---

## The Scaffold (start here)

```bash
node bin/silly.js setup      # once: Rust + silverc from source (Termux)
node bin/silly.js init foo   # scaffold: contract + lifecycle + .env
cd foo && npm install
# set PC_PRIV in .env, fund the printed address
npm run deploy               # compile + genesis  -> data/deployment.json
npm run interact             # advance state (re-runnable: record-driven)
npm run close                # terminate, carrier returned to owner
```

(Once published, `npx silly …` works — the `bin` field is registered.)

The generated project is record-driven: `data/deployment.json` carries
the covenant ID, the current state, and the current UTXO pointer
(`currentStateTx`), plus a `pending` crash marker between broadcast and
confirmation. No script hardcodes a txid, state, or UTXO array position —
which is why `interact` re-runs without edits.

Network notes (full detail in `platform-pins.md` §4):
- Testnet covenant transactions REQUIRE wRPC broadcast — testnet REST
  drops `compute_budget` ("script-units limit=9999"). The scaffold
  broadcasts via wRPC on every network.
- Mainnet wRPC has NO public default endpoint: set `PC_MAINNET_WRPC` in
  `.env` before using `--mainnet`, or broadcast fails with
  "all endpoints failed".
- Change outputs are guarded by storage mass, not a round-number dust
  floor: a change output too small for the tx's storage mass burns as fee
  with a visible WARNING (`platform-pins.md` §4.9). Covenant-bound outputs
  count 4x in that mass.

---

## Library Quick Start

```js
const { Contract, KaspaRestProvider, buildTx } = require('sillyscript');

const provider = new KaspaRestProvider('mainnet');
const vesting = new Contract('./vesting.json', { provider });

console.log(vesting.address);  // state-derived P2SH address: kaspa:pr...
console.log(vesting.state);    // { claimed_so_far: 0n }

// Next state and its address (state changes -> address changes)
const nextState = { claimed_so_far: 500000000n };
const nextAddress = vesting.nextAddress(nextState);

// Sigscript for an entry (named or positional arguments)
const sigScript = vesting.buildSigScript('claim', {
    amount: 500000000n,
    claim_time: 1728000000000n,
});

// Populate a covenant input on a transaction
const tx = buildTx(inputs, outputs);  // your inputs/outputs
vesting.populateInput(tx, 0, {
    entryName: 'claim',
    args: { amount: 500000000n, claim_time: 1728000000000n },
});

// Continuation output — covenantIdHex is REQUIRED (the lineage identity;
// omitted, it throws)
vesting.addContinuationOutput(tx, 1, 0, nextState, remainderAmount, covenantIdHex);
```

For the full lifecycle without hand-assembly, use the scaffold above.

---

## Providers

`Contract` logic is decoupled from transport:

```js
const { KaspaRestProvider, MockProvider } = require('sillyscript');

const mainnet = new KaspaRestProvider('mainnet');
const testnet = new KaspaRestProvider('testnet');
const custom  = new KaspaRestProvider('https://kaspad.internal:8080', { network: 'mainnet' }); // network is required with a URL
```

`MockProvider` runs contracts, UTXO spends, and multi-step transitions
in-memory with zero network calls — see its usage in the test suite.

---

## CLI

```bash
node bin/silly.js setup    # Termux: install Rust, compile silverc
node bin/silly.js init foo # scaffold a covenant project
node bin/silly.js check    # toolchain + template verification gate (exit 1 on failure)
node bin/silly.js genesis verify <source.sil|artifact.json> \
    --covenant-id <id> --genesis-txid <txid> [--network testnet|mainnet]
node bin/silly.js ui        # local UI on http://127.0.0.1:8787 (loopback only)
node bin/silly.js --version
npx silly-typegen ./vesting.json --out ./vesting.d.ts
```

`silly check` syntax-checks every scaffold template — generated projects
parse before you ever run them. `silly setup` builds `silverc` with `pkg` on
Termux; elsewhere it needs `git` and `cargo` on PATH.

`silly genesis verify` checks a source or compiled artifact against an
on-chain covenant (state, script and consensus layers) and exits 1 on mismatch.

### Local UI

`silly ui` serves a single-page app on `127.0.0.1` (default port 8787, `--port N` to change; works in a phone
browser next to Termux). Tabs: verify and inspect a compiled artifact, encode an entry call into a signature
script, derive the next redeem script and address for a state, compute dispatch tags and addresses, compile
`.sil` source through `silverc`, and browse the docs. Paste a contract and the Compile tab detects the
constructor, lints the source, fills sample values (or matches values from a pasted ledger or config JSON),
and logs each stage (lint, arguments, silverc, fail-closed verification) so a failure says where and why. It never handles private keys and makes no outbound
requests; signing and broadcasting stay in the CLI and your scripts. Requests are limited to the loopback
origin (Host and Origin checks, strict CSP).

---

## Module Overview

| Module | Purpose |
|---|---|
| `index.js` | Package root — the full export surface |
| `contract.js` | High-level `Contract` abstraction |
| `provider.js` | `Provider`, `KaspaRestProvider`, `MockProvider` |
| `silly-compile.js` | silverc invocation + fail-closed artifact verification |
| `silly-typegen.js` | TypeScript declaration generator (CLI + programmatic) |
| `sil-abi.js` | Artifact loader, tag verifier, state decoder |
| `sil-encoder.js` | Push-level encoder: args, state, columnar struct arrays |
| `kaspa-crypto.js` | Bech32 (CashAddr variant), covenant ID, P2SH/P2PK formats |
| `kaspa-sighash.js` | v1 sighash engine with covenant binding commitments |
| `kaspa-tx.js` | Tx assembly, auto computeBudget (10/60), signing, mass/fee |
| `kaspa-wrpc.js` | wRPC broadcast, endpoint rotation, BigInt serialization |
| `genesis-verify.js` | Verifies a covenant's source and artifact against its on-chain genesis |
| `bin/silly.js` | CLI: setup / init / check |
| `bin/templates/` | Scaffold source: lib / deploy / interact / close |
| `probes/` | Chain-verification scripts and TN10 storage-mass probes; inventory in `Files-Manifest.md` |

(Test counts are owned by `Files-Manifest.md` — the single count owner.)

---

## Tests & Docs

```bash
npm test   # fifteen "ALL n PASS" lines, summing to 476 tests, zero FAIL
```

`Files-Manifest.md` is the single owner of test counts, so if a count
here and a count there ever disagree, trust the manifest and fix this
file. The suite includes KCC conformance vectors, the CLI, the local UI
(including its Host/Origin guards and fail-closed artifact load), and
offline `MockProvider` lifecycles — no network calls are needed to run it.

## Documentation

Start at [`docs/README.md`](docs/README.md); it fixes the order of authority:

1. `docs/kcc/`: the Final KCC-1, KCC-2 and KCC-20 standards (imported verbatim).
2. `platform-pins.md`: graded, evidenced facts about the pinned toolchain and testnet-10.
3. `SillyBible.md`: the model, laws and patterns for building with sillyscript.
4. `docs/ssot/`: the Kaspa Silverscript and Covenants single source of truth (modular; errata in `docs/ssot/ERRATA.md`).

The codec is tested against the KCC conformance vectors (`test-kcc1.js`, `test-kcc2-20.js`);
`docs/KCC-CONFORMANCE.md` lists what is proven and the two known gaps.
`SAFETY.md` has the mainnet-first rails. Security reports: see `SECURITY.md`.

## License

ISC.
