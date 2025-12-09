

import {
  TypedDataV4,
  TypedDataDomain,
  TypedDataParseResult,
  TypedDataDisplayModel,
  TypedDataPattern,
  HighlightedField,
  TxWarning,
} from './types';
import {
  isInfiniteApproval,
  isSuspiciousDeadline,
  formatAmount,
  formatDeadline,
  warnInfiniteApproval,
  warnDeadline,
  warnPermitSignature,
  warnPermit2,
  warnUnknownSpender,
  createWarning,
  MAX_UINT256,
} from './warnings';
import { lookupContract, getContractDisplayName } from './selectors';


const HIGHLIGHT_FIELDS = new Set([
  'spender',
  'value',
  'amount',
  'to',
  'from',
  'deadline',
  'nonce',
  'expiry',
  'expiration',
  'permitted',
  'operator',
  'token',
  'details',
  'sigDeadline',
]);

const AMOUNT_FIELDS = new Set(['value', 'amount', 'wad', 'amountIn', 'amountOut']);
const ADDRESS_FIELDS = new Set(['spender', 'to', 'from', 'operator', 'owner', 'token', 'verifyingContract']);
const DEADLINE_FIELDS = new Set(['deadline', 'expiry', 'expiration', 'sigDeadline', 'validTo', 'validBefore']);


export function decodeTypedData(rawData: string): TypedDataParseResult {
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch (e) {
    return createErrorResult('Invalid JSON: ' + (e instanceof Error ? e.message : 'Parse error'));
  }

  
  const validation = validateTypedDataStructure(parsed);
  if (!validation.isValid) {
    return createErrorResult(validation.error!);
  }

  const typedData = parsed as TypedDataV4;

  
  const pattern = detectPattern(typedData);

  
  const warnings = generateWarnings(typedData, pattern);

  
  const displayModel = buildDisplayModel(typedData);

  
  const highlightedFields = extractHighlightedFields(typedData);

  return {
    isValid: true,
    raw: typedData,
    pattern,
    displayModel,
    warnings,
    highlightedFields,
  };
}


interface ValidationResult {
  isValid: boolean;
  error?: string;
}

function validateTypedDataStructure(data: unknown): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { isValid: false, error: 'Data must be an object' };
  }

  const obj = data as Record<string, unknown>;

  
  if (!obj.types || typeof obj.types !== 'object') {
    return { isValid: false, error: 'Missing or invalid "types" field' };
  }

  if (!obj.domain || typeof obj.domain !== 'object') {
    return { isValid: false, error: 'Missing or invalid "domain" field' };
  }

  if (!obj.primaryType || typeof obj.primaryType !== 'string') {
    return { isValid: false, error: 'Missing or invalid "primaryType" field' };
  }

  if (!obj.message || typeof obj.message !== 'object') {
    return { isValid: false, error: 'Missing or invalid "message" field' };
  }

  
  const domain = obj.domain as Record<string, unknown>;
  if (!domain.name && !domain.verifyingContract) {
    return { isValid: false, error: 'Domain must have "name" or "verifyingContract"' };
  }

  
  const types = obj.types as Record<string, unknown>;
  if (!types[obj.primaryType as string]) {
    return { isValid: false, error: `Primary type "${obj.primaryType}" not found in types` };
  }

  return { isValid: true };
}


function detectPattern(data: TypedDataV4): TypedDataPattern {
  const primaryType = data.primaryType.toLowerCase();
  const domainName = (data.domain.name || '').toLowerCase();

  
  if (primaryType === 'permit' || primaryType.includes('permit')) {
    
    if (
      domainName.includes('permit2') ||
      data.domain.verifyingContract?.toLowerCase() === '0x000000000022d473030f116ddee9f6b43ac78ba3'
    ) {
      return 'permit2';
    }

    
    if (primaryType.includes('batch')) {
      return 'permit2_batch';
    }

    return 'permit';
  }

  
  if (
    primaryType.includes('order') ||
    primaryType.includes('trade') ||
    primaryType.includes('swap')
  ) {
    return 'order';
  }

  
  if (primaryType.includes('vote') || primaryType.includes('ballot')) {
    return 'vote';
  }

  
  if (primaryType.includes('delegation') || primaryType.includes('delegate')) {
    return 'delegation';
  }

  return 'unknown';
}


