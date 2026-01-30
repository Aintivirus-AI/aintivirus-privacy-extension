/**
 * Receive View - QR code and address display for receiving funds
 */

import React, { useState, useEffect, useMemo } from 'react';
import { sendToBackground } from '@shared/messaging';
import { SUPPORTED_CHAINS } from '@shared/types';
import type { ChainType, EVMChainId } from '@shared/types';
import { CloseIcon } from '../../Icons';

export interface ReceiveViewProps {
  address: string;
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  activeChainId?: string | null;
  onClose: () => void;
}

export const ReceiveView: React.FC<ReceiveViewProps> = ({
  address: initialAddress,
  activeChain,
  activeEVMChain,
  activeChainId,
  onClose,
}) => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [chainAddress, setChainAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Get chain info - handle all chain types including Bitcoin, TRON, Monero, etc.
  const chainInfo = useMemo(() => {
    if (activeChain === 'solana') {
      return SUPPORTED_CHAINS.find((c) => c.type === 'solana');
    }
    // For non-Solana chains, first try to find by activeChainId (for Bitcoin, TRON, Monero, etc.)
    if (activeChainId) {
      const chainByChainId = SUPPORTED_CHAINS.find((c) => c.chainId === activeChainId);
      if (chainByChainId) return chainByChainId;
    }
    // Fall back to evmChainId for EVM chains
    return SUPPORTED_CHAINS.find((c) => c.evmChainId === activeEVMChain);
  }, [activeChain, activeEVMChain, activeChainId]);

  // Get symbol for current chain
  const getSymbol = () => {
    return chainInfo?.symbol || (activeChain === 'solana' ? 'SOL' : 'ETH');
  };

  // Get chain name for display
  const getChainName = () => {
    return chainInfo?.name || (activeChain === 'solana' ? 'Solana' : 'Ethereum');
  };

  // Fetch chain-specific address for non-EVM/non-Solana chains
  useEffect(() => {
    const fetchChainAddress = async () => {
      // For Solana, use the provided address
      if (activeChain === 'solana') {
        setChainAddress(null);
        return;
      }

      // For EVM chains, use the provided address
      if (!chainInfo || chainInfo.family === 'evm') {
        setChainAddress(null);
        return;
      }

      // For Bitcoin, TRON, Monero, etc., fetch the chain-specific address
      // Use chainInfo.chainId which is the actual registry chain ID
      setLoading(true);
      try {
        const res = await sendToBackground({
          type: 'WALLET_GET_CHAIN_ADDRESS',
          payload: { chainId: chainInfo.chainId },
        });
        if (res.success && res.data) {
          const data = res.data as {
            address: string;
            chainId: string;
            chainFamily: string;
            symbol: string;
          };
          setChainAddress(data.address || null);
        }
      } catch (error) {
        console.error('Failed to fetch chain address:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChainAddress();
  }, [activeChain, chainInfo]);

  // Use chain address if available, otherwise use provided address
  // For non-EVM/non-Solana chains (like Monero), if chainAddress is explicitly set to null
  // after fetching, it means the address isn't configured - don't fall back to initialAddress
  const needsChainSpecificAddress = chainInfo && 
    chainInfo.family !== 'evm' && 
    chainInfo.family !== 'solana';
  
  // For chains that need specific addresses (Monero, Bitcoin, etc.),
  // use chainAddress even if empty to avoid showing wrong address type
  const address = needsChainSpecificAddress 
    ? (chainAddress || '') 
    : (chainAddress || initialAddress);

  useEffect(() => {
    // Generate QR code URL for the address (works for any chain)
    // Using qrserver.com free API for cross-chain QR generation
    if (address && !loading) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(address)}`;
      setQrCode(qrUrl);
    } else {
      setQrCode(null);
    }
  }, [address, loading]);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const symbol = getSymbol();
  const chainName = getChainName();
  const isWatchOnly = chainInfo?.family === 'monero';

  return (
    <div className="receive-view">
      <div className="form-header">
        <h3>Receive {symbol}</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <p
        style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}
      >
        Scan QR code or copy address to receive {symbol} and tokens on {chainName}
      </p>

      {isWatchOnly && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            background: 'var(--bg-secondary, #f8f9fa)',
            border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: 'var(--space-md)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff9800" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary, #666)', lineHeight: 1.5 }}>
            Watch-only mode: You can view balance and receive funds, but sending is not supported.
          </span>
        </div>
      )}

      <div className="qr-container">
        {loading ? (
          <div
            style={{
              width: 160,
              height: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div className="spinner" />
          </div>
        ) : qrCode ? (
          <img src={qrCode} alt="Wallet QR Code" />
        ) : (
          <div
            style={{
              width: 160,
              height: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div className="spinner" />
          </div>
        )}
      </div>

      <div className="full-address" onClick={address ? copyAddress : undefined} style={{ cursor: address ? 'pointer' : 'default' }}>
        {loading ? 'Loading address...' : address || (isWatchOnly ? 'No Monero address configured' : 'No address available')}
      </div>

      {isWatchOnly && !address && !loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            padding: '16px',
            background: 'var(--bg-secondary, #f8f9fa)',
            borderRadius: '10px',
            marginTop: '12px',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted, #888)" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          <span style={{ fontSize: '12px', color: 'var(--text-muted, #888)', textAlign: 'center', lineHeight: 1.5 }}>
            Import your Monero address and view key to start receiving XMR
          </span>
        </div>
      )}

      {address && address.length > 0 && (
        <button
          className="btn btn-primary btn-block"
          onClick={copyAddress}
          disabled={loading}
          style={{ marginTop: 'var(--space-md)' }}
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>
      )}
    </div>
  );
};

export default ReceiveView;
