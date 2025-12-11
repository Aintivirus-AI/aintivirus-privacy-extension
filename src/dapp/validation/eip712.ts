/**
 * EIP-712 Typed Data validation utilities
 * Ensures typed data structures are valid before signing
 */

export interface EIP712Domain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
  salt?: string;
}

export interface EIP712TypedData {
  types: {
    EIP712Domain?: Array<{ name: string; type: string }>;
    [key: string]: Array<{ name: string; type: string }> | undefined;
  };
  primaryType: string;
  domain: EIP712Domain;
  message: Record<string, unknown>;
}

/**
 * Validate EIP-712 typed data structure
 */
export function validateEIP712TypedData(
  data: unknown,
): { valid: true; data: EIP712TypedData } | { valid: false; error: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Typed data must be an object' };
  }

  const typedData = data as Record<string, unknown>;

  // Check required fields
  if (!typedData.types || typeof typedData.types !== 'object') {
    return { valid: false, error: 'Missing or invalid "types" field' };
  }

  if (typeof typedData.primaryType !== 'string' || !typedData.primaryType) {
    return { valid: false, error: 'Missing or invalid "primaryType" field' };
  }

  if (!typedData.domain || typeof typedData.domain !== 'object') {
    return { valid: false, error: 'Missing or invalid "domain" field' };
  }

  if (!typedData.message || typeof typedData.message !== 'object') {
    return { valid: false, error: 'Missing or invalid "message" field' };
  }

  const types = typedData.types as Record<string, unknown>;

  // Validate types structure
  for (const [typeName, typeFields] of Object.entries(types)) {
    if (!Array.isArray(typeFields)) {
      return { valid: false, error: `Type "${typeName}" must be an array of field definitions` };
    }

    for (const field of typeFields) {
      if (!field || typeof field !== 'object') {
        return { valid: false, error: `Invalid field definition in type "${typeName}"` };
      }

      const fieldDef = field as Record<string, unknown>;
      if (typeof fieldDef.name !== 'string' || !fieldDef.name) {
        return { valid: false, error: `Field in type "${typeName}" missing valid "name"` };
      }

      if (typeof fieldDef.type !== 'string' || !fieldDef.type) {
        return {
          valid: false,
          error: `Field "${fieldDef.name}" in type "${typeName}" missing valid "type"`,
        };
      }
    }
  }

  // Validate primaryType exists in types
  if (typedData.primaryType !== 'EIP712Domain' && !types[typedData.primaryType]) {
    return { valid: false, error: `Primary type "${typedData.primaryType}" not found in types` };
  }

  // Safe cast after validation
  return {
    valid: true,
    data: {
      types: typedData.types,
      primaryType: typedData.primaryType,
      domain: typedData.domain,
      message: typedData.message,
    } as EIP712TypedData,
  };
}

/**
 * Validate domain chainId matches expected chainId
 */
export function validateDomainChainId(
  domain: EIP712Domain,
  expectedChainId: number,
): { valid: true } | { valid: false; error: string } {
  if (domain.chainId !== undefined) {
    if (typeof domain.chainId !== 'number') {
      return { valid: false, error: 'Domain chainId must be a number' };
    }

    if (domain.chainId !== expectedChainId) {
      return {
        valid: false,
        error: `Domain chainId (${domain.chainId}) does not match wallet's active chain (${expectedChainId})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Sanitize typed data for safe display (remove potentially malicious content)
 */
export function sanitizeTypedDataForDisplay(data: EIP712TypedData): {
  domain: Record<string, string>;
  message: Record<string, string>;
  primaryType: string;
} {
  const sanitizedDomain: Record<string, string> = {};
  const sanitizedMessage: Record<string, string> = {};

  // Sanitize domain
  for (const [key, value] of Object.entries(data.domain)) {
    if (value !== undefined && value !== null) {
      sanitizedDomain[key] = String(value).slice(0, 200); // Limit length
    }
  }

  // Sanitize message
  for (const [key, value] of Object.entries(data.message)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object') {
        sanitizedMessage[key] = JSON.stringify(value).slice(0, 500);
      } else {
        sanitizedMessage[key] = String(value).slice(0, 200);
      }
    }
  }

  return {
    domain: sanitizedDomain,
    message: sanitizedMessage,
    primaryType: data.primaryType,
  };
}

/**
 * Check for potentially dangerous typed data patterns
 */
export function detectDangerousPatterns(data: EIP712TypedData): string[] {
  const warnings: string[] = [];

  // Check for suspiciously high numeric values in message
  for (const [key, value] of Object.entries(data.message)) {
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const num = BigInt(value);
      // Warn if value is very large (potential token drain)
      if (num > BigInt('1000000000000000000000000')) {
        warnings.push(`Suspiciously large numeric value in field "${key}"`);
      }
    }
  }

  // Check for missing or suspicious verifying contract
  if (!data.domain.verifyingContract) {
    warnings.push('No verifying contract address specified');
  } else if (typeof data.domain.verifyingContract === 'string') {
    // Check if it's a valid address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(data.domain.verifyingContract)) {
      warnings.push('Verifying contract address appears invalid');
    }
  }

  return warnings;
}
