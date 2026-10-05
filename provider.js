// provider.js — Pluggable Network & Transport Providers for sillyscript
//
// Decouples contract interaction and transaction submission from specific
// transport implementations (REST, gRPC, WebSocket, or In-Memory Mocks).
// Pure JavaScript, zero external dependencies.

const FEE_REGEX = /required fee of (\d+)/i;

const NETWORKS = {
  mainnet: { hrp: 'kaspa', rest: 'https://api.kaspa.org', dust: 100000000n },
  testnet: { hrp: 'kaspatest', rest: 'https://api-tn10.kaspa.org', dust: 100000000n },
};

/**
 * Standard REST transaction serializer
 */
function toRestFormat(tx, { allowOrphan = false } = {}) {
  const txObj = tx.transaction ? tx.transaction : tx;
  return {
    transaction: {
      version: txObj.version || 1,
      lockTime: txObj.lockTime || 0,
      subnetworkId: txObj.subnetworkId || '0'.repeat(40),
      gas: txObj.gas !== undefined ? String(txObj.gas) : '0',
      payload: txObj.payload || '',
      inputs: (txObj.inputs || []).map(inp => ({
        previousOutpoint: inp.previousOutpoint || { transactionId: inp.txId, index: inp.index },
        signatureScript: inp.sigScript || inp.signatureScript || '',
        sequence: inp.sequence !== undefined ? Number(inp.sequence) : 0,
        sigOpCount: inp.sigOpCount || 0,
        ...(inp.computeBudget !== undefined ? { computeBudget: inp.computeBudget } : {}),
      })),
      outputs: (txObj.outputs || []).map(out => ({
        amount: String(out.amount !== undefined ? out.amount : (out.value || 0)),
        scriptPublicKey: typeof out.script === 'string'
          ? { version: 0, scriptPublicKey: out.script }
          : (out.scriptPublicKey || { version: 0, scriptPublicKey: '' }),
        ...(out.covenant ? {
          covenant: { authorizingInput: out.covenant.authorizingInput, covenantId: out.covenant.covenantId }
        } : {}),
      })),
    },
    allowOrphan,
  };
}

/**
 * Abstract Base Provider defining the transport contract
 */
class Provider {
  /**
   * @param {string|object} [network='mainnet'] - Network name or config object with { hrp, rest? }
   */
  constructor(network = 'mainnet') {
    if (typeof network === 'string') {
      this.networkName = network;
      this.network = NETWORKS[network] || { hrp: network === 'testnet' ? 'kaspatest' : 'kaspa' };
    } else if (typeof network === 'object' && network !== null) {
      this.networkName = network.name || 'custom';
      this.network = network;
    } else {
      this.networkName = 'mainnet';
      this.network = NETWORKS.mainnet;
    }
    this.hrp = this.network.hrp || 'kaspa';
  }

  /**
   * Fetch eligible UTXOs for an address
   * @param {string} address
   * @param {object} [opts]
   * @param {bigint} [opts.minAmount=0n]
   * @returns {Promise<Array<{ txId: string, index: number, amount: bigint, daaScore: number, isCoinbase: boolean }>>}
   */
  async getUtxos(address, opts = {}) {
    throw new Error('Provider.getUtxos: not implemented');
  }

  /**
   * Broadcast a transaction
   * @param {object} tx - Built transaction or REST-formatted payload
   * @param {object} [opts]
   * @returns {Promise<{ txId: string }>}
   */
  async broadcast(tx, opts = {}) {
    throw new Error('Provider.broadcast: not implemented');
  }

  /**
   * Get transaction details by transaction ID
   * @param {string} txId
   * @returns {Promise<object|null>}
   */
  async getTransaction(txId) {
    throw new Error('Provider.getTransaction: not implemented');
  }

  /**
   * Poll until a transaction receives block confirmation
   * @param {string} txId
   * @param {object} [opts]
   * @returns {Promise<{ txId: string, blockHash: string, daaScore: number, isAccepted: boolean }>}
   */
  async waitForConfirmation(txId, opts = {}) {
    throw new Error('Provider.waitForConfirmation: not implemented');
  }

  /**
   * Submit transaction with automated iterative fee discovery
   */
  async submitWithFeeDiscovery(buildFn, opts = {}) {
    throw new Error('Provider.submitWithFeeDiscovery: not implemented');
  }
}

/**
 * Standard Kaspa REST API Provider
 */
