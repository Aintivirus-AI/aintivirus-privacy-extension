/**
 * Mock for ethers.js
 */

export const parseUnits = (value: string, unit: string | number): bigint => {
  const decimals =
    typeof unit === 'string'
      ? unit === 'ether'
        ? 18
        : unit === 'gwei'
          ? 9
          : unit === 'wei'
            ? 0
            : 18
      : unit;
  const [whole, fraction = ''] = value.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
};

export const formatUnits = (value: bigint | string, decimals: number = 18): string => {
  const bigValue = BigInt(value);
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = bigValue / divisor;
  const fraction = bigValue % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  return `${whole}.${fractionStr}`;
};

export const formatEther = (value: bigint | string): string => {
  return formatUnits(value, 18);
};

export const parseEther = (value: string): bigint => {
  return parseUnits(value, 18);
};

export const getBytes = (value: string): Uint8Array => {
  if (value.startsWith('0x')) {
    const hex = value.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return new TextEncoder().encode(value);
};

export const hexlify = (value: Uint8Array | number[] | string): string => {
  if (typeof value === 'string') return value;
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
};

export const keccak256 = (data: Uint8Array | string): string => {
  return '0x' + 'a'.repeat(64);
};

export const isAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const getAddress = (address: string): string => {
  if (!isAddress(address)) {
    throw new Error('invalid address');
  }
  return address;
};

export class Mnemonic {
  phrase: string;

  constructor(phrase: string) {
    this.phrase = phrase;
  }

  static fromPhrase(phrase: string): Mnemonic {
    return new Mnemonic(phrase);
  }

  computeSeed(): Uint8Array {
    return new Uint8Array(64);
  }
}

export class HDNodeWallet {
  address: string;
  privateKey: string;
  publicKey: string;
  mnemonic: Mnemonic | null;
  path: string | null;
  _mnemonicPhrase?: string;

  constructor(path?: string, mnemonicPhrase?: string) {
    this.mnemonic = null;
    this.path = path || null;
    this._mnemonicPhrase = mnemonicPhrase;

    // Generate deterministic address based on path and mnemonic
    if (path && mnemonicPhrase) {
      const hash = this._hashPathAndMnemonic(path, mnemonicPhrase);
      this.address = '0x' + hash.slice(0, 40);
      this.privateKey = '0x' + hash.slice(0, 64);
      this.publicKey = '0x' + hash + hash.slice(0, 64); // 128 chars
    } else {
      this.address = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
      this.privateKey = '0x' + 'a'.repeat(64);
      this.publicKey = '0x' + 'b'.repeat(128);
    }
  }

  private _hashPathAndMnemonic(path: string, mnemonic: string): string {
    // Create a deterministic hash from path and mnemonic
    // Use path length and specific characters to reduce collisions
    const combined = path + '|' + mnemonic + '|' + path.length;
    let hash = '';
    for (let i = 0; i < 64; i++) {
      const idx = i % combined.length;
      const charCode = combined.charCodeAt(idx);
      const nextCharCode = combined.charCodeAt((idx + 1) % combined.length);
      const value = (charCode * 31 + nextCharCode * 17 + i * 13 + path.length * 7) % 256;
      hash += value.toString(16).padStart(2, '0');
    }
    return hash;
  }

  static fromMnemonic(mnemonic: Mnemonic, path?: string): HDNodeWallet {
    const derivationPath = path || "m/44'/60'/0'/0/0";
    const wallet = new HDNodeWallet(derivationPath, mnemonic.phrase);
    wallet.mnemonic = mnemonic;
    return wallet;
  }

  static fromPhrase(phrase: string, path?: string): HDNodeWallet {
    return HDNodeWallet.fromMnemonic(new Mnemonic(phrase), path);
  }

  derive(path: string): HDNodeWallet {
    // Preserve mnemonic phrase even if mnemonic object is null
    const mnemonicPhrase = this.mnemonic?.phrase || this._mnemonicPhrase || '';
    const wallet = new HDNodeWallet(path, mnemonicPhrase);
    wallet.mnemonic = this.mnemonic;
    wallet._mnemonicPhrase = mnemonicPhrase;
    return wallet;
  }

  derivePath(path: string): HDNodeWallet {
    return this.derive(path);
  }
}

export class Wallet {
  address: string;
  privateKey: string;

  constructor(privateKey?: string) {
    this.privateKey = privateKey || '0x' + 'a'.repeat(64);
    this.address = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
  }

  static fromPhrase(phrase: string): Wallet {
    return new Wallet();
  }

  signMessage(message: string | Uint8Array): Promise<string> {
    return Promise.resolve('0x' + 'c'.repeat(130));
  }

  signTransaction(tx: any): Promise<string> {
    return Promise.resolve('0x' + 'd'.repeat(200));
  }
}

export class Interface {
  private _abi: any[];

  constructor(abi: any[]) {
    this._abi = abi;
  }

  encodeFunctionData(fragment: string, values?: any[]): string {
    return '0xa9059cbb' + '0'.repeat(128);
  }

  decodeFunctionData(fragment: string, data: string): any[] {
    return [];
  }

  decodeFunctionResult(fragment: string, data: string): any[] {
    return [BigInt(0)];
  }

  parseTransaction(tx: { data: string; value?: bigint }): any {
    return {
      name: 'transfer',
      args: ['0x0000000000000000000000000000000000000000', BigInt(0)],
      signature: 'transfer(address,uint256)',
      selector: '0xa9059cbb',
    };
  }

  getFunction(name: string): any {
    return {
      name,
      inputs: [],
      outputs: [],
    };
  }
}

export class Contract {
  address: string;
  interface: Interface;

  constructor(address: string, abi: any[], provider?: any) {
    this.address = address;
    this.interface = new Interface(abi);
  }

  async getFunction(name: string): Promise<any> {
    return jest.fn().mockResolvedValue(BigInt(0));
  }
}

export class Transaction {
  type: number | null = null;
  to: string | null = null;
  from: string | null = null;
  nonce: number = 0;
  gasLimit: bigint = BigInt(21000);
  gasPrice: bigint | null = null;
  maxPriorityFeePerGas: bigint | null = null;
  maxFeePerGas: bigint | null = null;
  data: string = '0x';
  value: bigint = BigInt(0);
  chainId: bigint = BigInt(1);

  constructor() {}

  get unsignedSerialized(): string {
    return '0x' + 'e'.repeat(200);
  }

  static from(tx: any): Transaction {
    const t = new Transaction();
    Object.assign(t, tx);
    return t;
  }
}

export class JsonRpcProvider {
  private _url: string;

  constructor(url?: string) {
    this._url = url || 'http://localhost:8545';
  }

  async getBalance(address: string): Promise<bigint> {
    return BigInt('1000000000000000000');
  }

  async getTransactionCount(address: string): Promise<number> {
    return 0;
  }

  async getFeeData(): Promise<{
    gasPrice: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }> {
    return {
      gasPrice: parseUnits('20', 'gwei'),
      maxFeePerGas: parseUnits('50', 'gwei'),
      maxPriorityFeePerGas: parseUnits('2', 'gwei'),
    };
  }

  async estimateGas(tx: any): Promise<bigint> {
    return BigInt(21000);
  }

  async call(tx: any): Promise<string> {
    return '0x';
  }

  async sendTransaction(tx: string): Promise<any> {
    return { hash: '0x' + 'f'.repeat(64) };
  }

  async getNetwork(): Promise<{ chainId: bigint; name: string }> {
    return { chainId: BigInt(1), name: 'mainnet' };
  }
}

export class BrowserProvider extends JsonRpcProvider {
  constructor(provider: any) {
    super();
  }

  async getSigner(): Promise<Wallet> {
    return new Wallet();
  }
}

// ABI Coder
export const AbiCoder = {
  defaultAbiCoder: () => ({
    encode: (types: string[], values: any[]): string => '0x' + '0'.repeat(64),
    decode: (types: string[], data: string): any[] => [],
  }),
};

export const defaultAbiCoder = {
  encode: (types: string[], values: any[]): string => '0x' + '0'.repeat(64),
  decode: (types: string[], data: string): any[] => [],
};

// Utils
export const toUtf8Bytes = (text: string): Uint8Array => {
  return new TextEncoder().encode(text);
};

export const toUtf8String = (bytes: Uint8Array): string => {
  return new TextDecoder().decode(bytes);
};

export const concat = (arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
};

export const zeroPadValue = (value: string, length: number): string => {
  const hex = value.startsWith('0x') ? value.slice(2) : value;
  return '0x' + hex.padStart(length * 2, '0');
};

export const dataSlice = (data: string, start: number, end?: number): string => {
  const hex = data.startsWith('0x') ? data.slice(2) : data;
  const sliced = hex.slice(start * 2, end ? end * 2 : undefined);
  return '0x' + sliced;
};

export const id = (text: string): string => {
  return keccak256(toUtf8Bytes(text));
};

// TypedDataEncoder for EIP-712
export class TypedDataEncoder {
  static hash(domain: any, types: any, value: any): string {
    return '0x' + 'a'.repeat(64);
  }

  static encode(domain: any, types: any, value: any): string {
    return '0x' + 'b'.repeat(128);
  }

  static hashDomain(domain: any): string {
    return '0x' + 'c'.repeat(64);
  }

  static from(types: any): TypedDataEncoder {
    return new TypedDataEncoder();
  }

  hash(value: any): string {
    return '0x' + 'd'.repeat(64);
  }
}
