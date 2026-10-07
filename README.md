# sillyscript

Lightweight, pure-JS covenant companion to `silverc`. An end-to-end
SilverScript toolchain for Kaspa: compile `.sil` contracts, deploy
covenants, drive state transitions, terminate them — from Termux.

**Status:** development toolkit, proven end-to-end on testnet-10 (two full
lifecycles, on-chain, record-driven — citations in `platform-pins.md`
§3.3b). Not yet published to npm: use the scaffold below, or
`npm install /path/to/sillyscript`.

**Compiler dependency:** `silverc` at revision `c7d17a1`. Artifact format
and tag derivation are revision-sensitive (`platform-pins.md` §1.6) —
recompile and re-verify canonical contracts on any upgrade.

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

## The Scaffold (start here)

node bin/silly.js setup      # once: Rust + silverc from source (Termux)
node bin/silly.js init foo   # scaffold: contract + lifecycle + .env
cd foo && npm install
# set PC_PRIV in .env, fund the printed address
npm run deploy               # compile + genesis  -> data/deployment.json
npm run interact             # advance state (re-runnable: record-driven)
npm run close                # terminate, carrier returned to owner

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

---

## Library Quick Start

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

For the full lifecycle without hand-assembly, use the scaffold above.

---

## Providers

`Contract` logic is decoupled from transport:

const { KaspaRestProvider, MockProvider } = require('sillyscript');

const mainnet = new KaspaRestProvider('mainnet');
const testnet = new KaspaRestProvider('testnet');
const custom  = new KaspaRestProvider('https://kaspad.internal:8080');

`MockProvider` runs contracts, UTXO spends, and multi-step transitions
in-memory with zero network calls — see its usage in the test suite.

---

## CLI

node bin/silly.js setup    # Termux: install Rust, compile silverc
node bin/silly.js init foo # scaffold a covenant project
node bin/silly.js check    # toolchain + template verification gate
npx silly-typegen ./vesting.json --out ./vesting.d.ts

`silly check` syntax-checks every scaffold template — generated projects
parse before you ever run them.

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
| `bin/silly.js` | CLI: setup / init / check |
| `bin/templates/` | Scaffold source: lib / deploy / interact / close |

(Test counts are owned by `Files-Manifest.md` — the single count owner.)

---

## Tests & Docs

npm test   # self-test modules — "ALL n PASS" lines per Files-Manifest.md, zero FAIL

The repo ships its own operating canon: `SillyBible.md` (model,
language, patterns), `platform-pins.md` (graded, evidenced facts),
`SAFETY.md` (mainnet-first rails).
