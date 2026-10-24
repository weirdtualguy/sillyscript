## 21. Token Standards in Context
<!-- id: tok-module | world: W5 | difficulty: 3 | prereqs: kcc20-two-contract-separation, covenant-id-lineage, lim-no-consensus-tokens | status: unverified | source: https://docs-kasplex.gitbook.io/krc20/tools-and-reference -->

§11 builds the KCC20 token as a pair of covenants. This module places it next to the other ways tokens are represented on Kaspa, so a learner can tell them apart and know when each is used. It is descriptive and neutral: it makes no claim about which is "better", and it contains no price, fee-level or market commentary. Details of third-party protocols were taken from their own public documentation and may have changed; anything not confirmed is marked `unverified`.

### 21.1 Four Ways to Represent a Token
<!-- id: tok-approaches | world: W5 | difficulty: 2 | prereqs: tok-module | status: unverified | source: https://docs-kasplex.gitbook.io/krc20/tools-and-reference -->

| id | Approach | Who defines validity | Where balances live | Status of the specification |
| --- | --- | --- | --- | --- |
| tok-ap-inscription | **Inscription-style indexer protocol** (KRC-20 from the Kasplex project) | An off-chain **indexer** applying the protocol's rules | In the indexer's database, derived from on-chain operation data | Third-party protocol, independent of the Kaspa core project |
| tok-ap-covenant | **Covenant token** (KCC20 and KCC20Minter, §11) | The **covenant scripts**, executed by L1 consensus on every spend | In UTXO redeem script state (the 42-byte header, §10.3) | KCC-0001/KCC-0020 conventions; "merged Draft" per a third-party decoder's documentation |
| tok-ap-based | **Based-app token** (state kept by an off-chain runtime, settled by ZK proof; §6, §7, §22) | The proven runtime transition, checked by a settlement covenant | In an off-chain state root committed in a settlement covenant | Architecture available; no specific token standard established in the sources consulted (`unverified`) |
| tok-ap-community | **Community extensions** (for example NFT packs built on covenant conventions) | Varies | Varies | Experimental third-party tooling (`unverified`) |

The first three differ in the single question that matters most: **what makes a transfer valid?**

### 21.2 How the Inscription-Style Protocol Works
<!-- id: tok-inscription-how | world: W5 | difficulty: 3 | prereqs: tok-approaches, p2sh-state-covenant-lifecycle | status: unverified | source: https://docs-kasplex.gitbook.io/krc20/tools-and-reference -->

From the protocol's public indexer documentation:

1. A token operation is written into the `signature_script` of a transaction input that spends a P2SH output (a **commit then reveal** pattern: first create the P2SH output, then spend it and reveal the operation).
2. The indexer scans every block, keeps P2SH outputs, and inspects the signature script of each transaction's first input for the protocol's markers.
3. On a match, the indexer parses the operation, updates its balance records, and stores token metadata (name, supply, deployer-defined properties).
4. Validity rules live in the indexer, for example: a ticker has a defined length range and cannot be redeployed, and a transfer larger than the sender's balance at that moment is invalid and changes nothing.

Kaspa consensus validates only the carrier transaction (signatures, inputs, mass). It has no notion of the token, so an operation the indexer rejects is still a perfectly valid Kaspa transaction.

### 21.3 How the Covenant Token Works (Recap)
<!-- id: tok-covenant-how | world: W5 | difficulty: 3 | prereqs: tok-approaches, contract-kcc20, kcc20-lifecycle-mint-shape | status: mainnet | source: ssot §11.1 -->

In §11, each token cell is a UTXO whose redeem script carries `ownerIdentifier`, `identifierType`, `amount` and `isMinter`. A transfer is a spend of covenant cells that must satisfy the `KCC20` script (conservation `totalIn == totalOut`, authentication by ownership mode, no minter escalation). The `KCC20Minter` controller governs issuance. Consensus enforces Covenant ID lineage (§5.1); the scripts enforce the token rules. An indexer or wallet still reads UTXOs to *display* balances, but it cannot make an invalid transfer valid or valid one invalid.

### 21.4 Side-by-Side Comparison
<!-- id: tok-compare | world: W5 | difficulty: 3 | prereqs: tok-inscription-how, tok-covenant-how | status: unverified | source: https://docs-kasplex.gitbook.io/krc20/tools-and-reference -->

