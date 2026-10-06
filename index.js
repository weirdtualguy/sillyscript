// index.js — sillyscript: Lightweight, pure-JS covenant companion to silverc

const abi = require('./sil-abi');
const encoder = require('./sil-encoder');
const crypto = require('./kaspa-crypto');
const sighash = require('./kaspa-sighash');
const tx = require('./kaspa-tx');
const { Contract } = require('./contract');
const { generateTypes, toTsType } = require('./silly-typegen');
const { compile, findSilverc } = require('./silly-compile');
const { Provider, KaspaRestProvider, MockProvider, NETWORKS } = require('./provider');
const { KaspaWrpcProvider, toWrpcFormat } = require('./kaspa-wrpc');
const { verifyGenesis } = require('./genesis-verify');

module.exports = {
  verifyGenesis,
  // High-level contract abstraction (Viem/Ethers-style)
  Contract,

  // Pluggable provider layer
  Provider,
  KaspaRestProvider,
  KaspaWrpcProvider,
  MockProvider,
  toWrpcFormat,
  getDefaultProvider: tx.getDefaultProvider,
  setDefaultProvider: tx.setDefaultProvider,

  // TypeScript type generation utility
  generateTypes,

  // Compile + verify
  compile, findSilverc,
  toTsType,

  // Core sub-modules
  abi,
  encoder,
  crypto,
  sighash,
  tx,

  // Common high-frequency helpers
  loadArtifact: abi.loadArtifact,
  dispatchTag: abi.dispatchTag,
  templateHash: abi.templateHash,

  buildSigScript: encoder.buildSigScript,
  appendRedeem: encoder.appendRedeem,
  buildCompleteSigScript: encoder.buildCompleteSigScript,
  encodeState: encoder.encodeState,
  buildRedeem: encoder.buildRedeem,

  encodeAddress: crypto.encodeAddress,
  decodeAddress: crypto.decodeAddress,
  p2shSpk: crypto.p2shSpk,
  p2pkSpk: crypto.p2pkSpk,
  p2shAddress: crypto.p2shAddress,
  p2pkAddress: crypto.p2pkAddress,
  extractPubkeyFromP2PK: crypto.extractPubkeyFromP2PK,
  covenantId: crypto.covenantId,

  kaspaSighashV1: sighash.kaspaSighashV1,

  buildTx: tx.buildTx,
  txFee: tx.txFee,
  pickUtxosSafe: tx.pickUtxosSafe,
  setGenesisCovenant: tx.setGenesisCovenant,
  setContinuationCovenant: tx.setContinuationCovenant,
  signP2PKInput: tx.signP2PKInput,
  signCovenantInput: tx.signCovenantInput,
  toRestFormat: tx.toRestFormat,
  submitTx: tx.submitTx,
  submitWithFeeDiscovery: tx.submitWithFeeDiscovery,
  waitForConfirmation: tx.waitForConfirmation,
  estimateMass: tx.estimateMass,
  proactiveFee: tx.proactiveFee,
  SEQUENCE_DISABLE: tx.SEQUENCE_DISABLE,
  NETWORKS,
};
