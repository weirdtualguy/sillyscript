## Appendix D: Audit Changelog (v1.1 \rightarrow v1.2)
<!-- id: appendix-audit-changelog | world: unmapped | difficulty: 1 | prereqs: none | status: unverified -->

| # | Audit Finding / Curriculum Gap | Resolution in SSOT v1.2 |
| --- | --- | --- |
| 1 | Missing foundational Kaspa BlockDAG, GHOSTDAG, sompi, and Mass Model reference | Added §0.1–§0.3 covering block_daa_score, blue_score, UtxoEntry, and KIP-9/KIP-25 mass dimensions. |
| 2 | Missing Envelope Metaphor Mapping for World 1 (w1.js) | Added §0.4 mapping every physical envelope analogy to its formal consensus/Silverscript primitive. |
| 3 | Premature balance drain bug in Mecenas (change <= pledge + minerFee) | Fixed condition to if (change < pledge + minerFee) in §8.7 and documented stateless vs. stateful continuation. |
| 4 | Unchecked `leader_sig`, input invariants, and negative output amounts in `VaultNM` | Patched `VaultNM` in `§9.8` with `checkSig(leader_sig, ...)`, input `owner`/`round` checks, and `new_states[i].amount >= 0`. |
| 5 | Negative-amount splitting exploit in PotSplitter (examples.js) | Promoted PotSplitter to §9.7 with require(new_states[i].amount > 0); inside the fan-out loop. |
| 6 | Counter and SingletonTermination existed only as unverified sketches | Promoted full Counter (macro + manual validateOutputState forms) and SingletonTermination to §9.5–§9.6. |
| 7 | Missing contract bodies for KCC20 and KCC20Minter in §11 | Added complete, annotated Silverscript implementations for KCC20 (with 0xFF Borrower Path) and KCC20Minter in §11.2–§11.4. |
| 8 | Collision between Genesis auth_outputs (§5.2) and OpAuthOutput\* (§5.4) | Added disambiguation matrix in §5.3 clarifying OpAuthOutput\*, OpOutputCovenantId, and OpCovOutput\* across Genesis vs. Continuation. |
| 9 | Missing hex byte for OpChainblockSeqCommit and legacy opcodes | Added 0xd4 for OpChainblockSeqCommit, 0xac for OpCheckSig, 0xaa for OpBlake2b, and consolidated all 51 opcodes in §4.1. |
| 10 | Missing KIP-21 MergesetContextHash and MinerPayloadRoot specifications | Expanded §6.2–§6.3 with exact KIP-21 formulas and reactivation anchoring semantics. |
| 11 | Undocumented State struct synthesis, entry vs. function, and unified casting rules | Expanded §8.1, §8.5, and §8.6 with complete type-casting tables, builtin signatures, and KIP-17 property mappings. |
| 12 | Glossary (§15) had only 21 technical terms vs. 56 dual-layer terms in glossary.js | Upgraded §15 to the complete 56-term dual-definition master table (id, term, Plain-English, and Formal Specification). |
| 13 | Missing concrete byte-encoding examples and security bug-hunt bank | Added 42-byte KCC20 state layout trace in §10.3 and 8-item annotated curriculum Bug-Hunt Bank in §12.3. |