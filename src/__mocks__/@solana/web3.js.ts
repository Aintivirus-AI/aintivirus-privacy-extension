/**
 * Mock for @solana/web3.js
 * This avoids ESM transformation issues with jayson dependency
 */

import bs58 from 'bs58';

export const LAMPORTS_PER_SOL = 1_000_000_000;

// Cache for maintaining string-to-bytes bidirectional mapping
const keyCache = new Map<string, Uint8Array>();
const bytesCache = new Map<string, string>();

export class PublicKey {
  private _key: string;
  private _bytes: Uint8Array;

  constructor(key: string | Uint8Array | number[]) {
    if (typeof key === 'string') {
      // Validate base58 string format
      // Valid Solana addresses are 32-44 characters and only contain valid base58 chars
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      if (!base58Regex.test(key)) {
        throw new Error('Invalid public key input');
      }
      this._key = key;

      // Check cache first
      if (keyCache.has(key)) {
        this._bytes = keyCache.get(key)!;
      } else {
        // Use bs58 decode for realistic encoding
        try {
          this._bytes = bs58.decode(key);
        } catch {
          // Fallback for test - create deterministic bytes
          this._bytes = new Uint8Array(32);
          for (let i = 0; i < 32; i++) {
            this._bytes[i] = key.charCodeAt(i % key.length);
          }
        }
        keyCache.set(key, this._bytes);
        bytesCache.set(this._bytes.toString(), key);
      }
    } else if (key instanceof Uint8Array || Array.isArray(key)) {
      // Validate byte array length (should be 32 bytes for a public key)
      const bytesArray = key instanceof Uint8Array ? key : new Uint8Array(key);
      if (bytesArray.length !== 32) {
        throw new Error('Invalid public key input');
      }
      this._bytes = new Uint8Array(bytesArray);

      // Check cache first
      const bytesKey = this._bytes.toString();
      if (bytesCache.has(bytesKey)) {
        this._key = bytesCache.get(bytesKey)!;
      } else {
        // Use bs58 encode for realistic encoding
        this._key = bs58.encode(this._bytes);
        keyCache.set(this._key, this._bytes);
        bytesCache.set(bytesKey, this._key);
      }
    } else {
      this._key = 'DefaultPublicKey11111111111111111111111111111';
      this._bytes = new Uint8Array(32);
    }
  }

  toBase58(): string {
    return this._key;
  }

  toString(): string {
    return this._key;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this._bytes);
  }

  toBuffer(): Buffer {
    return Buffer.from(this._bytes);
  }

  equals(other: PublicKey): boolean {
    return this._key === other._key;
  }

  static isOnCurve(_key: Uint8Array): boolean {
    return true;
  }

  static default = new PublicKey('11111111111111111111111111111111');
}

export class Keypair {
  publicKey: PublicKey;
  secretKey: Uint8Array;

  constructor(seed?: Uint8Array) {
    if (seed) {
      // Store seed in first 32 bytes, derived data in last 32 bytes
      // This mimics Ed25519 secret key structure
      this.secretKey = new Uint8Array(64);
      // Copy seed to first 32 bytes
      for (let i = 0; i < 32 && i < seed.length; i++) {
        this.secretKey[i] = seed[i];
      }
      // Fill remaining seed bytes if seed is shorter
      for (let i = seed.length; i < 32; i++) {
        this.secretKey[i] = seed[i % seed.length];
      }
      // Derive second half
      for (let i = 32; i < 64; i++) {
        this.secretKey[i] = (seed[(i - 32) % seed.length] ^ ((i - 32) * 7)) & 0xff;
      }

      // Derive public key from first 32 bytes (the seed)
      const publicKeyBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        publicKeyBytes[i] =
          (this.secretKey[i % 32] * 3 + this.secretKey[(i + 7) % 32] * 5 + i * 11) & 0xff;
      }
      this.publicKey = new PublicKey(publicKeyBytes);
    } else {
      // Random keypair
      const randomBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
      this.publicKey = new PublicKey(randomBytes);
      this.secretKey = new Uint8Array(64);
    }
  }

  static generate(): Keypair {
    return new Keypair();
  }

  static fromSeed(seed: Uint8Array): Keypair {
    return new Keypair(seed);
  }

  static fromSecretKey(secretKey: Uint8Array): Keypair {
    const kp = new Keypair();
    kp.secretKey = new Uint8Array(secretKey);
    // Use first 32 bytes as seed to derive public key (matches constructor)
    const publicKeyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      // Use same formula as constructor, operating on first 32 bytes
      publicKeyBytes[i] = (secretKey[i % 32] * 3 + secretKey[(i + 7) % 32] * 5 + i * 11) & 0xff;
    }
    kp.publicKey = new PublicKey(publicKeyBytes);
    return kp;
  }
}

export class Transaction {
  signatures: { publicKey: PublicKey; signature: Uint8Array | null }[] = [];
  feePayer: PublicKey | null = null;
  recentBlockhash: string | null = null;
  instructions: TransactionInstruction[] = [];

  add(...items: TransactionInstruction[]): Transaction {
    this.instructions.push(...items);
    return this;
  }

