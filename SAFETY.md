# Mainnet-First Development Safety Rails

## When to use mainnet vs testnet

| Operation | Network | Rationale |
|---|---|---|
| Compiling, artifact verification | offline | No network needed |
| Standard P2PK spends, fee discovery | mainnet | REST path proven |
| Covenant genesis (scaffold) | testnet first | Scaffold mainnet path UNPROVEN — wRPC is env-gated, no public default (below) |
| Standard covenant transitions | mainnet | REST path proven by the Reliks era (pre-sillyscript stack) |
| NEW covenant version (first spend) | testnet | Wrong logic must not lock real funds |
| Destructive paths (close, burn, expire) | testnet | Cannot un-burn mainnet funds |
| Negative tests | testnet | Free failures |

## Transport reality (pins 4.3, 4.8; kaspa-wrpc.js)

- Testnet covenant transactions REQUIRE wRPC: testnet REST drops
  compute_budget ("script-units limit=9999"). The scaffold broadcasts
  via wRPC on every network.
- Mainnet REST accepts compute_budget (Reliks-era proven).
- Mainnet wRPC has NO hardcoded public endpoint: set PC_MAINNET_WRPC in
  .env, or mainnet broadcast fails with "all endpoints failed".

## Hard limits — enforced vs aspirational (audited Oct 5)

| Limit | Value | Status |
|---|---|---|
| MAX_FEE_PER_TX | 5 KAS (50_000_000_000n sompi) | ENFORCED in scaffold scripts: hard abort before broadcast, plus a >2x-intent gate (abort on mainnet, warn on testnet). NOT enforced in library code. |
| MAX_TX_VALUE | 10 KAS during development | ASPIRATIONAL — nothing enforces it |
| DUST_ONLY_TESTING | 1-2 KAS per UTXO for new contract types | ASPIRATIONAL — nothing enforces it |
| COOL_DOWN | overnight re-read before mainnet genesis | PROCESS rule — human discipline (Bible 0.10) |

Do not assume a limit is code-enforced unless this table says so.

## The dedicated dev wallet

Never develop from your main holding wallet. Create a separate key:

    PC_NET=mainnet PC_PRIV=<dedicated-dev-key> PC_WALLET=<its-address>

Fund it with 10-50 KAS. If a bug locks funds, the blast radius is bounded.
