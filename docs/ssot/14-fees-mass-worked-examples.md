## 18. Fees & Mass: Worked Examples
<!-- id: fee-mass-module | world: W1 | difficulty: 3 | prereqs: tx-mass-model, tx-compute-budget | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->

This module turns the formulas in §0.3 (mass model) and §3.2 (compute budget) into step-by-step arithmetic. Every example lists its **inputs**, the **formula**, the **steps** and the **result**. All arithmetic is reproduced and asserted by `code/fee_mass_examples.py`, which uses integer (floor) division exactly as the KIP-9 pseudo-code does. Example amounts, sizes and script-unit totals are **illustrative**; the constants and formulas come from the sources named in each subsection. Nothing here is a price or fee recommendation.

### 18.1 Conventions and Constants
<!-- id: fee-constants | world: W1 | difficulty: 2 | prereqs: utxo-anatomy-sompi, tx-mass-model | status: mainnet | source: https://docs.kaspa.org/toccata/script-pricing -->

| id | Constant | Value | Source | Notes |
| --- | --- | --- | --- | --- |
| fee-const-su-per-budget | Script units per `compute_budget` step | `10,000` | Script Pricing guide; SSOT §3.2 | `1 compute_budget = 100 compute grams = 10,000 script units` |
| fee-const-grams-per-budget | Compute grams per `compute_budget` step | `100` | Script Pricing guide | New relative to the SSOT |
| fee-const-su-per-gram | Script units per compute gram | `100` | Script Pricing guide | New relative to the SSOT |
| fee-const-free-allowance | Free script units per input | `9,999` | Script Pricing guide; SSOT §3.2 | Added once per input |
| fee-const-sig-su | One signature verification attempt | `100,000` script units | Script Pricing guide | Applies to Schnorr and ECDSA checks |
| fee-const-hash-su | Hashing | `OpBlake2b`: 2 per byte; `OpBlake3`: 1 per byte; `OP_SHA256`: 1 per byte | Script Pricing guide | Keyed variants cost the same per data byte |
| fee-const-push-su | Newly pushed stack bytes | 1 per byte | Script Pricing guide | |
| fee-const-groth16-su | Groth16 verification (tag `0x20`) | `14,000,000 + 250,000 × (public inputs + 1)` script units | Script Pricing guide | |
| fee-const-stark-su | RISC Zero Succinct verification (tag `0x21`) | `25,000,000` script units | Script Pricing guide | |
| fee-const-storage-c | KIP-9 storage mass parameter `C` | `10^12` (sompi-based) | KIP-9 | New relative to the SSOT |
| fee-const-min-feerate | Minimum fee rate | `1.0` sompi per gram | Integrating-with-Kaspa fee guide | A rate above `1.0` buys priority |
| fee-const-legacy-mass | Pre-Toccata compute-mass constants | `1` per tx byte, `10` per output script-public-key byte, `1000` per sig-op | rusty-kaspa mass module (via documentation) | Used for the size and output terms below; see §18.7 caveat |

Two identities used repeatedly: $\text{allowance}(b) = b \times 10{,}000 + 9{,}999$ script units (§3.2), and the minimum budget covering a requirement of $R$ script units:

$$b_{\min}(R) = \left\lceil \frac{\max(0,\; R - 9{,}999)}{10{,}000} \right\rceil$$

### 18.2 Script Units from a Budget
<!-- id: fee-ex-allowance | world: W1 | difficulty: 2 | prereqs: fee-constants, tx-compute-budget | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->

<!-- id: fee-ex-allowance-table | world: W1 | difficulty: 2 | prereqs: fee-ex-allowance | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example A: allowance table.** *Input:* a `compute_budget` value $b$. *Formula:* $b \times 10{,}000 + 9{,}999$.

| `compute_budget` | Calculation | Script units granted |
| ---: | --- | ---: |
| `0` | $0 + 9{,}999$ | `9,999` |
| `1` | $10{,}000 + 9{,}999$ | `19,999` |
| `10` | $100{,}000 + 9{,}999$ | `109,999` |
| `2,500` | $25{,}000{,}000 + 9{,}999$ | `25,009,999` |
| `65,535` | $655{,}350{,}000 + 9{,}999$ | `655,359,999` |