  sign(...signers: Keypair[]): void {
    this.signatures = signers.map((s) => ({
      publicKey: s.publicKey,
      signature: new Uint8Array(64),
    }));
  }

  serialize(): Uint8Array {
    return new Uint8Array(256);
  }

  static from(buffer: Uint8Array | Buffer): Transaction {
    // Validate that buffer has minimum size for a valid transaction
    if (buffer.length < 64) {
      throw new Error('Transaction data too short');
    }
    return new Transaction();
  }
}

export class VersionedTransaction {
  signatures: Uint8Array[] = [];
  message: any;

  constructor(message: any) {
    this.message = message;
  }

  sign(signers: Keypair[]): void {
    this.signatures = signers.map(() => new Uint8Array(64));
  }

  serialize(): Uint8Array {
    return new Uint8Array(256);
  }

  static deserialize(data: Uint8Array): VersionedTransaction {
    // Validate that data has minimum size for a valid versioned transaction
    if (data.length < 64) {
      throw new Error('Invalid transaction data');
    }
    return new VersionedTransaction({});
  }
}

export class TransactionInstruction {
  keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
  programId: PublicKey;
  data: Buffer;

  constructor(opts: {
    keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
    programId: PublicKey;
    data?: Buffer;
  }) {
    this.keys = opts.keys;
    this.programId = opts.programId;
    this.data = opts.data || Buffer.alloc(0);
  }
}

export class TransactionMessage {
  payerKey: PublicKey;
  recentBlockhash: string;
  instructions: TransactionInstruction[];

  constructor(opts: {
    payerKey: PublicKey;
    recentBlockhash: string;
    instructions: TransactionInstruction[];
  }) {
    this.payerKey = opts.payerKey;
    this.recentBlockhash = opts.recentBlockhash;
    this.instructions = opts.instructions;
  }

  static decompile(message: any): TransactionMessage {
    return new TransactionMessage({
      payerKey: new PublicKey('11111111111111111111111111111111'),
      recentBlockhash: 'mockBlockhash',
      instructions: [],
    });
  }

  compileToV0Message(): any {
    return {};
  }
}

export const SystemProgram = {
  programId: new PublicKey('11111111111111111111111111111111'),
  transfer: jest.fn((params: { fromPubkey: PublicKey; toPubkey: PublicKey; lamports: number }) => {
    return new TransactionInstruction({
      keys: [
        { pubkey: params.fromPubkey, isSigner: true, isWritable: true },
        { pubkey: params.toPubkey, isSigner: false, isWritable: true },
      ],
      programId: new PublicKey('11111111111111111111111111111111'),
      data: Buffer.alloc(12),
    });
  }),
  createAccount: jest.fn(),
};

export const ComputeBudgetProgram = {
  programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
  setComputeUnitLimit: jest.fn(
    () =>
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
      }),
  ),
  setComputeUnitPrice: jest.fn(
    () =>
      new TransactionInstruction({
        keys: [],
        programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
      }),
  ),
};

export class Connection {
  private _rpcEndpoint: string;

  constructor(endpoint: string) {
    this._rpcEndpoint = endpoint;
  }

  async getBalance(_publicKey: PublicKey): Promise<number> {
    return 1_000_000_000;
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    return { blockhash: 'mockBlockhash123', lastValidBlockHeight: 1000 };
  }

  async sendRawTransaction(_transaction: Uint8Array): Promise<string> {
    return 'mockSignature123';
  }

  async confirmTransaction(_signature: string): Promise<{ value: { err: any } }> {
    return { value: { err: null } };
  }

  async getSignatureStatus(_signature: string): Promise<{ value: any }> {
    return { value: { confirmationStatus: 'finalized', err: null } };
  }

  async getAccountInfo(_publicKey: PublicKey): Promise<any> {
    return null;
  }

  async simulateTransaction(_transaction: Transaction): Promise<{ value: { err: any } }> {
    return { value: { err: null } };
  }

  async getFeeForMessage(_message: any): Promise<{ value: number }> {
    return { value: 5000 };
  }

  async getTokenAccountsByOwner(_owner: PublicKey, _filter: any): Promise<{ value: any[] }> {
    return { value: [] };
  }

  get rpcEndpoint(): string {
    return this._rpcEndpoint;
  }
}

export const clusterApiUrl = (cluster: string): string => {
  switch (cluster) {
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    case 'devnet':
      return 'https://api.devnet.solana.com';
    case 'testnet':
      return 'https://api.testnet.solana.com';
    default:
      return 'https://api.devnet.solana.com';
  }
};

export const sendAndConfirmTransaction = jest.fn().mockResolvedValue('mockSignature');

// Message classes
export class MessageV0 {
  static compile(args: any): MessageV0 {
    return new MessageV0();
  }
}

export class Message {
  static from(buffer: Uint8Array): Message {
    return new Message();
  }
}

// Address lookup table
export class AddressLookupTableAccount {
  key: PublicKey;
  state: any;

  constructor(args: { key: PublicKey; state: any }) {
    this.key = args.key;
    this.state = args.state;
  }
}
