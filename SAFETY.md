# Mainnet-First Development Safety Rails

## When to use mainnet vs testnet

| Operation | Network | Rationale |
|---|---|---|
| Compiling, artifact verification | offline | No network needed |
| Standard spends (P2PK transfers, fee discovery) | mainnet | REST works, compute_budget accepted |
| Covenant genesis (new contract deployment) | mainnet | One-time cost, your mainnet path is proven |
| Standard transitions (mint, list, buy) | mainnet | REST path proven by Reliks |
| NEW covenant version (first spend) | testnet | If the logic is wrong, no real funds locked |
| Destructive paths (close, burn, expire) | testnet | Can't un-burn mainnet funds |
| Negative tests (deliberately bad txs) | testnet | Free failures |

## Hard limits for mainnet development

- MAX_FEE_PER_TX = 5 KAS (50_000_000_000n sompi) — refuse above this
- MAX_TX_VALUE = 10 KAS during development — use a dedicated dev wallet
- DUST_ONLY_TESTING = true for new contract types — 1-2 KAS per UTXO
- COOL_DOWN = overnight re-read before any mainnet genesis (Bible §0.10)

## The dedicated dev wallet

Never develop from your main holding wallet. Create a separate key:
    PC_NET=mainnet PC_PRIV=<dedicated-dev-key> PC_WALLET=<its-address>

Fund it with 10-50 KAS. If a bug locks funds, the blast radius is bounded.