The last row is the largest value a `u16` budget can carry (§3.1): no input can ever be granted more than `655,359,999` script units.

### 18.3 Sizing a Budget
<!-- id: fee-ex-sizing | world: W3 | difficulty: 3 | prereqs: fee-ex-allowance | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->

<!-- id: fee-ex-boundaries | world: W3 | difficulty: 2 | prereqs: fee-ex-sizing | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example B: boundary cases.** *Formula:* $b_{\min}(R)$ above.

| Required $R$ | $R - 9{,}999$ | Divide by `10,000`, round up | Minimum budget |
| ---: | ---: | ---: | ---: |
| `0` | negative → `0` | `0` | `0` |
| `9,999` | `0` | `0` | `0` |
| `10,000` | `1` | `1` | `1` |
| `19,999` | `10,000` | `1` | `1` |
| `20,000` | `10,001` | `2` | `2` |

<!-- id: fee-ex-single-signature | world: W3 | difficulty: 3 | prereqs: fee-ex-sizing, canonical-stateless-contracts | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example C: one signature check (the `P2PK` input).** *Input:* a spend whose script verifies one signature, costing `100,000` script units (§18.1).
*Steps:* $100{,}000 - 9{,}999 = 90{,}001$; $90{,}001 / 10{,}000 = 9.0001$; round up to `10`.
*Check:* $\text{allowance}(9) = 99{,}999 < 100{,}000$ (one script unit short), while $\text{allowance}(10) = 109{,}999 \ge 100{,}000$.
*Result:* `compute_budget = 10`, which is `10 × 100 = 1,000` compute grams (the same as $100{,}000 / 100$).
**This conflicts with the sentence in §3.2** saying that `compute_budget = 0` "suffices for simple stateless signature checks (`P2PK`)". With the official pricing table, `0` grants only `9,999` units, below one signature verification. See `REPORT-coverage.md`, "Possible SSOT issues", and the `conflicts` entry in `facts-additions.yaml`.

<!-- id: fee-ex-counter-spend | world: W3 | difficulty: 3 | prereqs: fee-ex-sizing, contract-counter | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example D: sizing the `Counter` spend.** The `Counter` entry (§9.5) checks no signature. *Assumed inputs* (illustrative, not measured): redeem script of `S = 300` bytes; two BLAKE2b hashes of the redeem script (one by the P2SH check, one when `validateOutputState` rebuilds the successor lock); `1,000` newly pushed stack bytes in total.
*Formula:* $R = 2 \times S + 2 \times S + 1{,}000$ (BLAKE2b at 2 units per byte, twice, plus pushes at 1 unit per byte).
*Steps:* $2 \times 300 = 600$; $600 + 600 + 1{,}000 = 2{,}200$.
*Result:* $R = 2{,}200 \le 9{,}999$, so the `Counter` input needs `compute_budget = 0`.
The fee-paying P2PK input in the same transaction needs its own budget: $R = 100{,}000 + 66 = 100{,}066$ (one signature plus an assumed `66`-byte signature push), and $\lceil (100{,}066 - 9{,}999)/10{,}000 \rceil = \lceil 9.0067 \rceil = 10$. Each input is budgeted separately.

<!-- id: fee-ex-hand-sizing | world: W3 | difficulty: 3 | prereqs: fee-ex-sizing | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example E: the official hand-sizing example.** *Inputs:* one signature (`100,000`), 2 KB of BLAKE3 hashing (`2,048` at 1 unit per byte), about 1 KB of new stack bytes (`1,024`). *Steps:* $100{,}000 + 2{,}048 + 1{,}024 = 103{,}072$; $103{,}072 - 9{,}999 = 93{,}073$; $93{,}073 / 10{,}000 = 9.3073$; round up. *Result:* `compute_budget = 10`.