function generateWarnings(data: TypedDataV4, pattern: TypedDataPattern): TxWarning[] {
  const warnings: TxWarning[] = [];

  
  switch (pattern) {
    case 'permit':
      warnings.push(warnPermitSignature());
      break;
    case 'permit2':
    case 'permit2_batch':
      warnings.push(warnPermit2());
      break;
  }

  
  analyzeMessageFields(data.message, data.types, data.primaryType, warnings, '');

  return warnings;
}

function analyzeMessageFields(
  obj: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  typeName: string,
  warnings: TxWarning[],
  path: string
): void {
  const typeFields = types[typeName];
  if (!typeFields) return;

  for (const field of typeFields) {
    const value = obj[field.name];
    const fieldPath = path ? `${path}.${field.name}` : field.name;
    const fieldNameLower = field.name.toLowerCase();

    
    if (AMOUNT_FIELDS.has(fieldNameLower) && typeof value === 'string') {
      try {
        const amount = BigInt(value);
        if (isInfiniteApproval(amount)) {
          warnings.push(warnInfiniteApproval());
        }
      } catch {
        
      }
    }

    
    if (DEADLINE_FIELDS.has(fieldNameLower) && value !== undefined) {
      try {
        const deadline = typeof value === 'string' ? BigInt(value) : BigInt(Number(value));
        const deadlineStatus = isSuspiciousDeadline(deadline);
        if (deadlineStatus !== 'ok') {
          warnings.push(warnDeadline(deadlineStatus));
        }
      } catch {
        
      }
    }

    
    if (fieldNameLower === 'spender' && typeof value === 'string' && value.startsWith('0x')) {
      if (!lookupContract(value)) {
        warnings.push(warnUnknownSpender(value));
      }
    }

    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedTypeName = field.type.replace('[]', '');
      if (types[nestedTypeName]) {
        analyzeMessageFields(
          value as Record<string, unknown>,
          types,
          nestedTypeName,
          warnings,
          fieldPath
        );
      }
    }

    
    if (Array.isArray(value)) {
      const nestedTypeName = field.type.replace('[]', '');
      if (types[nestedTypeName]) {
        for (let i = 0; i < value.length; i++) {
          if (value[i] && typeof value[i] === 'object') {
            analyzeMessageFields(
              value[i] as Record<string, unknown>,
              types,
              nestedTypeName,
              warnings,
              `${fieldPath}[${i}]`
            );
          }
        }
      }
    }
  }
}


function buildDisplayModel(data: TypedDataV4): TypedDataDisplayModel {
  const messageFields = extractFieldsFromObject(
    data.message,
    data.types,
    data.primaryType,
    ''
  );

  
  const nestedStructs: Array<{ name: string; fields: HighlightedField[] }> = [];

  for (const [fieldName, value] of Object.entries(data.message)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const fieldType = data.types[data.primaryType]?.find(f => f.name === fieldName)?.type;
      if (fieldType && data.types[fieldType]) {
        nestedStructs.push({
          name: fieldName,
          fields: extractFieldsFromObject(
            value as Record<string, unknown>,
            data.types,
            fieldType,
            fieldName
          ),
        });
      }
    }
  }

  return {
    domain: data.domain,
    primaryType: data.primaryType,
    messageFields,
    nestedStructs,
  };
}

function extractFieldsFromObject(
  obj: Record<string, unknown>,
  types: Record<string, Array<{ name: string; type: string }>>,
  typeName: string,
  parentPath: string
): HighlightedField[] {
  const fields: HighlightedField[] = [];
  const typeFields = types[typeName];
  if (!typeFields) return fields;

  for (const field of typeFields) {
    const value = obj[field.name];
    const path = parentPath ? `${parentPath}.${field.name}` : field.name;

    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      continue;
    }

    fields.push(createHighlightedField(field.name, field.type, value, path));
  }

  return fields;
}

