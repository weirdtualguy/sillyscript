# SSOT errata (found at merge, 2026-10)

The SSOT text is kept as imported (`modules.json` records the SHA-256 of the source `SSOT.md`); the only edit
is the banner at the top of `07-kcc20.md`. Where SSOT disagrees with a Final KCC (`docs/kcc/`) or with the
graded facts in `platform-pins.md`, the Final KCC / pins win. Nothing below was silently fixed.

| # | SSOT says | Final standard / evidence | Where |
| --- | --- | --- | --- |
| E1 | Owner modes `0x00` Schnorr pubkey, `0x01` P2SH script hash, `0x02` Covenant ID | KCC-2: `0x00` p2pk-schnorr, `0x01` p2pkh-schnorr, `0x02` p2pkh-ecdsa, `0x03` p2sh, `0x04` covenant-id; `0x05`-`0x7f` reserved, `0x80`-`0xff` custom | §11.2, §11.3 |
| E2 | KCC20 state `{ownerIdentifier byte[32], identifierType byte, amount int, isMinter bool}` ("42-byte header") | KCC-20 §1: `KCC20State {amount int, owner byte[32], owner_scheme byte, borrow_scheme byte, borrow_guard byte[32], extension_commitment byte[32]}`; default encoded state is 112 bytes | §11, §10, §15 (state traces) |
| E3 | "Borrower Path (0xFF)" selected by a witness mode byte `0xFF` | KCC-20 §2/§5: witness byte 0 is `0x00` (normal) or `0x01` (borrowed receive); any other value invalid. Borrow rules come from the state field `borrow_scheme`: `0x00` disabled, `0x01` amount-threshold, `0x02` schnorr-signature, `0x03` hash-chain; unassigned values invalid | §11.2, §11.3 |
| E4 | Entrypoints `transfer(...)` with per-input arrays and `delegateTransfer()` | KCC-20 §2: `transfer(KCC20State[],byte[])` (tag `79c71c23`) and `transfer_delegator(byte[])` (tag `fd3ef14a`); `max_token_inputs`/`max_token_outputs` default 3 | §11.2 |
| E5 | KCC20Minter presented as part of the canonical token architecture | KCC-20 defines no minter; issuance and any extended state sit behind `extension_commitment` (KCC-20 §4, KCC-1 §3.9). Treat KCC20Minter as an application pattern | §11.1, §11.4 |
| E6 | "KCC-01", "KCC-0001 / KCC-0020" | Canonical names are KCC-1, KCC-2, KCC-20 (files `kcc-0001.md` etc.) | passim |
| E7 | Header: "Version 1.2.0"; "§16-§23 added in v1.3" | The bundle contains both; the version line is inconsistent. It also names `facts.yaml`, `REPORT.md`, `MERGE_REPORT.md`, `code/` and `tools/`, which are not part of this repository | `00-index.md` |
| E8 | State fields "deterministic fixed/variable rules" (§10) | KCC-1 §3.7.1 allows `string` and `T[]` state. The sillyscript codec encodes fixed-width state only (gap G1 in `docs/KCC-CONFORMANCE.md`) | §10 |

Verified unchanged by the Final KCCs (codec test vectors pass): dispatch tag `BLAKE3("name(types)")[0..4]` with
records rendered as `{t1,t2}`; template hash `BLAKE3(LE64(len prefix) || prefix || LE64(len suffix) || suffix)`;
`PushMinimal` for arguments and `PushExplicit` for state; `int` state as 8-byte sign-magnitude LE; P2SH
`aa20 <blake2b(R)> 87`.