class KaspaRestProvider extends Provider {
  /**
   * @param {string|object} [networkOrUrl='mainnet'] - 'mainnet' | 'testnet' | custom URL
   * @param {object} [opts]
   * @param {object} [opts.headers] - Custom HTTP headers
   * @param {Function} [opts.fetch] - Custom fetch implementation
   */
  constructor(networkOrUrl = 'mainnet', opts = {}) {
    const isUrl = typeof networkOrUrl === 'string' && (/^https?:\/\//i.test(networkOrUrl));
    if (isUrl) {
      const netName = opts.network;
      if (!netName || !NETWORKS[netName]) {
        throw new Error(
          "KaspaRestProvider: custom URL requires opts.network ('mainnet' or 'testnet'). " +
          'Without it, addresses silently derive with the wrong network prefix.'
        );
      }
      super(netName);
      this.url = networkOrUrl.replace(/\/+$/, '');
    } else {
      const netKey = typeof networkOrUrl === 'string' ? networkOrUrl : 'mainnet';
      super(netKey);
      this.url = (NETWORKS[netKey] ? NETWORKS[netKey].rest : NETWORKS.mainnet.rest).replace(/\/+$/, '');
    }

    this.headers = Object.assign({
      'User-Agent': 'sillyscript/1.0',
      'Origin': 'https://wallet.kaspanet.io',
      'Content-Type': 'application/json',
    }, opts.headers || {});

    this.fetchFn = opts.fetch || globalThis.fetch;
    if (!this.fetchFn && typeof fetch !== 'undefined') {
      this.fetchFn = fetch;
    }
  }

  async getUtxos(address, { minAmount = 0n } = {}) {
    if (!this.fetchFn) throw new Error('KaspaRestProvider: fetch is not available in environment');
    const res = await this.fetchFn(`${this.url}/addresses/${address}/utxos`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`KaspaRestProvider: getUtxos failed (REST HTTP ${res.status})`);
    const data = await res.json();
    const rawList = Array.isArray(data) ? data : (data.outputs || data.utxos || []);
    return rawList
      .map(u => ({
        txId: u.outpoint_hash || u.transaction_id || (u.outpoint && u.outpoint.transactionId) || u.txId,
        index: parseInt(u.outpoint_index ?? u.index ?? (u.outpoint && u.outpoint.index) ?? 0, 10),
        amount: BigInt((u.utxoEntry && u.utxoEntry.amount) || u.amount || u.value || 0),
        daaScore: parseInt((u.utxoEntry && u.utxoEntry.blockDaaScore) || u.block_daa_score || u.daaScore || 0, 10),
        isCoinbase: !!((u.utxoEntry && u.utxoEntry.isCoinbase) || u.is_coinbase),
      }))
      .filter(u => u.amount >= minAmount && !u.isCoinbase)
      .sort((a, b) => a.daaScore - b.daaScore);
  }

  async broadcast(tx, { allowOrphan = false } = {}) {
    if (!this.fetchFn) throw new Error('KaspaRestProvider: fetch is not available in environment');
    const payload = tx.transaction ? tx : toRestFormat(tx, { allowOrphan });
    const res = await this.fetchFn(`${this.url}/transactions`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`KaspaRestProvider: broadcast failed (${res.status}): ${text}`);
      err.status = res.status;
      err.responseText = text;
      throw err;
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { txId: text.trim() }; }
    const txId = data.transactionId || data.txId || (typeof data === 'string' ? data : null);
    if (!txId) throw new Error(`KaspaRestProvider: no txId in response: ${text}`);
    return { txId };
  }

