# sillyscript documentation

Read in this order of authority. When two documents disagree, the earlier one wins.

| # | Document | What it is |
| --- | --- | --- |
| 1 | [`kcc/kcc-0001.md`](kcc/kcc-0001.md), [`kcc/kcc-0002.md`](kcc/kcc-0002.md), [`kcc/kcc-0020.md`](kcc/kcc-0020.md) | Final Kaspa Covenant Contract standards: byte layouts and ABI (KCC-1), authority schemes (KCC-2), fungible-token covenants (KCC-20). Imported verbatim. |
| 2 | [`../platform-pins.md`](../platform-pins.md) | Graded facts about the pinned toolchain (`silverc` c7d17a1) and testnet-10, each with its evidence. |
| 3 | [`../SillyBible.md`](../SillyBible.md) | How to build with sillyscript: the model, the laws, the patterns. |
| 4 | [`ssot/`](ssot/) | Single source of truth: the Kaspa Silverscript and Covenants knowledge base (fundamentals, KIPs, opcodes, language reference, worked examples, glossary). Teaching and reference material; see [`ssot/ERRATA.md`](ssot/ERRATA.md) for known conflicts with 1 and 2. |

Supporting files: [`KCC-CONFORMANCE.md`](KCC-CONFORMANCE.md) (what the codec proves against the KCCs),
[`../SAFETY.md`](../SAFETY.md) (mainnet rails), [`../SECURITY.md`](../SECURITY.md) (reporting),
[`../Files-Manifest.md`](../Files-Manifest.md) (inventory and test counts).

## SSOT modules

`ssot/NN-*.md` are the source; `modules.json` fixes their order. Build the single-file edition with
`node tools/ssot-build.js SSOT.md`. Pick modules by task using the attach table inside
[`ssot/00-index.md`](ssot/00-index.md). The index also names `facts.yaml`, `REPORT.md`, `MERGE_REPORT.md`,
`code/` and `tools/` from the original SSOT package; those are not part of this repository.

## KCC notes

The KCC files link to `kcc-0000.md` and to `kcc-0001/vectors/conformance.json` style files that are not
imported here. The vectors they contain are covered by `test-kcc1.js` and `test-kcc2-20.js`.
