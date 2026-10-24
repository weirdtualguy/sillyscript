# Kaspa Silverscript & Covenants — Single Source of Truth (SSOT) v1.2

**Version:** 1.2.0 | **Compiled:** 2026-10-14 | **Purpose:** Complete, standalone technical specification and pedagogical reference for the Kaspa community educational curriculum (SillyKuest) and Toccata smart-contract engineering, covering Kaspa BlockDAG fundamentals, Transaction V1, KIPs 16, 17, 20, 21, 24, and 25, the Silverscript language and compiler ABI, Covenant Declarations (DECL), KCC20 and KCC20Minter architectures, and security verification patterns.

**Changelog Summary (v1.1 to v1.2):** This edition introduces Section 0 covering BlockDAG and GHOSTDAG mechanics, the Kaspa mass model, and the canonical Envelope Metaphor Mapping. It resolves KIP-20 Genesis versus Continuation semantics for OpAuthOutput\* and OpCovOutput\*, integrates KIP-21 MergesetContextHash, MinerPayloadRoot, and OpChainblockSeqCommit (0xd4), and adds KIP-25 compute-gram pricing mechanics. It formalizes Silverscript State struct synthesis, entry versus function dispatch, unified casting semantics, and full KIP-17 introspection bindings. Furthermore, it audits, patches, and expands all nine canonical reference contracts (P2PK, TransferWithTimeout, Mecenas, Counter, SingletonTermination, PotSplitter, VaultNM, KCC20, and KCC20Minter) alongside the KCC20 Borrower Path (0xFF), and embeds the complete 51-opcode master table, 56-term dual-layer glossary, concrete byte-encoding traces, and annotated security bug bank.

**How to use this knowledge base (for AI assistants)**

1. This knowledge base is canonical. Answer lesson, quiz, and contract questions from it.
2. Do not invent opcodes, syntax, hex values, or numbers. If something is missing or conflicting, say so instead of guessing.
3. Cite section IDs when answering: the `id` in the metadata comment under each heading (for example `tx-compute-budget`). The original section number (for example §3.2) may be added.
4. Canonical constants live in `facts.yaml`. The prose keeps the same numbers so lessons stay readable. If prose and `facts.yaml` disagree, report the disagreement instead of choosing one. Known disagreements are listed in `REPORT.md`.
5. Attach only the modules needed (file map below). Always attach this file.
6. `status` values record what the document itself states, not an external check. `unverified` means the document does not say.

**Covered sections:** §0–§23 plus Appendices A–C (Appendix D is in `CHANGELOG.md`). §0–§15 are the original sections; §16–§23 are the coverage modules added in v1.3 (`12-` to `19-`).

**File map**