  async getTransaction(txId) {
    if (!this.fetchFn) throw new Error('KaspaRestProvider: fetch is not available in environment');
    const res = await this.fetchFn(`${this.url}/transactions/${txId}`, {
      headers: this.headers,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KaspaRestProvider: getTransaction failed (${res.status})`);
    return await res.json();
  }

  async waitForConfirmation(txId, { timeout = 60000, pollInterval = 2000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const tx = await this.getTransaction(txId);
        if (tx) {
          const blockHashes = tx.block_hashes || tx.blockHashes ||
            (tx.accepting_block_hash ? [tx.accepting_block_hash] : []);
          if (blockHashes && blockHashes.length > 0) {
            return {
              txId,
              blockHash: blockHashes[0],
              daaScore: parseInt(tx.block_daa_score || tx.daaScore || 0, 10),
              isAccepted: tx.is_accepted !== false,
            };
          }
        }
      } catch (e) { /* retry */ }
      await new Promise(r => setTimeout(r, pollInterval));
    }
    throw new Error(`KaspaRestProvider: tx ${txId} not confirmed within ${timeout}ms`);
  }

  async submitWithFeeDiscovery(buildFn, { maxAttempts = 5, margin = 1.1, initialFee = 1000000n, allowOrphan = false } = {}) {
    let fee = initialFee;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const tx = buildFn(fee);
      try {
        const result = await this.broadcast(tx, { allowOrphan });
        return { ...result, fee, attempts: attempt };
      } catch (err) {
        lastError = err;
        const msg = err.responseText || err.message || '';
        const match = msg.match(/required (?:fee|amount) (?:of )?(\d+)/i);
        if (match) {
          const required = BigInt(match[1]);
          fee = (required * BigInt(Math.round(margin * 100))) / 100n + 1n;
          continue;
        }
        if (msg.includes('script units') || msg.includes('mass') || msg.includes('compute')) {
          fee = (fee * 12n) / 10n;
          continue;
        }
        throw err;
      }
    }
    throw new Error(`KaspaRestProvider: fee discovery failed after ${maxAttempts} attempts. Last: ${lastError?.message}`);
  }
}

/**
 * In-Memory Mock Provider for fast, offline, deterministic unit testing
 */
class MockProvider extends Provider {
  constructor(network = 'mainnet') {
    super(network);
    this.utxosByAddress = new Map();
    this.transactions = new Map();
    this.currentDaaScore = 100000;
  }

  /**
   * Prime the mock provider with an existing UTXO
   */
  addUtxo(address, utxo) {
    if (!this.utxosByAddress.has(address)) {
      this.utxosByAddress.set(address, []);
    }
    const entry = {
      txId: utxo.txId || '00'.repeat(32),
      index: utxo.index !== undefined ? utxo.index : 0,
      amount: BigInt(utxo.amount),
      spk: utxo.spk || '',
      daaScore: utxo.daaScore || this.currentDaaScore,
      isCoinbase: !!utxo.isCoinbase,
    };
    this.utxosByAddress.get(address).push(entry);
    return entry;
  }

  async getUtxos(address, { minAmount = 0n } = {}) {
    const list = this.utxosByAddress.get(address) || [];
    return list.filter(u => u.amount >= minAmount && !u.isCoinbase);
  }

  async broadcast(tx) {
    const txObj = tx.transaction ? tx.transaction : tx;
    const txId = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).padEnd(64, '0').slice(0, 64);

    // Consume spent inputs from mock wallet
    for (const inp of txObj.inputs || []) {
      const prevTxId = inp.previousOutpoint ? inp.previousOutpoint.transactionId : inp.txId;
      const prevIdx = inp.previousOutpoint ? inp.previousOutpoint.index : inp.index;
      for (const [addr, uList] of this.utxosByAddress.entries()) {
        const idx = uList.findIndex(u => u.txId === prevTxId && u.index === prevIdx);
        if (idx >= 0) uList.splice(idx, 1);
      }
    }

    this.transactions.set(txId, {
      txId,
      tx: txObj,
      blockHash: null,
      daaScore: 0,
      isAccepted: false,
    });

    const { encodeAddress } = require('./kaspa-crypto');
    for (let oi = 0; oi < (txObj.outputs || []).length; oi++) {
      const out = txObj.outputs[oi];
      const scriptHex = typeof out.script === 'string'
        ? out.script
        : (out.scriptPublicKey ? out.scriptPublicKey.scriptPublicKey : '');
      if (!scriptHex) continue;
      const scriptBuf = Buffer.from(scriptHex, 'hex');
      let addr = null;
      if (scriptBuf.length === 34 && scriptBuf[0] === 0x20 && scriptBuf[33] === 0xac) {
        addr = encodeAddress(this.hrp, 0, scriptBuf.subarray(1, 33));
      } else if (scriptBuf.length === 35 && scriptBuf[0] === 0xaa && scriptBuf[1] === 0x20 && scriptBuf[34] === 0x87) {
        addr = encodeAddress(this.hrp, 8, scriptBuf.subarray(2, 34));
      }
      if (addr) {
        this.addUtxo(addr, { txId, index: oi, amount: BigInt(out.amount || 0) });
      }
    }

    return { txId };
  }

  /**
   * Simulate a block mine: accepts all pending unmined transactions
   */
  mineBlock() {
    this.currentDaaScore += 1;
    const blockHash = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).padEnd(64, '0').slice(0, 64);
    for (const record of this.transactions.values()) {
      if (!record.blockHash) {
        record.blockHash = blockHash;
        record.daaScore = this.currentDaaScore;
        record.isAccepted = true;
      }
    }
    return { blockHash, daaScore: this.currentDaaScore };
  }

  async getTransaction(txId) {
    return this.transactions.get(txId) || null;
  }

  async waitForConfirmation(txId) {
    let rec = this.transactions.get(txId);
    if (!rec) throw new Error(`MockProvider: tx ${txId} not found`);
    if (!rec.blockHash) {
      this.mineBlock();
      rec = this.transactions.get(txId);
    }
    return {
      txId,
      blockHash: rec.blockHash,
      daaScore: rec.daaScore,
      isAccepted: rec.isAccepted,
    };
  }

  async submitWithFeeDiscovery(buildFn, opts = {}) {
    const tx = buildFn(opts.initialFee || 1000000n);
    return this.broadcast(tx);
  }
}

module.exports = {
  Provider,
  KaspaRestProvider,
  MockProvider,
  toRestFormat,
  FEE_REGEX,
  NETWORKS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Self-test
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const t = (label, cond, detail) => {
    if (cond) pass++; else fail++;
    console.log((cond ? 'PASS' : 'FAIL') + '  ' + label + (detail && !cond ? '  ' + detail : ''));
  };

  (async () => {
    const mock = new MockProvider('mainnet');
    t('mock network hrp is kaspa', mock.hrp === 'kaspa');

    // Add UTXO
    const testAddr = 'kaspa:qz7ulu4ne25qcdenw0gr6nv8eq5dnpr9vmy';
    mock.addUtxo(testAddr, {
      txId: 'aa'.repeat(32),
      index: 0,
      amount: 5000000000n, // 50 KAS
    });

    const utxos = await mock.getUtxos(testAddr);
    t('mock returns added UTXO', utxos.length === 1);
    t('mock UTXO amount is 50 KAS BigInt', utxos[0].amount === 5000000000n);

    // Mock broadcast
    const mockTx = {
      inputs: [{ txId: 'aa'.repeat(32), index: 0, amount: 5000000000n }],
      outputs: [{ amount: 4999000000n, script: '20' + '11'.repeat(32) + 'ac' }],
    };
    const { txId } = await mock.broadcast(mockTx);
    t('mock broadcast returns 64-char txId', txId && txId.length === 64);

    // UTXO consumed after broadcast
    const remaining = await mock.getUtxos(testAddr);
    t('mock spent input is consumed', remaining.length === 0);

    // Mock confirmation via block mine
    const conf = await mock.waitForConfirmation(txId);
    t('mock confirmation succeeds', conf.isAccepted === true && conf.blockHash.length === 64);

    // KaspaRestProvider URL normalization
    const restMain = new KaspaRestProvider('mainnet');
    t('rest mainnet URL configured', restMain.url === 'https://api.kaspa.org');
    t('rest mainnet hrp is kaspa', restMain.hrp === 'kaspa');

    const restTest = new KaspaRestProvider('testnet');
    t('rest testnet URL configured', restTest.url === 'https://api-tn10.kaspa.org');
    t('rest testnet hrp is kaspatest', restTest.hrp === 'kaspatest');

    const restCustom = new KaspaRestProvider('https://custom-node.org:8080/', { network: 'mainnet' });
    t('custom URL strips trailing slash', restCustom.url === 'https://custom-node.org:8080');

    // Custom URL without network option must throw (fix #6)
    let threwWithoutNetwork = false;
    try { new KaspaRestProvider('https://custom-node.org:8080/'); }
    catch (e) { threwWithoutNetwork = true; }
    t('custom URL without network throws', threwWithoutNetwork);

    // toRestFormat verification
    const restFormat = toRestFormat({
      version: 1,
      inputs: [{ txId: 'bb'.repeat(32), index: 1, sigScript: '00', sequence: 0 }],
      outputs: [{ amount: 100000000n, script: '20' + '22'.repeat(32) + 'ac' }],
    });
    t('toRestFormat structure', restFormat.transaction && restFormat.transaction.version === 1);
    t('toRestFormat amount is string', restFormat.transaction.outputs[0].amount === '100000000');


    // Multi-step mock flow: broadcast creates output UTXOs (fix #7)
    {
      const mock2 = new MockProvider('mainnet');
      const srcAddr2 = 'kaspa:qz7ulu4ne25qcdenw0gr6nv8eq5dnpr9vmy';
      mock2.addUtxo(srcAddr2, { txId: 'cc'.repeat(32), index: 0, amount: 2000000000n });

      await mock2.broadcast({
        inputs: [{ txId: 'cc'.repeat(32), index: 0, amount: 2000000000n }],
        outputs: [
          { amount: 1000000000n, script: '20' + 'ab'.repeat(32) + 'ac' },
          { amount: 990000000n, script: '20' + 'cd'.repeat(32) + 'ac' },
        ],
      });

      const allUtxos = [];
      for (const [addr, list] of mock2.utxosByAddress.entries()) {
        for (const u of list) allUtxos.push({ addr, ...u });
      }
      t('mock output UTXOs created', allUtxos.length === 2);
      t('mock output amounts correct',
        allUtxos.some(u => u.amount === 1000000000n) && allUtxos.some(u => u.amount === 990000000n));
    }
    console.log(fail ? `\n${fail} FAILURE(S)` : `\nALL ${pass} PASS`);
    process.exit(fail ? 1 : 0);
  })();
}
