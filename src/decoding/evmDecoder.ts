/**
 * AINTIVIRUS Decoding Module - EVM Transaction Decoder
 *
 * Decodes EVM transactions and provides human-readable summaries with risk analysis.
 */

import {
  DecodedEvmTx,
  DecodedFunctionCall,
  DecodedParam,
  TxDetails,
  TxKind,
  TxWarning,
} from './types';
import { lookupSelector, lookupContract, getContractDisplayName } from './selectors';
import {
  analyzeApprovalAmount,
  analyzeEthValue,
  formatAmount,
  formatEthValue,
  isInfiniteApproval,
  warnContractCreation,
  warnNftApprovalForAll,
  warnPermit2,
  warnUnverifiedContract,
} from './warnings';

// ============================================
// MAIN DECODER
// ============================================

export interface EvmTxInput {
  to?: string;
  value?: string;
  data?: string;
  chainId?: number;
  nonce?: number;
  gas?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

/**
 * Decode an EVM transaction into a human-readable format
 */
export function decodeEvmTx(tx: EvmTxInput): DecodedEvmTx {
  const warnings: TxWarning[] = [];

  // Parse basic values
  const value = parseHexBigInt(tx.value);
  const valueEth = formatEthValue(value);
  const data = tx.data || '0x';
  const dataSize = data.length > 2 ? Math.floor((data.length - 2) / 2) : 0;

  // Build details object
  const details: TxDetails = {
    to: tx.to,
    value: value.toString(),
    valueEth,
    data,
    dataSize,
    chainId: tx.chainId,
    nonce: tx.nonce,
    gasLimit: tx.gas || tx.gasLimit,
    maxFee: tx.maxFeePerGas || tx.gasPrice,
    maxPriorityFee: tx.maxPriorityFeePerGas,
  };

  // Determine transaction kind and decode
  let kind: TxKind;
  let summary: string;
  let decodedCall: DecodedFunctionCall | undefined;

  // Contract creation (no 'to' address)
  if (!tx.to) {
    kind = 'contract_creation';
    summary = 'Deploy new smart contract';
    warnings.push(warnContractCreation());
    details.selector = undefined;
  }
  // Native transfer (no data or just '0x')
  else if (!data || data === '0x' || data.length < 10) {
    kind = 'transfer';
    summary = `Transfer ${valueEth} to ${getContractDisplayName(tx.to)}`;

    // Check for large value
    warnings.push(...analyzeEthValue(value, false));
  }
  // Contract interaction
  else {
    const selector = data.slice(0, 10).toLowerCase();
    details.selector = selector;

    // Look up function signature
    const sig = lookupSelector(selector);

    if (sig) {
      // Decode based on category
      const decoded = decodeKnownFunction(selector, data, tx.to, sig.category);
      kind = decoded.kind;
      summary = decoded.summary;
      decodedCall = decoded.call;
      warnings.push(...decoded.warnings);
    } else {
      // Unknown function
      kind = 'contract_call';
      const contractName = getContractDisplayName(tx.to);
      summary = `Call unknown function on ${contractName}`;

      if (!lookupContract(tx.to)) {
        warnings.push(warnUnverifiedContract());
      }
    }

    // Add value warnings for contract calls with ETH
    if (value > 0n) {
      warnings.push(...analyzeEthValue(value, true));
    }
  }

  return {
    kind,
    summary,
    warnings,
    details,
    decodedCall,
  };
}

// ============================================
// FUNCTION DECODERS
// ============================================

interface DecodeResult {
  kind: TxKind;
  summary: string;
  call?: DecodedFunctionCall;
  warnings: TxWarning[];
}

function decodeKnownFunction(
  selector: string,
  data: string,
  to: string,
  category: string
): DecodeResult {
  const sig = lookupSelector(selector)!;
  const contractName = getContractDisplayName(to);

  switch (selector.toLowerCase()) {
    // ERC-20 transfer
    case '0xa9059cbb':
      return decodeErc20Transfer(data, contractName);

    // ERC-20 approve
    case '0x095ea7b3':
      return decodeErc20Approve(data, contractName);

    // ERC-20 transferFrom
    case '0x23b872dd':
      return decodeTransferFrom(data, contractName);

    // setApprovalForAll (ERC-721/ERC-1155)
    case '0xa22cb465':
      return decodeSetApprovalForAll(data, contractName);

    // ERC-721 safeTransferFrom (3 params)
    case '0x42842e0e':
      return decodeNftTransfer(data, contractName);

    default:
      return decodeGenericFunction(selector, data, to, category, sig.name);
  }
}

function decodeErc20Transfer(data: string, tokenName: string): DecodeResult {
  const warnings: TxWarning[] = [];

  // Decode: transfer(address to, uint256 amount)
  const toAddress = decodeAddress(data, 0);
  const amount = decodeUint256(data, 1);

  const amountDisplay = formatAmount(amount);
  const recipientDisplay = getContractDisplayName(toAddress);

  const call: DecodedFunctionCall = {
    selector: '0xa9059cbb',
    name: 'transfer',
    category: 'token',
    params: [
      {
        name: 'to',
        type: 'address',
        value: toAddress,
        displayValue: recipientDisplay,
        isAddress: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        value: amount.toString(),
        displayValue: amountDisplay,
        isAmount: true,
      },
    ],
  };

  return {
    kind: 'transfer',
    summary: `Transfer ${amountDisplay} ${tokenName} to ${recipientDisplay}`,
    call,
    warnings,
  };
}

function decodeErc20Approve(data: string, tokenName: string): DecodeResult {
  const warnings: TxWarning[] = [];

  // Decode: approve(address spender, uint256 amount)
  const spender = decodeAddress(data, 0);
  const amount = decodeUint256(data, 1);

  const spenderDisplay = getContractDisplayName(spender);
  const amountDisplay = formatAmount(amount);

  // Check for infinite approval
  warnings.push(...analyzeApprovalAmount(amount, spender));

  const call: DecodedFunctionCall = {
    selector: '0x095ea7b3',
    name: 'approve',
    category: 'approval',
    params: [
      {
        name: 'spender',
        type: 'address',
        value: spender,
        displayValue: spenderDisplay,
        isAddress: true,
      },
      {
        name: 'amount',
        type: 'uint256',
        value: amount.toString(),
        displayValue: amountDisplay,
        isAmount: true,
      },
    ],
  };

  const summary = isInfiniteApproval(amount)
    ? `Approve UNLIMITED ${tokenName} to ${spenderDisplay}`
    : `Approve ${amountDisplay} ${tokenName} to ${spenderDisplay}`;

  return {
    kind: 'approval',
    summary,
    call,
    warnings,
  };
}

function decodeTransferFrom(data: string, tokenName: string): DecodeResult {
  // Decode: transferFrom(address from, address to, uint256 amount/tokenId)
  const from = decodeAddress(data, 0);
  const to = decodeAddress(data, 1);
  const value = decodeUint256(data, 2);

  const fromDisplay = getContractDisplayName(from);
  const toDisplay = getContractDisplayName(to);
  const valueDisplay = formatAmount(value);

  const call: DecodedFunctionCall = {
    selector: '0x23b872dd',
    name: 'transferFrom',
    category: 'token',
    params: [
      { name: 'from', type: 'address', value: from, displayValue: fromDisplay, isAddress: true },
      { name: 'to', type: 'address', value: to, displayValue: toDisplay, isAddress: true },
      { name: 'amount', type: 'uint256', value: value.toString(), displayValue: valueDisplay, isAmount: true },
    ],
  };

  return {
    kind: 'transfer',
    summary: `Transfer ${valueDisplay} ${tokenName} from ${fromDisplay} to ${toDisplay}`,
    call,
    warnings: [],
  };
}

function decodeSetApprovalForAll(data: string, collectionName: string): DecodeResult {
  const warnings: TxWarning[] = [];

  // Decode: setApprovalForAll(address operator, bool approved)
  const operator = decodeAddress(data, 0);
  const approved = decodeUint256(data, 1) !== 0n;

  const operatorDisplay = getContractDisplayName(operator);

  if (approved) {
    warnings.push(warnNftApprovalForAll());
    if (!lookupContract(operator)) {
      warnings.push(warnUnverifiedContract());
    }
  }

  const call: DecodedFunctionCall = {
    selector: '0xa22cb465',
    name: 'setApprovalForAll',
    category: 'approval',
    params: [
      { name: 'operator', type: 'address', value: operator, displayValue: operatorDisplay, isAddress: true },
      { name: 'approved', type: 'bool', value: approved.toString(), displayValue: approved ? 'Yes' : 'No' },
    ],
  };

  const summary = approved
    ? `Approve all NFTs in ${collectionName} to ${operatorDisplay}`
    : `Revoke NFT approval for ${operatorDisplay}`;

  return {
    kind: 'approval',
    summary,
    call,
    warnings,
  };
}

function decodeNftTransfer(data: string, collectionName: string): DecodeResult {
  // Decode: safeTransferFrom(address from, address to, uint256 tokenId)
  const from = decodeAddress(data, 0);
  const to = decodeAddress(data, 1);
  const tokenId = decodeUint256(data, 2);

  const toDisplay = getContractDisplayName(to);

  const call: DecodedFunctionCall = {
    selector: '0x42842e0e',
    name: 'safeTransferFrom',
    category: 'nft',
    params: [
      { name: 'from', type: 'address', value: from, displayValue: getContractDisplayName(from), isAddress: true },
      { name: 'to', type: 'address', value: to, displayValue: toDisplay, isAddress: true },
      { name: 'tokenId', type: 'uint256', value: tokenId.toString(), displayValue: `#${tokenId}` },
    ],
  };

  return {
    kind: 'nft',
    summary: `Transfer NFT #${tokenId} from ${collectionName} to ${toDisplay}`,
    call,
    warnings: [],
  };
}

function decodeGenericFunction(
  selector: string,
  data: string,
  to: string,
  category: string,
  functionName: string
): DecodeResult {
  const warnings: TxWarning[] = [];
  const contractName = getContractDisplayName(to);

  // Map category to kind
  let kind: TxKind;
  switch (category) {
    case 'swap':
      kind = 'swap';
      break;
    case 'approval':
      kind = 'approval';
      break;
    case 'token':
      kind = 'transfer';
      break;
    case 'nft':
      kind = 'nft';
      break;
    case 'permit2':
      kind = 'permit2';
      warnings.push(warnPermit2());
      break;
    case 'router':
      kind = 'swap';
      break;
    default:
      kind = 'contract_call';
  }

  // Check if contract is verified
  if (!lookupContract(to)) {
    warnings.push(warnUnverifiedContract());
  }

  const call: DecodedFunctionCall = {
    selector,
    name: functionName,
    category,
    params: [], // Generic decoding doesn't parse params
  };

  return {
    kind,
    summary: `${functionName}() on ${contractName}`,
    call,
    warnings,
  };
}

// ============================================
// ABI DECODING HELPERS
// ============================================

/**
 * Parse hex string to BigInt, handling empty/undefined
 */
function parseHexBigInt(hex: string | undefined): bigint {
  if (!hex || hex === '0x' || hex === '') return 0n;
  return BigInt(hex);
}

/**
 * Decode an address from calldata at given parameter index
 */
function decodeAddress(data: string, paramIndex: number): string {
  const offset = 10 + paramIndex * 64; // 10 = '0x' + 4 byte selector
  const paddedAddress = data.slice(offset, offset + 64);
  return '0x' + paddedAddress.slice(24); // Last 20 bytes
}

/**
 * Decode a uint256 from calldata at given parameter index
 */
function decodeUint256(data: string, paramIndex: number): bigint {
  const offset = 10 + paramIndex * 64;
  const value = data.slice(offset, offset + 64);
  if (!value || value.length === 0) return 0n;
  return BigInt('0x' + value);
}

/**
 * Decode bytes from calldata (for dynamic types)
 */
function decodeBytes(data: string, paramIndex: number): string {
  const offsetPosition = 10 + paramIndex * 64;
  const offset = Number(BigInt('0x' + data.slice(offsetPosition, offsetPosition + 64)));
  const dataStart = 10 + offset * 2;

  const length = Number(BigInt('0x' + data.slice(dataStart, dataStart + 64)));
  const bytesStart = dataStart + 64;

  return '0x' + data.slice(bytesStart, bytesStart + length * 2);
}

// ============================================
// EXPORTS
// ============================================

export { decodeAddress, decodeUint256, decodeBytes, parseHexBigInt };