| File | Covers (original sections) | Attach when |
| --- | --- | --- |
| `00-index.md` | Entry point: rules, file map, legends, provenance | Always |
| `01-fundamentals.md` | §0 fundamentals and Envelope Model, §1 overview/architecture/repos, §2 UTXO and covenant fundamentals | Orientation, World 1 lessons |
| `02-transaction-v1.md` | §3 Transaction V1, compute budget, commitments, subnetwork IDs | Tx fields, compute_budget, txid/sighash, lanes |
| `03-opcodes.md` | §4 opcode tables and script limits | Opcode or hex questions, introspection lessons |
| `04-kips.md` | §5 KIP-20, §6 KIP-21, §7 KIP-16 | Covenant IDs, lanes and sequencing, ZK precompiles |
| `05-silverscript-ref.md` | §8 heading, §8.1–§8.6 | Syntax, types, loops, time locks, built-ins, casting |
| `06-contracts.md` | §8.7 stateless contracts, §9 covenant declarations and stateful contracts, §10 ABI and encoding | Contract lessons, `#[covenant]` rules, byte encoding |
| `07-kcc20.md` | §11 KCC20 and KCC20Minter (prose and key excerpts; full listings in `code/`) | Token and minter lessons |
| `08-security-patterns.md` | §12 security and bug-hunt bank, §13 patterns | Bug-step quizzes, audits, pattern lessons |
| `09-agent-brief.md` | §14 agent brief | Triage of L1 covenant vs Based App, agent setup |
| `10-glossary.md` | §15 dual-layer glossary | Glossary edits, term definitions |
| `11-appendices.md` | Appendix A opcode quick reference, B KIP status matrix, C curriculum world map | Lesson planning (Appendix C), quick lookups |
| `12-addresses-networks.md` | §16 addresses and networks: address anatomy, version bytes, encoding, network prefixes and ports, address to `script_public_key`, decoding errors | Address, network-prefix or endpoint questions, World 1 address lessons |
| `13-workflow-tooling.md` | §17 workflow and tooling: write, compile, debug, instantiate, run a node, fund, deploy, spend, verify; testnet vs. mainnet checklist; error table | Workflow, CLI and tooling questions, "how do I deploy" lessons |
| `14-fees-mass-worked-examples.md` | §18 fees and mass: worked examples for script units, budget sizing, ZK budgets, KIP-9 storage mass, the Borrower Path in numbers, fee computation | Fee, mass and `compute_budget` questions, quiz numbers |
| `15-tx-walkthrough.md` | §19 end-to-end transaction walkthrough: deploy (Genesis) and spend (Continuation) of a Counter, state and script bytes, hostile-spender attempts | Step-by-step transaction lessons, byte-level and hash-level questions |
| `16-toccata-limits.md` | §20 what Toccata does not allow: execution model, control flow, size and resource limits, what a script cannot see, Silverscript declaration rules, proofs; quiz seeds | "Can a covenant do X?" questions, limits quizzes |
| `17-token-standards.md` | §21 token standards in context: four ways to represent a token, inscription-style protocol vs. covenant token, comparison, cost notes, interoperability | Token comparison questions, World 5 context |
| `18-zk-based-apps-primer.md` | §22 ZK and based-apps primer: what a proof solves, on-chain verification checks, Groth16 vs. RISC Zero STARK, based apps, SeqCommit lanes, settlement journal, inline ZK vs. based app | Beginner ZK or Based App lessons, World 6 |
| `19-misconceptions.md` | §23 common misconceptions, grouped by theme (UTXO thinking, covenants, fees, cryptography, language, networks and tooling) | Beginner misconception lessons, boss-fight and quiz distractors |
| `facts.yaml` | Canonical constants (hex, dates, sizes, benchmarks, KIPs); the `coverage_additions` group holds the constants of §16–§23, each with a `source` | Quiz writing, any numeric or hex question |
| `CHANGELOG.md` | Appendix D audit changelog and the v1.3 merge entry | Version history |
| `REPORT.md` | Restructure report, coverage report for §16–§23, consolidated lists of `unverified` items, draft values and possible SSOT issues | Maintainer review only |
| `MERGE_REPORT.md` | Merge log: ID renames, `sec:` resolutions, code renames, fact conflicts, cross-checks between §0–§15 and §16–§23 | Maintainer review only |
| `code/` | Full `.sil` listings (`code-kcc20`, `code-kcc20-minter`) and the Python scripts referenced by §16 and §18 (`kaspa_address_encode.py`, `fee_mass_examples.py`; `check_additions.py` is the coverage package's own self-check) | When the full source is needed |
| `media/` | Images referenced by the modules | Rendering |
| `tools/` | `build.py`, `check.py`, `diff_original.py` (plus the heading manifests `original_headings.txt` and `additions_headings.txt`) | Maintenance |

**Which files to attach for which task**

| Task | Attach |
| --- | --- |
| Lesson writing | `00-index.md`, `11-appendices.md` (Appendix C), the modules for the sections cited there, `10-glossary.md` for terms |
| Quiz writing | As for lessons, plus `facts.yaml` and `08-security-patterns.md` (bug-hunt bank) |
| Contract questions | `05-silverscript-ref.md`, `06-contracts.md`, `07-kcc20.md`; add `04-kips.md` for covenant IDs and `code/` for full listings |
| Security review | `08-security-patterns.md`, `06-contracts.md`, `07-kcc20.md`, `04-kips.md`, `05-silverscript-ref.md` |
| Glossary edits | `10-glossary.md`, `facts.yaml` |
| Opcode or hex lookups | `03-opcodes.md`, `facts.yaml` |
| Transaction field questions | `02-transaction-v1.md`, `facts.yaml` |
| Workflow or CLI questions (write, compile, debug, deploy, verify) | `13-workflow-tooling.md`, `12-addresses-networks.md`; add `05-silverscript-ref.md` and `06-contracts.md` (ABI) for syntax and artifacts |
| Fee, mass or `compute_budget` questions | `14-fees-mass-worked-examples.md`, `02-transaction-v1.md`, `facts.yaml`; add `01-fundamentals.md` (§0.3 mass model) |
| Address or network questions | `12-addresses-networks.md`, `facts.yaml` |
| Step-by-step transaction walkthroughs | `15-tx-walkthrough.md`, `06-contracts.md`, `04-kips.md` (§5.2 Genesis hash), `14-fees-mass-worked-examples.md` |
| What Toccata cannot do | `16-toccata-limits.md`; add `03-opcodes.md` and `06-contracts.md` for the underlying rules |
| Token standard comparisons | `17-token-standards.md`, `07-kcc20.md`, `14-fees-mass-worked-examples.md` |
| ZK primer or Based App triage | `18-zk-based-apps-primer.md`, `04-kips.md`, `09-agent-brief.md`; add `facts.yaml` for proof costs |
| Beginner misconceptions | `19-misconceptions.md`, `01-fundamentals.md`, `16-toccata-limits.md` |

**Status legend** (`status:` in the metadata comment; derived only from what the document itself states)

| Value | Meaning |
| --- | --- |
| `mainnet` | The document says it is active on mainnet |
| `testnet` | The document says it is testnet only |
| `proposed` | The document says it is a proposal, not active |
| `pedagogical` | Teaching analogy or curriculum material, not a consensus claim |
| `unverified` | The document does not say. In modules 12–19 it also marks claims the coverage package could not check against a primary source (see the coverage section of `REPORT.md`) |

**Metadata field legend** (comment line directly under every `##`, `###`, `####` heading)

`<!-- id: <slug> | world: <W1–W6 | unmapped> | difficulty: <1–5> | prereqs: <ids | none> | status: <value> [| source: <URL | unverified | ssot §N.N>] -->`

- `id`: unique, lowercase, hyphenated, independent of section numbers. Never reuse or change an ID.
- `world`: from Appendix C. Several worlds are comma-separated. `unmapped` means Appendix C does not reference the section. `##` containers show the union of their descendants.
- `difficulty` and `prereqs`: draft values pending maintainer review. Prereqs reference existing IDs.
- `source` (optional, modules 12–19 only; the original modules have none): where the section's content is supported. A URL, the word `unverified` (no source was consulted), or `ssot §N.N` (the only support is that existing SSOT section). `check.py` accepts it but does not require it.
- Other IDs: modules 12–19 also carry IDs in the first (`id`) column of their tables (glossary additions, error tables, limits, misconceptions, worked-example inputs) and in standalone metadata comments placed before bold example paragraphs; these behave like heading IDs for `prereqs` and `where_used`. Glossary terms use the `ID (id)` column of `10-glossary.md`; bug-hunt items use `BUG-01`…`BUG-08`; code listings use `code-…`; opcode row groups are the `#### Category` headings; canonical contracts are the `Contract N` headings.
- Original section numbers are kept in headings, so references such as §9.8 still work.

**See also**: `facts.yaml` (constants), `CHANGELOG.md` (Appendix D and v1.3 entry), `code/` (full listings), `REPORT.md` (findings), `MERGE_REPORT.md` (merge log and cross-checks).

**Provenance**

compiler/silverscript version: unverified | rusty-kaspa version/commit: unverified | KIP spec revisions: unverified | last verified against sources: unverified

