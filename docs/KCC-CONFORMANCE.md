# KCC conformance of the sillyscript codec

Standards (all Status: Final, imported verbatim in `docs/kcc/`): KCC-1 (covenant concepts, byte layouts, ABI),
KCC-2 (authority schemes), KCC-20 (fungible-token covenant). Tests: `test-kcc1.js` (64 vectors),
`test-kcc2-20.js` (16 vectors); both run in `npm test`. The vectors are transcribed from the spec text; the
specs name `kcc-0001/vectors/conformance.json` etc. as authoritative, which are not in this repository.

| Area | Spec | Status |
| --- | --- | --- |
| BLAKE3 hash (unkeyed, keyed) | KCC-1 §6.1 | Tested |
| Canonical type names | KCC-1 §6.2 | Tested (`temporal` is a Silverscript type, not a KCC-1 type; it renders as `temporal` in dispatch preimages) |
| PushMinimal / PushExplicit, 0 to 65536-byte payloads | KCC-1 §6.3 | Tested |
| Scalar, array and record argument encodings, field grouping | KCC-1 §6.4, §6.5 | Tested |
| Dispatch tags (scalars, record arrays) | KCC-1 §6.6 | Tested |
| P2SH envelope, signature script layout | KCC-1 §6.7 | Tested |
| Fixed-width state encoding | KCC-1 §6.8 | Tested |
| Template hashes, template views, continuation program | KCC-1 §6.9-§6.11 | Tested |
| Authority values (P2PKH hashes, P2SH commitment, 20 \|\| value encodings) | KCC-2 §4.1 | Tested |
| KCC-20 dispatch tags, 112-byte state, transfer arguments, hash chain | KCC-20 vectors | Tested |
| KCC-2 §4.2 approval checks; KCC-20 borrow and transfer accept/reject cases | KCC-2, KCC-20 | Not tested: contract-level behaviour; needs a compiled KCC-20 program and the VM |
| Hash-committed virtual elements | KCC-1 §3.9, §6.12 | Not implemented (G2) |
| Variable-width state (`string`, `T[]`) | KCC-1 §3.7.1 | Not implemented (G1): `encodeState` rejects non-fixed-width fields |
| `int` range | KCC-1 §3.4.3 | Conforms: `-(2^63-1)..2^63-1`; `i64::MIN` is rejected |

Gaps G1 and G2 follow the pinned compiler (`silverc` c7d17a1), which emits fixed-width state; closing them needs
artifact-format support first.
