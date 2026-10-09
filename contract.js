// contract.js — High-level SilverScript Contract Abstraction (sillyscript)
//
// Provides an intuitive, state-aware contract interface (Viem/Ethers-style)
// over SilverScript artifacts, automating:
//   - Artifact verification and entrypoint reflection
//   - BigInt state decoding and explicit-push encoding
//   - Next-state redeem script and P2SH SPK derivation
//   - Named or positional argument mapping (order-independent)
//   - Covenant input population and continuation binding
//   - Pluggable provider integration (REST, Mock, custom)

const fs = require('fs');
const { loadArtifact } = require('./sil-abi');
const { buildCompleteSigScript, buildRedeem, encodeState } = require('./sil-encoder');
const { p2shAddress, p2shSpk } = require('./kaspa-crypto');
const { signCovenantInput, setContinuationCovenant, setGenesisCovenant } = require('./kaspa-tx');
const { KaspaRestProvider, MockProvider, Provider } = require('./provider');

class Contract {
  /**
   * @param {string|object} artifactOrPath - Path to .json artifact or parsed artifact object
   * @param {object} [opts]
   * @param {string} [opts.contractName] - Target contract name if artifact has multiple
   * @param {object} [opts.state] - Initial state dictionary (e.g. { count: 0n })
   * @param {Buffer} [opts.redeemScript] - Specific redeem script override
   * @param {string} [opts.network='mainnet'] - 'mainnet' | 'testnet'
   * @param {Provider} [opts.provider] - Pluggable network provider (defaults to KaspaRestProvider)
   */
  constructor(artifactOrPath, opts = {}) {
    let loaded;
    if (typeof artifactOrPath === 'string') {
      loaded = loadArtifact(artifactOrPath);
    } else if (artifactOrPath && artifactOrPath.contracts) {
      loaded = loadArtifact(artifactOrPath); // object artifact parsed in place, no temp file (audit S14)
    } else if (artifactOrPath && artifactOrPath.bytecode && artifactOrPath.entries) {
      this.view = artifactOrPath;
      this.name = this.view.name;
    } else {
      throw new Error('Contract: invalid artifact input');
    }

    if (!this.view) {
      const contractNames = Object.keys(loaded.contracts);
      if (contractNames.length === 0) throw new Error('Contract: no contracts in artifact');
      const targetName = opts.contractName || contractNames[0];
      this.view = loaded.contracts[targetName];
      if (!this.view) {
        throw new Error(`Contract: '${targetName}' not found in artifact (available: ${contractNames.join(', ')})`);
      }
      this.name = targetName;
    }

    // Attach pluggable provider
    this.provider = opts.provider || new KaspaRestProvider(opts.network || 'mainnet');
    this.network = this.provider.networkName || opts.network || 'mainnet';
    this.hrp = this.provider.hrp || 'kaspa';

    this.templateHash = this.view.templateHash;
    this.fields = this.view.fields;
    this.entries = this.view.entries;

    // State & redeem management
    if (opts.redeemScript) {
      this.redeemScript = Buffer.isBuffer(opts.redeemScript) ? opts.redeemScript : Buffer.from(opts.redeemScript, 'hex');
      this.view.verifyRedeem(this.redeemScript); // F1 gate: an override must be this contract's template (audit S15)
    } else if (opts.state) {
      this.redeemScript = this.buildRedeem(opts.state);
    } else {
      this.redeemScript = this.view.bytecode; // genesis state baked at compile-time
    }

    this._refreshCachedSpk();
  }

  _refreshCachedSpk() {
    this.scriptPubKey = p2shSpk(this.redeemScript);
    this.address = p2shAddress(this.hrp, this.redeemScript);
  }

  /**
   * Connect contract to a new network provider
   * @param {Provider} provider
   */
  connect(provider) {
    if (!provider) throw new Error('Contract.connect: provider required');
    this.provider = provider;
    this.network = provider.networkName || this.network;
    this.hrp = provider.hrp || this.hrp;
    this._refreshCachedSpk();
    return this;
  }

  /**
   * Fetch confirmed UTXOs currently held by this contract address
   */
  async getUtxos(opts = {}) {
    return this.provider.getUtxos(this.address, opts);
  }

  /**
   * Broadcast a transaction via the connected provider
   */
  async broadcast(tx, opts = {}) {
    return this.provider.broadcast(tx, opts);
  }

  /**
   * Wait for a transaction confirmation via the connected provider
   */
  async waitForConfirmation(txId, opts = {}) {
    return this.provider.waitForConfirmation(txId, opts);
  }

  /**
   * Submit transaction with automated iterative fee discovery via provider
   */
  async submitWithFeeDiscovery(buildFn, opts = {}) {
    return this.provider.submitWithFeeDiscovery(buildFn, opts);
  }

  /**
   * Current decoded state object (with BigInt for integer fields)
   */
  get state() {
    return this.decodeState(this.redeemScript);
  }