### 18.4 Budgets for ZK Verification
<!-- id: fee-ex-zk | world: W6 | difficulty: 4 | prereqs: fee-ex-sizing, kip16-proof-systems | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->

<!-- id: fee-ex-stark-budget | world: W6 | difficulty: 4 | prereqs: fee-ex-zk | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example F: RISC Zero Succinct (`0x21`).** *Formula:* $b_{\min}(25{,}000{,}000)$. *Steps:* $25{,}000{,}000 - 9{,}999 = 24{,}990{,}001$; divided by `10,000` is $2{,}499.0001$; round up. *Result:* `compute_budget = 2,500`, granting `25,009,999` units. The SSOT's figure of about `25,000,039` metered units (§3.2) also fits: $24{,}990{,}040 / 10{,}000 = 2{,}499.004 \to 2{,}500$, leaving a margin of $25{,}009{,}999 - 25{,}000{,}039 = 9{,}960$ units. In grams: $2{,}500 \times 100 = 250{,}000$ compute grams.

<!-- id: fee-ex-groth16-budget | world: W6 | difficulty: 4 | prereqs: fee-ex-zk | status: pedagogical | source: https://docs.kaspa.org/toccata/script-pricing -->
**Example G: Groth16 (`0x20`) by number of public inputs $p$.** *Formula:* $R = 14{,}000{,}000 + 250{,}000 \times (p + 1)$, then $b_{\min}(R)$.

| Public inputs $p$ | $R$ (script units) | Minimum `compute_budget` |
| ---: | ---: | ---: |
| `0` | `14,250,000` | `1,425` |
| `1` | `14,500,000` | `1,450` |
| `2` | `14,750,000` | `1,475` |
| `5` | `15,500,000` | `1,550` |
| `10` | `16,750,000` | `1,675` |

The `p = 5` row matches the official guide's own example. Note that the *latency* ratios in §7.1 (about `134×` and `738×` ECDSA) are **not** the script-unit ratios: `25,000,000 / 100,000 = 250` signature-equivalents for the STARK, and `14,500,000 / 100,000 = 145` for a one-input Groth16.

### 18.5 KIP-9 Storage Mass
<!-- id: fee-ex-storage-mass | world: W1 | difficulty: 4 | prereqs: tx-mass-model, fee-constants | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->

**Formula (integer form, from the KIP-9 pseudo-code).** Let $I$ be the input values and $O$ the output values in sompi, $C = 10^{12}$.

$$P = \sum_{o \in O} \left\lfloor \frac{C}{o} \right\rfloor \qquad N = \begin{cases} \sum_{v \in I} \lfloor C / v \rfloor & \text{if } |O| = 1 \text{ or } |O| \le |I| \le 2 \\ |I| \cdot \left\lfloor \dfrac{C}{\lfloor \sum I / |I| \rfloor} \right\rfloor & \text{otherwise} \end{cases} \qquad \text{storage\_mass} = \max(P - N,\; 0)$$

The first branch is the "relaxed" formula; KIP-9 says it may be used when $|O| \le |I| \le 2$ or $|O| = 1$.

<!-- id: fee-ex-compounding | world: W1 | difficulty: 3 | prereqs: fee-ex-storage-mass | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example H: compounding (2 inputs → 1 output).** *Inputs:* $I = \{500{,}000{,}000,\; 500{,}000{,}000\}$ (two 5 KAS inputs), $O = \{999{,}900{,}000\}$ (0.001 KAS fee). $|O| = 1$ → relaxed branch.
*Steps:* $P = \lfloor 10^{12} / 999{,}900{,}000 \rfloor = 1{,}000$. $N = 2{,}000 + 2{,}000 = 4{,}000$. $P - N = -3{,}000$.
*Result:* `storage_mass = max(-3000, 0) = 0`. Compounding costs no storage mass, as KIP-9 states.

