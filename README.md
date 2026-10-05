# sillyscript

Lightweight, pure-JS covenant companion to `silverc`.

`sillyscript` provides an end-to-end client toolchain for SilverScript smart contracts on Kaspa: from `.json` compiler artifacts to state management, covenant continuation derivation, sighash computation, and transaction submission.

- **Zero-WASM**: Pure JavaScript (`Buffer`, `BigInt`, `@noble/hashes`, `@noble/curves`). Runs seamlessly in Node.js, Termux, and browser environments.
- **ABI-Driven**: Runtime derivation of 4-byte dispatch tags, template hashes, state spans, and columnar struct array layouts. Never hardcode tags or clone builders between versions.
- **Fail-Closed**: Re-derives and validates every artifact's template hash and tags against its declared types at load time.
- **High-Level Contract API**: Viem/Ethers-style `Contract` abstraction supporting named-argument mapping, automatic continuation derivation, and next-state address calculation.
- **Pluggable Providers**: Decoupled transport layer with `KaspaRestProvider` for production and `MockProvider` for instant, offline, deterministic unit tests.
- **TypeScript Typegen (`silly-typegen`)**: Generates strongly-typed `.d.ts` interfaces directly from compiler artifacts for IDE autocompletion and compile-time contract safety.

---

## Quick Start

```bash
npm install sillyscript
```

```javascript
const { Contract, KaspaRestProvider, buildTx } = require('sillyscript');

// 1. Connect to network via Provider
const provider = new KaspaRestProvider('mainnet');
const vesting = new Contract('./vesting.json', { provider });

console.log('Contract Address:', vesting.address); // kaspa:pr...
console.log('Initial State:', vesting.state);      // { claimed_so_far: 0n }

// 2. Prepare next state and preview continuation address
const nextState = { claimed_so_far: 500000000n };
const nextAddress = vesting.nextAddress(nextState);

// 3. Build sigScript (supports named or positional arguments)
const sigScript = vesting.buildSigScript('claim', {
  amount: 500000000n,
  claim_time: 1728000000000n,
});

// 4. Populate covenant input on transaction
const tx = buildTx(inputs, outputs);
vesting.populateInput(tx, 0, {
  entryName: 'claim',
  args: { amount: 500000000n, claim_time: 1728000000000n },
});

// 5. Add continuation output with validated next state
vesting.addContinuationOutput(tx, 1, 0, nextState, remainderAmount);
```

---

## Pluggable Providers

`sillyscript` completely decouples contract logic from the network transport:

### 1. `KaspaRestProvider` (Default for Live Networks)
Connect to mainnet, testnet-10, or a custom node REST gateway:
```javascript
const { KaspaRestProvider } = require('sillyscript');

const mainnet = new KaspaRestProvider('mainnet');
const testnet = new KaspaRestProvider('testnet');
const privateNode = new KaspaRestProvider('https://kaspad.internal:8080');
```

### 2. `MockProvider` (Offline Unit Testing)
Test contracts, UTXO spending, and multi-step state transitions in-memory with zero network calls:
```javascript
const { Contract, MockProvider } = require('sillyscript');

const mock = new MockProvider('mainnet');
const contract = new Contract('./vesting.json', { provider: mock });

// Seed mock wallet balance
mock.addUtxo(contract.address, {
  txId: '00'.repeat(32),
  index: 0,
  amount: 1000000000n, // 10 KAS
});

const utxos = await contract.getUtxos();
console.log('Mock UTXOs:', utxos);
```

---

## TypeScript Type Generation (`silly-typegen`)

Generate strict TypeScript type declarations from any `silverc` artifact:

```bash
npx silly-typegen ./vesting.json --out ./vesting.d.ts
```

Generates:
- **`VestingEscrowState`**: Typed runtime state fields (with `bigint` for integers and timestamps).
- **`VestingEscrow<Entry>Args`**: Strongly-typed argument interfaces for each entrypoint.
- **`VestingEscrow<Entry>Tuple`**: Positional tuple signatures for entry invocations.
- **`VestingEscrowContract`**: Type-safe contract class wrapper.

Programmatic usage:
```javascript
const { generateTypes } = require('sillyscript');
const dts = generateTypes('./vesting.json');
```

---

## Module Overview

| Module | Purpose |
|---|---|
| `contract.js` | High-level `Contract` abstraction: state decoding, next-state derivation, input population |
| `provider.js` | Decoupled transport layer: `Provider`, `KaspaRestProvider`, and `MockProvider` |
| `silly-typegen.js` | CLI & programmatic generator for TypeScript contract declarations |
| `sil-abi.js` | SilverScript ABI artifact loader, template hash verification, tag derivation, state span decoder |
| `sil-encoder.js` | Push-level encoder: minimal pushes for args, explicit pushes for state, columnar struct arrays |
| `kaspa-crypto.js` | Kaspa CashAddr-variant Bech32 addresses, KIP-20 covenant IDs, P2SH (`aa20...87`) / P2PK formats |
| `kaspa-sighash.js` | Kaspa v1 sighash engine (16-field preimage + covenant binding commitments) |
| `kaspa-tx.js` | Tx assembly, computeBudget assignment, Schnorr signing, mass/fee estimation |

---

## Running Tests

```bash
npm test
```
Runs the full self-test suite across encoder, provider, type generation, crypto, sighash, transaction building, and contract abstraction.