  /**
   * Set new active state and update cached redeemScript and address
   */
  setState(stateValues) {
    this.redeemScript = this.buildRedeem(stateValues);
    this._refreshCachedSpk();
    return this;
  }

  /**
   * Decode state from a redeem script or raw state script
   */
  decodeState(scriptOrRedeem = this.redeemScript) {
    const buf = Buffer.isBuffer(scriptOrRedeem) ? scriptOrRedeem : Buffer.from(scriptOrRedeem, 'hex');
    if (buf.length === this.view.redeemLength()) {
      const stateScript = buf.subarray(
        this.view.stateSpan.offset,
        this.view.stateSpan.offset + this.view.stateSpan.len
      );
      return this.view.decodeState(stateScript);
    }
    return this.view.decodeState(buf);
  }

  /**
   * Encode a state dictionary into explicit push bytecode
   */
  encodeState(stateValues) {
    return encodeState(this.view, stateValues);
  }

  /**
   * Construct a full redeem script: prefix + encodeState(stateValues) + suffix
   */
  buildRedeem(stateValues) {
    return buildRedeem(this.view, stateValues);
  }

  /**
   * Derive P2SH SPK (35 bytes) for a prospective state
   */
  nextScriptPubKey(stateValues) {
    const redeem = this.buildRedeem(stateValues);
    return p2shSpk(redeem);
  }

  /**
   * Derive Bech32 address for a prospective state
   */
  nextAddress(stateValues, network = this.network) {
    const hrp = (this.provider && this.provider.hrp) || (network === 'testnet' ? 'kaspatest' : 'kaspa');
    const redeem = this.buildRedeem(stateValues);
    return p2shAddress(hrp, redeem);
  }

  /**
   * Normalizes args: accepts either an array of values or a { paramName: value } map.
   */
  _normalizeArgs(entryName, args) {
    const entry = this.view.entry(entryName);
    if (Array.isArray(args)) {
      if (args.length !== entry.params.length) {
        throw new Error(`Contract '${this.name}::${entryName}' expects ${entry.params.length} args, got ${args.length}`);
      }
      return args;
    }
    if (typeof args === 'object' && args !== null) {
      return entry.params.map(p => {
        if (args[p.name] === undefined) {
          throw new Error(`Contract '${this.name}::${entryName}' missing required argument '${p.name}'`);
        }
        return args[p.name];
      });
    }
    throw new Error(`Contract '${this.name}::${entryName}': args must be an Array or Object map`);
  }

  /**
   * Build complete sigScript for an entrypoint invocation
   */
  buildSigScript(entryName, args, redeemScript = this.redeemScript) {
    const normArgs = this._normalizeArgs(entryName, args);
    return buildCompleteSigScript(this.view, entryName, normArgs, redeemScript);
  }

  /**
   * Populates a transaction input spending this covenant UTXO
   */
  populateInput(tx, inputIndex, opts) {
    const { entryName, args, privKey, redeemScript } = opts;
    const redeem = redeemScript || this.redeemScript;
    const normArgs = this._normalizeArgs(entryName, args);

    if (tx.inputs[inputIndex].computeBudget === undefined || tx.inputs[inputIndex].computeBudget < 60) {
      tx.inputs[inputIndex].computeBudget = 60;
    }

    if (privKey) {
      signCovenantInput(tx, inputIndex, privKey, this.view, entryName, normArgs, redeem);
    } else {
      const sigScript = this.buildSigScript(entryName, normArgs, redeem);
      tx.inputs[inputIndex].sigScript = sigScript.toString('hex');
    }
    return tx;
  }

  /**
   * Adds a continuation output for this covenant to a transaction
   */
  addContinuationOutput(tx, outputIndex, authInputIndex, nextState, amount, covenantIdHex) {
    const nextRedeem = this.buildRedeem(nextState);
    const nextSpk = p2shSpk(nextRedeem).toString('hex');

    tx.outputs[outputIndex] = {
      amount: BigInt(amount),
      script: nextSpk,
    };

    if (!covenantIdHex) {
      throw new Error(
        'Contract.addContinuationOutput: covenantIdHex is REQUIRED for continuations. ' +
        'Obtain it from the UTXO being spent (its covenant binding) or your ledger. ' +
        'Use addGenesisOutput() for deploying a new covenant.'
      );
    }
    setContinuationCovenant(tx, outputIndex, authInputIndex, covenantIdHex);

    return tx.outputs[outputIndex];
  }
}

module.exports = { Contract };

