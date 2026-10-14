# Security Policy

## Status

sillyscript is testnet-first software. The mainnet path is not proven end to end
(see SAFETY.md and platform-pins.md). It signs transactions with a private key you
provide; it comes with no warranty. Do not use a key that holds funds you cannot lose.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository (Security tab, "Report a
vulnerability"). Do not open a public issue for a vulnerability. Include the affected
file, a minimal reproduction and, where relevant, a testnet-10 transaction id.

## Scope

In scope: the library and CLI in this repository (transaction building, sighash,
signing, covenant binding, genesis and artifact verification, fee and storage-mass
guards, scaffold templates).

Out of scope: contracts written or deployed by others using this toolkit, and the
upstream silverc compiler (report those to its own project).

## Supported versions

Only the latest release receives fixes.