<!-- id: fee-ex-even-split | world: W1 | difficulty: 3 | prereqs: fee-ex-storage-mass | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example I: an even split (1 input → 2 outputs).** *Inputs:* $I = \{10{,}000{,}000{,}000\}$ (100 KAS), $O = \{4{,}999{,}990{,}000,\; 4{,}999{,}990{,}000\}$. $|O| = 2 > |I| = 1$ → second branch.
*Steps:* $P = 200 + 200 = 400$ (each $\lfloor 10^{12}/4{,}999{,}990{,}000 \rfloor = 200$). $N = 1 \times \lfloor 10^{12} / 10^{10} \rfloor = 100$.
*Result:* `storage_mass = 400 - 100 = 300`, matching the "approximately 300" figure in KIP-9's quality-of-service section.

<!-- id: fee-ex-fanout | world: W1 | difficulty: 4 | prereqs: fee-ex-storage-mass | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example J: fan-out of small outputs (1 input → 10 outputs).** *Inputs:* $I = \{100{,}000{,}000\}$ (1 KAS), ten outputs of `9,990,000` each.
*Steps:* $\lfloor 10^{12} / 9{,}990{,}000 \rfloor = 100{,}100$ per output, so $P = 1{,}001{,}000$. $N = \lfloor 10^{12} / 10^{8} \rfloor = 10{,}000$.
*Result:* `storage_mass = 1,001,000 - 10,000 = 991,000`. Far above the `100,000`-gram standard limit that KIP-9 quotes for the mempool, so the transaction would not be relayed. This is the quantitative reason for the "number of outputs should not exceed ten times the number of inputs" guidance in the integration docs.

<!-- id: fee-ex-micropayment | world: W1 | difficulty: 4 | prereqs: fee-ex-storage-mass | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example K: a small payment from a large input (1 input → payment + change).** *Inputs:* $I = \{100{,}000{,}000{,}000\}$ (1,000 KAS); outputs `10,000,000` (0.1 KAS) and change `99,989,990,000` (fee `10,000`).
*Steps:* $P = 100{,}000 + 10 = 100{,}010$ ($\lfloor 10^{12}/10^7 \rfloor = 100{,}000$ and $\lfloor 10^{12}/99{,}989{,}990{,}000 \rfloor = 10$). $N = \lfloor 10^{12} / 10^{11} \rfloor = 10$.
*Result:* `storage_mass = 100,000`, matching KIP-9's remark that such a payment costs "around 100,000 grams".

<!-- id: fee-ex-plurality | world: W1 | difficulty: 5 | prereqs: fee-ex-storage-mass | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example L: the UTXO plurality adjustment.** KIP-9 also generalizes each output's term from $C/o$ to $C \cdot P^2 / o$, where $P = \lceil \text{entry.size} / 100 \rceil$ counts how many standard-size UTXO units the entry occupies. *Inputs:* an output of `50,000,000` sompi with $P = 2$ instead of $P = 1$. *Steps:* standard term $\lfloor 10^{12} / 50{,}000{,}000 \rfloor = 20{,}000$; adjusted term $\lfloor 4 \times 10^{12} / 50{,}000{,}000 \rfloor = 80{,}000$. *Result:* the same output costs four times as much harmonic mass. This module does **not** compute $P$ for covenant outputs: how an entry's size is measured (and how the extra 32 bytes of a `covenant_id` in §0.3 translate into $P$) must be read from the KIP-9 implementation (`unverified`).

### 18.6 The Borrower Path in Numbers
<!-- id: fee-ex-borrower | world: W5 | difficulty: 4 | prereqs: fee-ex-storage-mass, kcc20-ownership-modes-borrower | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->

§11.3 says the `0xFF` Borrower Path exists because of storage mass. Here is the effect with illustrative KAS amounts (the KCC20 rules themselves are in §11.2).

<!-- id: fee-ex-borrower-fresh | world: W5 | difficulty: 4 | prereqs: fee-ex-borrower | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example M1: sender creates a fresh recipient cell.** *Inputs:* $I = \{100{,}000{,}000\}$; $O = \{98{,}990{,}000,\; 1{,}000{,}000\}$ (sender change and a new 0.01 KAS recipient cell; fee `10,000`). $|O| = 2 > |I| = 1$.
*Steps:* $P = 10{,}102 + 1{,}000{,}000 = 1{,}010{,}102$; $N = 10{,}000$.
*Result:* `storage_mass = 1,000,102`.