// ─────────────────────────────────────────────────────────────────────────────
// Self-test
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const t = (label, cond, detail) => {
    if (cond) pass++; else fail++;
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
  };

  const path = require('path');
  const artifactPath = path.join(__dirname, 'vesting.json');

  if (fs.existsSync(artifactPath)) {
    const mock = new MockProvider('mainnet');
    const contract = new Contract(artifactPath, { provider: mock });

    t('contract name', contract.name === 'VestingEscrow');
    t('templateHash is 32B', contract.templateHash.length === 32);
    t('redeemLength matches bytecode', contract.redeemScript.length === contract.view.bytecode.length);
    t('P2SH scriptPubKey is 35B', contract.scriptPubKey.length === 35);
    t('P2SH script prefix is aa20', contract.scriptPubKey.subarray(0, 2).toString('hex') === 'aa20');
    t('P2SH script suffix is 87', contract.scriptPubKey.subarray(34).toString('hex') === '87');
    t('address starts with kaspa:', contract.address.startsWith('kaspa:'));

    // State decode & encode round-trip
    const initialState = contract.state;
    t('state field decoded', initialState.claimed_so_far !== undefined);
    t('state field is BigInt', typeof initialState.claimed_so_far === 'bigint');
    t('state value is 0n', initialState.claimed_so_far === 0n);

    // Next state derivation
    const nextState = { claimed_so_far: 500000000n };
    const nextRedeem = contract.buildRedeem(nextState);
    t('next redeem length equals genesis length', nextRedeem.length === contract.redeemScript.length);
    t('template hash invariant preserved', contract.view.verifyRedeem(nextRedeem));

    // Next address derivation
    const nextAddr = contract.nextAddress(nextState);
    t('next address is valid kaspa address', nextAddr.startsWith('kaspa:'));
    t('next address differs from genesis', nextAddr !== contract.address);

    // Argument normalization: object map vs positional array
    const posArgs = [100000000n, 1728000000000n];
    const namedArgs = { amount: 100000000n, claim_time: 1728000000000n };
    const sig1 = contract.buildSigScript('claim', posArgs);
    const sig2 = contract.buildSigScript('claim', namedArgs);
    t('named args produce identical sigscript to positional', sig1.equals(sig2));

    // Object artifacts load without temp files (audit S14)
    {
      const artObj = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const realWrite = fs.writeFileSync;
      let wrote = false, co = null;
      fs.writeFileSync = function () { wrote = true; throw new Error('fs write forbidden in this test'); };
      try { co = new Contract(artObj, { provider: mock }); } catch (e) { co = null; } finally { fs.writeFileSync = realWrite; }
      t('Contract(object) loads without writing files', co !== null && wrote === false);
      t('Contract(object) matches Contract(path)', co !== null && co.address === contract.address);
      let nullRejected = false;
      try { loadArtifact(null); } catch (e) { nullRejected = /must be a path or an object/.test(e.message); }
      t('loadArtifact(null) rejected', nullRejected);
    }

    // F1 gate enforced on the override and at signing time (audit S15)
    {
      const thr = f => { try { f(); return null; } catch (e) { return e.message; } };
      const bad = Buffer.from(contract.redeemScript); bad[bad.length - 1] ^= 1;
      t('redeem override with foreign bytes rejected', thr(() => new Contract(artifactPath, { provider: mock, redeemScript: bad })) !== null);
      t('redeem override with own next state accepted', new Contract(artifactPath, { provider: mock, redeemScript: nextRedeem }).redeemScript.equals(nextRedeem));
      const key = Buffer.alloc(32, 7);
      const mkTx = spk => ({ inputs: [{ txId: '11'.repeat(32), index: 0, amount: 1000000000n, spk, sequence: 0n }], outputs: [] });
      const okTx = contract.populateInput(mkTx(contract.scriptPubKey.toString('hex')), 0, { entryName: 'claim', args: posArgs, privKey: key });
      t('signCovenantInput passes the gate for the matching state', okTx.inputs[0].sigScript === contract.buildSigScript('claim', posArgs).toString('hex'));
      const m1 = thr(() => contract.populateInput(mkTx('20' + '56'.repeat(32) + 'ac'), 0, { entryName: 'claim', args: posArgs, privKey: key }));
      t('signCovenantInput rejects a foreign input spk', m1 !== null && /spk does not match/.test(m1));
      const m2 = thr(() => contract.populateInput(mkTx(contract.scriptPubKey.toString('hex')), 0, { entryName: 'claim', args: posArgs, privKey: key, redeemScript: nextRedeem }));
      t('signCovenantInput rejects a wrong-state redeem', m2 !== null && /spk does not match/.test(m2));
    }

    // Provider integration: mock UTXO flow
    (async () => {
      mock.addUtxo(contract.address, {
        txId: '11'.repeat(32),
        index: 0,
        amount: 1000000000n,
      });

      const utxos = await contract.getUtxos();
      t('contract.getUtxos returns mock UTXO', utxos.length === 1 && utxos[0].amount === 1000000000n);

      // Contract state progression
      contract.setState(nextState);
      t('setState updates instance state', contract.state.claimed_so_far === 500000000n);
      t('setState updates instance address', contract.address === nextAddr);

      console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
      process.exit(fail ? 1 : 0);
    })();
  } else {
    console.log('Skipping vesting.json tests (file not found)');
    process.exit(0);
  }
}
