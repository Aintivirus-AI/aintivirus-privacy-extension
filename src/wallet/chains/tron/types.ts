export interface TronAccountInfo {
  address: string;
  balance: number;
  bandwidth: {
    freeNetLimit: number;
    freeNetUsed: number;
    netLimit: number;
    netUsed: number;
  };
  energy: {
    energyLimit: number;
    energyUsed: number;
  };
  createTime: number;
}

export interface TronTransaction {
  txID: string;
  blockNumber?: number;
  blockTimestamp?: number;
  contractType?: number;
  confirmed?: boolean;
  ownerAddress: string;
  toAddress?: string;
  amount?: number;
  fee?: number;
  contractRet?: string;
  timestamp: number;
}

export interface TronTRC20Transfer {
  transaction_id: string;
  token_info: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  type: string;
}

export interface TronBalance {
  balance: number; // in SUN
  trxBalance: number; // in TRX
}

export interface TronTRC20Balance {
  tokenAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimals: number;
  balance: string;
  uiBalance: number;
  logoUri?: string;
}

export interface TronFeeEstimate {
  bandwidth: number;
  energy: number;
  trxFee: number; // in SUN
  trxFeeFormatted: number; // in TRX
}

export interface UnsignedTronTransaction {
  raw_data: {
    contract: Array<{
      parameter: {
        value: {
          amount?: number;
          owner_address: string;
          to_address: string;
          data?: string;
          contract_address?: string;
        };
        type_url: string;
      };
      type: string;
    }>;
    ref_block_bytes: string;
    ref_block_hash: string;
    expiration: number;
    timestamp: number;
    fee_limit?: number;
  };
  raw_data_hex: string;
  txID: string;
  visible?: boolean; // Whether addresses are in base58 format (true) or hex format (false)
}

export interface SignedTronTransaction {
  txID: string;
  raw_data: UnsignedTronTransaction['raw_data'];
  raw_data_hex: string;
  signature: string[];
  visible?: boolean; // Whether addresses are in base58 format (true) or hex format (false)
}

export interface TronKeypair {
  address: string;
  hexAddress: string;
  publicKey: string;
  privateKey: Uint8Array;
}

export interface TronNetworkConfig {
  name: string;
  fullNode: string;
  solidityNode: string;
  eventServer: string;
  explorerUrl: string;
}