function createHighlightedField(
  name: string,
  type: string,
  value: unknown,
  path: string
): HighlightedField {
  const nameLower = name.toLowerCase();
  const valueStr = String(value ?? '');

  
  let highlight: HighlightedField['highlight'] = 'normal';
  if (HIGHLIGHT_FIELDS.has(nameLower)) {
    if (nameLower === 'spender') highlight = 'spender';
    else if (AMOUNT_FIELDS.has(nameLower)) highlight = 'amount';
    else if (DEADLINE_FIELDS.has(nameLower)) highlight = 'deadline';
    else if (nameLower === 'to') highlight = 'to';
    else if (nameLower === 'from') highlight = 'from';
    else if (nameLower === 'nonce') highlight = 'nonce';
    else if (nameLower === 'operator') highlight = 'operator';
  }

  
  let displayValue = valueStr;

  if (ADDRESS_FIELDS.has(nameLower) && valueStr.startsWith('0x')) {
    displayValue = getContractDisplayName(valueStr);
  } else if (AMOUNT_FIELDS.has(nameLower) && valueStr) {
    try {
      displayValue = formatAmount(BigInt(valueStr));
    } catch {
      displayValue = valueStr;
    }
  } else if (DEADLINE_FIELDS.has(nameLower) && valueStr) {
    try {
      displayValue = formatDeadline(BigInt(valueStr));
    } catch {
      displayValue = valueStr;
    }
  }

  return {
    path,
    name,
    value: valueStr,
    displayValue,
    type,
    highlight,
  };
}


function extractHighlightedFields(data: TypedDataV4): HighlightedField[] {
  const highlighted: HighlightedField[] = [];

  function extract(obj: Record<string, unknown>, path: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      const fieldPath = path ? `${path}.${key}` : key;

      if (HIGHLIGHT_FIELDS.has(keyLower)) {
        
        let type = 'unknown';
        if (ADDRESS_FIELDS.has(keyLower)) type = 'address';
        else if (AMOUNT_FIELDS.has(keyLower)) type = 'uint256';
        else if (DEADLINE_FIELDS.has(keyLower)) type = 'uint256';

        highlighted.push(createHighlightedField(key, type, value, fieldPath));
      }

      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        extract(value as Record<string, unknown>, fieldPath);
      }

      
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (value[i] && typeof value[i] === 'object') {
            extract(value[i] as Record<string, unknown>, `${fieldPath}[${i}]`);
          }
        }
      }
    }
  }

  extract(data.message, '');
  return highlighted;
}


function createErrorResult(error: string): TypedDataParseResult {
  return {
    isValid: false,
    error,
    raw: null,
    pattern: 'unknown',
    displayModel: null,
    warnings: [],
    highlightedFields: [],
  };
}


export function getChainName(chainId: number | undefined): string {
  if (!chainId) return 'Unknown';

  const chains: Record<number, string> = {
    1: 'Ethereum',
    10: 'Optimism',
    56: 'BNB Chain',
    137: 'Polygon',
    42161: 'Arbitrum',
    8453: 'Base',
    43114: 'Avalanche',
    250: 'Fantom',
    100: 'Gnosis',
    324: 'zkSync Era',
    1101: 'Polygon zkEVM',
    59144: 'Linea',
    534352: 'Scroll',
    5: 'Goerli',
    11155111: 'Sepolia',
  };

  return chains[chainId] || `Chain ${chainId}`;
}


export function formatDomain(domain: TypedDataDomain): string {
  const parts: string[] = [];

  if (domain.name) parts.push(domain.name);
  if (domain.version) parts.push(`v${domain.version}`);
  if (domain.chainId) parts.push(getChainName(domain.chainId));

  return parts.join(' • ') || 'Unknown Domain';
}