| id | Dimension | Inscription-style indexer protocol | Covenant token (KCC20) | Based-app token |
| --- | --- | --- | --- | --- |
| tok-cmp-trust | **Trust model** | Trust that indexers apply the same rules and agree; the protocol's own roadmap lists synchronization between indexers as future work | Trust the contract bytes (audit the template via `template_hash`); no one can bypass them | Trust the proof system, the pinned program id, and the operator's data availability |
| tok-cmp-state | **Where state lives** | Off-chain database | In UTXO state, inside redeem scripts | Off-chain state root; only a commitment on L1 |
| tok-cmp-validation | **Who validates a transfer** | The indexer, after the fact | L1 consensus runs the scripts at spend time | L1 verifies a ZK proof at settlement, not each transfer |
| tok-cmp-fail | **If a rule is violated** | Indexer ignores the operation; L1 still includes the carrier transaction | The transaction is rejected | The settlement spend is rejected |
| tok-cmp-compose | **Composability** | Through the indexer's own rules | Atomic co-spending with other covenants (ICC, §13.3) | Through the app runtime |
| tok-cmp-cost | **Cost drivers** | Carrier transactions (commit and reveal) priced by mass; protocol-defined minimum fees set by the indexer rules (amounts `unverified`, may change) | Mass of each token UTXO (storage mass, §18.5), `compute_budget` per spend (§18.3), KAS value locked in each cell | Proof verification units (§18.4) plus lane transaction mass; proving costs off-chain |
| tok-cmp-footprint | **UTXO footprint** | Operations leave ordinary transactions; balances are not UTXOs | One live UTXO per token cell; the `0xFF` path reduces new-cell creation (§11.3, §18.6) | One settlement UTXO |
| tok-cmp-upgrade | **Rule changes** | The indexer implementation can change its rules | Fixed by the deployed template; a new template is a new family | Fixed by the pinned program, changed by redeploying |
| tok-cmp-maturity | **Maturity (per the sources)** | In use; documentation by its own project | Silverscript and KCC specs are drafts or experimental; tooling still moving | Early; runtimes described as evolving |

### 21.5 Cost Notes
<!-- id: tok-costs | world: W5 | difficulty: 3 | prereqs: tok-compare, fee-mass-module | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->

The cost table above names drivers, not amounts, because amounts change with network conditions and protocol rules. What the SSOT lets you compute exactly is the *shape* of covenant-token cost: creating a new small token cell can be storage-mass dominated (§18 Example M1: `1,000,102` grams), while topping up an existing cell is not (§18 Example M2: `1` gram). That difference is the reason the `0xFF` Borrower Path exists.

### 21.6 When Each Approach Is Used
<!-- id: tok-when | world: W5 | difficulty: 2 | prereqs: tok-compare | status: pedagogical | source: ssot §14 -->

| id | If the requirement is… | A natural fit | Reason |
| --- | --- | --- | --- |
| tok-when-l1-rules | Supply and transfer rules must be enforced by L1, with no reliance on an indexer for validity | Covenant token | Scripts run at spend time |
| tok-when-composition | The token must be spent atomically together with other contracts | Covenant token | Co-spending (ICC) in one transaction |
| tok-when-light | Minimal on-chain footprint and an existing indexer ecosystem are acceptable, and validity may rest on indexer rules | Inscription-style protocol | Operations are ordinary transactions |
| tok-when-contention | Thousands of users update one shared balance sheet | Based-app design | Avoid a single contended UTXO (§12.2) |
| tok-when-simple | A simple non-contended workflow | Pure L1 covenant | Avoid unnecessary prover complexity (§12.2, §14) |

### 21.7 Interoperability Conventions
<!-- id: tok-interop | world: W5 | difficulty: 3 | prereqs: script-layout-template-hash, kcc20-ownership-modes-borrower | status: proposed | source: https://docs.rs/kascov-decode -->

KCC-0001 (template and byte-layout conventions) and KCC-0020 (the fungible token convention) are specified in the `kccs` repository; a third-party decoder documents both as "merged Draft" at a specific commit and implements readers for KCC-20 token cells, including live launchpad and market builds observed on mainnet and testnet-10. Practical consequences:

- A wallet needs the template prefix and suffix, state layout and `template_hash` (§10.1) to recognize a token cell.
- Two implementations are interoperable only if they use the same dispatch tags and template hashing; third-party documentation shows that earlier compiler output used different selectors and hash functions (§17.4).
- Because the specifications are drafts, check the repository before treating any byte layout as final.

### 21.8 Glossary Additions for §21
<!-- id: tok-glossary-additions | world: W5 | difficulty: 1 | prereqs: tok-module | status: unverified | source: https://docs-kasplex.gitbook.io/krc20/tools-and-reference -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| tok-gloss-indexer | **Indexer** | A program that reads the chain and keeps its own table of who owns what. | Off-chain service deriving state from blocks and transactions; authoritative for validity only in indexer-defined protocols. |
| tok-gloss-commit-reveal | **Commit then reveal** | First lock coins behind a hash, then open the lock and show the data. | P2SH output creation followed by a spend whose `signature_script` reveals the payload. |
| tok-gloss-inscription | **Inscription-style protocol** | A token system where the rules live outside the chain, in the indexer. | Operation data carried in transactions and interpreted by indexer rules. |
| tok-gloss-token-cell | **Token cell** | One envelope that holds some amount of one token. | A covenant UTXO whose state holds an owner, an amount and a minter flag (§10.3). |