<!-- id: fee-ex-borrower-borrowed | world: W5 | difficulty: 4 | prereqs: fee-ex-borrower | status: pedagogical | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->
**Example M2: sender tops up the recipient's existing cell.** *Inputs:* $I = \{100{,}000{,}000,\; 100{,}000{,}000\}$ (sender cell and the recipient's existing 1 KAS cell); $O = \{99{,}990{,}000,\; 100{,}000{,}000\}$. The recipient's output value is not lower than its input value, as the `0xFF` rule requires. $|O| = 2 \le |I| = 2 \le 2$ → relaxed branch.
*Steps:* $P = 10{,}001 + 10{,}000 = 20{,}001$; $N = 10{,}000 + 10{,}000 = 20{,}000$.
*Result:* `storage_mass = 1`. For any realistic transaction the compute mass is much larger than `1`, so storage mass drops out of the maximum entirely.

### 18.7 Compute Mass and Fee Computation
<!-- id: fee-ex-fee | world: W1 | difficulty: 4 | prereqs: fee-ex-storage-mass, fee-ex-sizing | status: pedagogical | source: https://kaspa.aspectron.org/transactions/fees/index.html -->

**Rules used.** The fee of a transaction is `sum(inputs) - sum(outputs)`, and it must be at least $\text{fee rate} \times \text{mass}$ with a minimum rate of `1.0` sompi per gram. The mass is the maximum of the independent dimensions (§0.3: transient, compute, storage). The size, output-script and budget terms of compute mass used below are:

$$\text{compute\_mass} = \text{size\_bytes} \times 1 + \Big(\sum_{\text{outputs}} (2 + \text{script\_len})\Big) \times 10 + \Big(\sum_{\text{inputs}} \text{compute\_budget}\Big) \times 100$$

**Caveat (`unverified`).** The first two terms are the pre-Toccata constants documented for the rusty-kaspa mass module; the third term follows from the official `1 compute_budget = 100 compute grams` conversion. This module assumes, without having read KIP-25's text, that V1 keeps the first two terms and that the transient mass of these small transactions does not exceed their compute mass. Sizes below are assumed, not measured.

<!-- id: fee-ex-deploy | world: W3 | difficulty: 4 | prereqs: fee-ex-fee, covenant-id-genesis-hash | status: pedagogical | source: https://kaspa.aspectron.org/transactions/fees/index.html -->
**Example N: the deploy (Genesis) transaction of §19.** *Inputs:* one funding input of `200,000,000` sompi (budget `10`, §18.3); outputs: the `Counter` P2SH cell of `50,000,000` sompi and a change output; assumed size `320` bytes; output script keys of `2 + 35 = 37` (P2SH) and `2 + 34 = 36` (P2PK) bytes.
*Compute mass:* $320 + (37 + 36) \times 10 + 10 \times 100 = 320 + 730 + 1{,}000 = 2{,}050$.
*Storage mass:* $|O| = 2 > |I| = 1$: $P = \lfloor 10^{12}/50{,}000{,}000 \rfloor + \lfloor 10^{12}/149{,}978{,}333 \rfloor = 20{,}000 + 6{,}667 = 26{,}667$; $N = \lfloor 10^{12}/200{,}000{,}000 \rfloor = 5{,}000$; `storage_mass = 21,667`.
*Mass and fee:* $\max(2{,}050,\; 21{,}667) = 21{,}667$ grams, so at rate `1.0` the fee is `21,667` sompi, leaving change $200{,}000{,}000 - 50{,}000{,}000 - 21{,}667 = 149{,}978{,}333$ sompi. (The change output is chosen so the fee equals the mass; the figures are a consistent fixed point.) Deploying from a single input is **storage-mass dominated**.

<!-- id: fee-ex-continuation | world: W3 | difficulty: 4 | prereqs: fee-ex-deploy, fee-ex-counter-spend | status: pedagogical | source: https://kaspa.aspectron.org/transactions/fees/index.html -->
**Example O: the continuation (spend) transaction of §19.** *Inputs:* the covenant cell of `50,000,000` sompi (budget `0`, Example D) and a fee input of `100,000,000` (budget `10`, Example C); outputs: the successor cell of `50,000,000` and change; assumed size `500` bytes; the same two output script lengths.
*Compute mass:* $500 + 730 + (0 + 10) \times 100 = 2{,}230$.
*Storage mass:* $|O| = 2 \le |I| = 2 \le 2$, relaxed: $P = 20{,}000 + \lfloor 10^{12}/99{,}997{,}770 \rfloor = 20{,}000 + 10{,}000 = 30{,}000$; $N = 20{,}000 + 10{,}000 = 30{,}000$; `storage_mass = 0`.
*Mass and fee:* $\max(2{,}230,\; 0) = 2{,}230$ grams; fee `2,230` sompi at rate `1.0`; change $100{,}000{,}000 - 2{,}230 = 99{,}997{,}770$.
This spend is **compute-mass dominated**, the opposite of Example N. As written, the §9.5 `Counter` does not constrain the successor's `value` (see `REPORT-coverage.md`); here the covenant value is preserved because the fee comes from the separate input.

<!-- id: fee-ex-priority | world: W1 | difficulty: 2 | prereqs: fee-ex-continuation | status: pedagogical | source: https://kaspa.aspectron.org/transactions/fees/fee-rate-qos.html -->
**Example P: a priority fee.** *Inputs:* mass `2,230` grams, fee rate `2.0`. *Formula:* $\text{fee} = \text{rate} \times \text{mass}$. *Result:* $2.0 \times 2{,}230 = 4{,}460$ sompi: `2,230` mandatory plus `2,230` priority. Rates are quoted in sompi per gram.

### 18.8 Capacity Observation Needing Verification
<!-- id: fee-observation-capacity | world: W1 | difficulty: 4 | prereqs: fee-ex-stark-budget | status: unverified | source: https://github.com/kaspanet/kips/blob/master/kip-0009.md -->

KIP-9 and the integration docs quote a `100,000`-gram standard transaction limit and a `500,000`-gram block limit. Example F shows a single RISC Zero verification already carries `250,000` compute grams (`2,500 × 100`), more than the standard transaction figure and half the block figure. Both cannot hold unchanged, so those limits are almost certainly different after Toccata. The current values are `unverified` and are listed in `REPORT-coverage.md`; the examples above avoid relying on them except where explicitly quoting KIP-9.

### 18.9 Glossary Additions for §18
<!-- id: fee-glossary-additions | world: W1 | difficulty: 2 | prereqs: fee-constants | status: mainnet | source: https://docs.kaspa.org/toccata/script-pricing -->

| id | Term | Plain-English definition | Formal specification |
| --- | --- | --- | --- |
| fee-gloss-script-unit | **Script unit** | The tiny unit the script engine counts while it runs; you buy room for them with `compute_budget`. | Runtime meter; `1 compute_budget = 10,000` script units. |
| fee-gloss-compute-gram | **Compute gram** | The unit that turns script work into transaction mass. | `1 compute gram = 100 script units`; `1 compute_budget = 100` compute grams. |
| fee-gloss-gram | **Gram (mass unit)** | The unit transaction weight is measured in; fees are paid per gram. | Fee ≥ rate × mass, rate in sompi per gram, minimum `1.0`. |
| fee-gloss-storage-c | **Storage mass parameter C** | The dial that sets how expensive creating many small outputs is. | `C = 10^12` in KIP-9. |
| fee-gloss-relaxed | **Relaxed formula** | The cheaper way to count storage mass for small input/output shapes. | KIP-9: used when there is exactly one output, or when outputs ≤ inputs ≤ 2. |
| fee-gloss-plurality | **UTXO plurality** | A count of how many standard-size slots a big UTXO entry uses. | KIP-9: `P = ceil(entry.size / 100)`. |

