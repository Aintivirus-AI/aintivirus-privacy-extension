/**
 * Swap View - Token swap interface using Jupiter (Solana) and ParaSwap (EVM)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { sendToBackground } from '@shared/messaging';
import { SUPPORTED_CHAINS } from '@shared/types';
import type { ChainType, EVMChainId, SPLTokenBalance, EVMTokenBalance, WalletBalance, EVMBalance } from '@shared/types';
import { type SwapToken } from '../../../wallet/swapTokens';
import { useDebounce } from '../../hooks/useDebounce';
import { SwapTokenSelector } from '../../components/SwapTokenSelector';
import { truncateAddress } from '../../utils/format';
import {
  CloseIcon,
  SwapIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
} from '../../Icons';
import type { SwapQuoteResult, EVMSwapQuoteResult } from '../../types';

// Native token address used by ParaSwap for all EVM chains
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Wrapped SOL address
const WRAPPED_SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

/**
 * Check if token is a native token (SOL, ETH, etc.)
 */
function isNativeToken(address: string, symbol: string): boolean {
  return symbol === 'SOL' || 
    address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    address === WRAPPED_SOL_ADDRESS;
}

// Default tokens for initial state (shown before dynamic list loads)
const DEFAULT_SOLANA_TOKENS: SwapToken[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoUri: 'https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png',
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
  },
];

const DEFAULT_EVM_TOKENS: SwapToken[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoUri: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  },
  {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUri: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
];

export interface SwapViewProps {
  address: string;
  network: string;
  activeChain: ChainType;
  activeEVMChain: EVMChainId | null;
  tokens?: SPLTokenBalance[];
  evmTokens?: EVMTokenBalance[];
  balance?: WalletBalance | null;
  evmBalance?: EVMBalance | null;
  onClose: () => void;
  onSwapComplete?: () => void;
}

export const SwapView: React.FC<SwapViewProps> = ({
  address,
  network,
  activeChain,
  activeEVMChain,
  tokens = [],
  evmTokens = [],
  balance,
  evmBalance,
  onClose,
  onSwapComplete,
}) => {
  const [copied, setCopied] = useState(false);
  const [useInAppSwap, setUseInAppSwap] = useState(true);

  // Get default tokens based on chain (for initial state)
  const getDefaultTokens = useCallback(() => {
    if (activeChain === 'solana') {
      return DEFAULT_SOLANA_TOKENS;
    }
    return DEFAULT_EVM_TOKENS;
  }, [activeChain]);

  // In-app swap state - initialize with default tokens
  const [inputToken, setInputToken] = useState<SwapToken | null>(() => getDefaultTokens()[0]);
  const [outputToken, setOutputToken] = useState<SwapToken | null>(() => getDefaultTokens()[1]);
  const [inputAmount, setInputAmount] = useState('');
  // Input mode: 'token' = entering token amount, 'usd' = entering USD amount
  const [inputMode, setInputMode] = useState<'token' | 'usd'>('token');
  // Default slippage: 1% for Solana (100 bps), 1% for EVM (100 bps)
  // 0.5% is often too tight for lower-liquidity tokens, causing simulation failures
  const [slippageBps, setSlippageBps] = useState(100);
  const [customSlippage, setCustomSlippage] = useState('');
  const [showCustomSlippage, setShowCustomSlippage] = useState(false);
  const [quote, setQuote] = useState<SwapQuoteResult | null>(null);
  const [evmQuote, setEvmQuote] = useState<EVMSwapQuoteResult | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [swapStatus, setSwapStatus] = useState<string>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ signature?: string; hash?: string; explorerUrl: string } | null>(null);
  const [swapAvailable, setSwapAvailable] = useState(false);
  const [referralStatus, setReferralStatus] = useState<{ enabled: boolean; feeBps: number } | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  
  // Token prices for USD display
  const [inputTokenPrice, setInputTokenPrice] = useState<number | null>(null);
  const [outputTokenPrice, setOutputTokenPrice] = useState<number | null>(null);

  // Load popular tokens when chain changes and set default selections
  useEffect(() => {
    let cancelled = false;

    const loadDefaultTokens = async () => {
      setTokensLoading(true);
      try {
        const response = await sendToBackground({
          type: 'SWAP_GET_POPULAR_TOKENS',
          payload: {
            chainType: activeChain,
            evmChainId: activeEVMChain || undefined,
            limit: 10,
          },
        });

        if (!cancelled && response.success && response.data) {
          const popularTokens = response.data as SwapToken[];
          if (popularTokens.length >= 2) {
            setInputToken(popularTokens[0]);
            setOutputToken(popularTokens[1]);
          } else {
            const defaults = getDefaultTokens();
            setInputToken(defaults[0]);
            setOutputToken(defaults[1]);
          }
        } else if (!cancelled) {
          const defaults = getDefaultTokens();
          setInputToken(defaults[0]);
          setOutputToken(defaults[1]);
        }
      } catch (error) {
        console.error('Failed to load popular tokens:', error);
        if (!cancelled) {
          const defaults = getDefaultTokens();
          setInputToken(defaults[0]);
          setOutputToken(defaults[1]);
        }
      } finally {
        if (!cancelled) {
          setTokensLoading(false);
        }
      }
    };

    loadDefaultTokens();
    setInputAmount('');
    setQuote(null);
    setEvmQuote(null);
    setError('');
    setSuccess(null);

    return () => {
      cancelled = true;
    };
  }, [activeChain, activeEVMChain, getDefaultTokens]);

  // Fetch token prices for USD display
  useEffect(() => {
    const fetchPrices = async () => {
      // Fetch native token price (SOL or ETH)
      if (activeChain === 'solana') {
        try {
          const solPriceRes = await sendToBackground({ type: 'GET_SOL_PRICE', payload: undefined });
          if (solPriceRes.success && solPriceRes.data) {
            const data = solPriceRes.data as { price: number };
            // Set price for SOL if it's selected
            if (inputToken?.symbol === 'SOL') {
              setInputTokenPrice(data.price);
            }
            if (outputToken?.symbol === 'SOL') {
              setOutputTokenPrice(data.price);
            }
          }
        } catch {
          // Ignore price fetch errors
        }
        
        // Fetch prices for SPL tokens
        const mints: string[] = [];
        if (inputToken && inputToken.symbol !== 'SOL') mints.push(inputToken.address);
        if (outputToken && outputToken.symbol !== 'SOL') mints.push(outputToken.address);
        
        if (mints.length > 0) {
          try {
            const tokenPricesRes = await sendToBackground({
              type: 'GET_TOKEN_PRICES',
              payload: { mints },
            });
            if (tokenPricesRes.success && tokenPricesRes.data) {
              const prices = tokenPricesRes.data as Record<string, number>;
              if (inputToken && inputToken.symbol !== 'SOL') {
                setInputTokenPrice(prices[inputToken.address] || null);
              }
              if (outputToken && outputToken.symbol !== 'SOL') {
                setOutputTokenPrice(prices[outputToken.address] || null);
              }
            }
          } catch {
            // Ignore price fetch errors
          }
        }
      } else if (activeChain === 'evm') {
        // Fetch ETH price for native token
        try {
          const ethPriceRes = await sendToBackground({ type: 'GET_ETH_PRICE', payload: undefined });
          if (ethPriceRes.success && ethPriceRes.data) {
            const data = ethPriceRes.data as { price: number };
            const isInputNative = inputToken?.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
            const isOutputNative = outputToken?.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
            if (isInputNative) {
              setInputTokenPrice(data.price);
            }
            if (isOutputNative) {
              setOutputTokenPrice(data.price);
            }
          }
        } catch {
          // Ignore price fetch errors
        }
        
        // For EVM tokens, we'd need to fetch from a price API
        // For now, clear prices for non-native tokens
        if (inputToken && inputToken.address.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase()) {
          setInputTokenPrice(null);
        }
        if (outputToken && outputToken.address.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase()) {
          setOutputTokenPrice(null);
        }
      }
    };

    if (inputToken || outputToken) {
      fetchPrices();
    }
  }, [inputToken, outputToken, activeChain]);

  // Calculate actual token amount for quote (handles both input modes)
  // Note: This must be defined before the quote fetching effect
  const actualTokenAmount = useMemo(() => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) return '';
    
    if (inputMode === 'token') {
      return inputAmount;
    } else {
      // USD mode: convert USD to token amount
      if (inputTokenPrice && inputTokenPrice > 0) {
        const tokenAmount = parseFloat(inputAmount) / inputTokenPrice;
        return tokenAmount.toString();
      }
      return '';
    }
  }, [inputAmount, inputMode, inputTokenPrice]);

  // Debounce actual token amount for quote fetching
  const debouncedInputAmount = useDebounce(actualTokenAmount, 500);

  // Check if in-app swap is available
  useEffect(() => {
    const checkSwapAvailable = async () => {
      if (activeChain === 'solana' && network === 'mainnet-beta') {
        try {
          const response = await sendToBackground({
            type: 'WALLET_SWAP_AVAILABLE',
            payload: undefined,
          });
          setSwapAvailable(response.success && response.data === true);

          const refResponse = await sendToBackground({
            type: 'WALLET_SWAP_REFERRAL_STATUS',
            payload: undefined,
          });
          if (refResponse.success && refResponse.data) {
            setReferralStatus(refResponse.data as { enabled: boolean; feeBps: number });
          }
        } catch {
          setSwapAvailable(false);
        }
      } else if (activeChain === 'evm' && activeEVMChain) {
        try {
          const response = await sendToBackground({
            type: 'EVM_SWAP_AVAILABLE',
            payload: { evmChainId: activeEVMChain },
          });
          setSwapAvailable(response.success && response.data === true);
          setReferralStatus(null);
        } catch {
          setSwapAvailable(false);
        }
      } else {
        setSwapAvailable(false);
      }
    };
    checkSwapAvailable();
  }, [activeChain, activeEVMChain, network]);

  // Fetch quote when input changes
  useEffect(() => {
    const fetchQuote = async () => {
      if (!inputToken || !outputToken || !debouncedInputAmount || parseFloat(debouncedInputAmount) <= 0 || !swapAvailable) {
        setQuote(null);
        setEvmQuote(null);
        return;
      }

      setLoadingQuote(true);
      setError('');

      try {
        if (activeChain === 'solana') {
          const response = await sendToBackground({
            type: 'WALLET_SWAP_QUOTE',
            payload: {
              inputMint: inputToken.address,
              outputMint: outputToken.address,
              inputAmount: debouncedInputAmount,
              inputDecimals: inputToken.decimals,
              outputDecimals: outputToken.decimals,
              slippageBps,
            },
          });

          if (response.success && response.data) {
            setQuote(response.data as SwapQuoteResult);
            setEvmQuote(null);
          } else {
            setError(response.error || 'Failed to get quote');
            setQuote(null);
          }
        } else if (activeChain === 'evm' && activeEVMChain) {
          const response = await sendToBackground({
            type: 'EVM_SWAP_QUOTE',
            payload: {
              evmChainId: activeEVMChain,
              srcToken: inputToken.address,
              destToken: outputToken.address,
              srcAmount: debouncedInputAmount,
              srcDecimals: inputToken.decimals,
              destDecimals: outputToken.decimals,
              slippageBps,
            },
          });

          if (response.success && response.data) {
            setEvmQuote(response.data as EVMSwapQuoteResult);
            setQuote(null);
          } else {
            setError(response.error || 'Failed to get quote');
            setEvmQuote(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get quote');
        setQuote(null);
        setEvmQuote(null);
      } finally {
        setLoadingQuote(false);
      }
    };

    fetchQuote();
  }, [debouncedInputAmount, inputToken, outputToken, slippageBps, swapAvailable, activeChain, activeEVMChain]);

  // Execute swap with status updates
  const handleSwap = async () => {
    if (!inputToken || !outputToken) return;
    if (activeChain === 'solana' && !quote) return;
    if (activeChain === 'evm' && !evmQuote) return;
    if (executing) return;

    setExecuting(true);
    setError('');
    setSuccess(null);
    setSwapStatus('Building transaction...');

    const statusUpdates = activeChain === 'evm'
      ? [
          { delay: 1500, status: 'Signing transaction...' },
          { delay: 3000, status: 'Broadcasting to network...' },
          { delay: 5000, status: 'Waiting for confirmation...' },
          { delay: 15000, status: 'Still confirming... (this may take a minute)' },
          { delay: 30000, status: 'Almost there... (network is busy)' },
        ]
      : [
          { delay: 1000, status: 'Signing transaction...' },
          { delay: 2000, status: 'Broadcasting to Solana...' },
          { delay: 4000, status: 'Waiting for confirmation...' },
        ];

    const timeouts: NodeJS.Timeout[] = [];
    statusUpdates.forEach(({ delay, status }) => {
      const timeout = setTimeout(() => setSwapStatus(status), delay);
      timeouts.push(timeout);
    });

    try {
      if (activeChain === 'solana') {
        const response = await sendToBackground({
          type: 'WALLET_SWAP_EXECUTE',
          payload: {
            inputMint: inputToken.address,
            outputMint: outputToken.address,
            inputAmount: actualTokenAmount,
            inputDecimals: inputToken.decimals,
            slippageBps,
          },
        });

        timeouts.forEach(clearTimeout);

        if (response.success && response.data) {
          const result = response.data as { signature: string; explorerUrl: string };
          setSuccess({ signature: result.signature, explorerUrl: result.explorerUrl });
          setInputAmount('');
          setQuote(null);
          onSwapComplete?.();
        } else {
          setError(response.error || 'Swap failed');
        }
      } else if (activeChain === 'evm' && activeEVMChain) {
        const response = await sendToBackground({
          type: 'EVM_SWAP_EXECUTE',
          payload: {
            evmChainId: activeEVMChain,
            srcToken: inputToken.address,
            destToken: outputToken.address,
            srcAmount: actualTokenAmount,
            srcDecimals: inputToken.decimals,
            slippageBps,
          },
        });

        timeouts.forEach(clearTimeout);

        if (response.success && response.data) {
          const result = response.data as { hash: string; explorerUrl: string; confirmed: boolean; error?: string };
          if (result.error) {
            setError(result.error);
          } else {
            setSuccess({ hash: result.hash, explorerUrl: result.explorerUrl });
            setInputAmount('');
            setEvmQuote(null);
            onSwapComplete?.();
          }
        } else {
          setError(response.error || 'Swap failed');
        }
      }
    } catch (err) {
      timeouts.forEach(clearTimeout);
      setError(err instanceof Error ? err.message : 'Swap failed');
    } finally {
      setExecuting(false);
      setSwapStatus('');
    }
  };

  // Swap input/output tokens
  const handleFlipTokens = () => {
    const temp = inputToken;
    setInputToken(outputToken);
    setOutputToken(temp);
    setInputAmount('');
    setQuote(null);
    setEvmQuote(null);
  };

  // Get chain name for display
  const getChainName = () => {
    if (activeChain === 'solana') return 'Solana';
    const chain = SUPPORTED_CHAINS.find((c) => c.type === 'evm' && c.evmChainId === activeEVMChain);
    return chain?.name || 'Ethereum';
  };

  // Get DEX info based on chain (for external swap fallback)
  const getDexInfo = () => {
    if (activeChain === 'solana') {
      return {
        name: 'Jupiter',
        description: 'Swap tokens using Jupiter, the leading Solana DEX aggregator. Get the best rates across all Solana liquidity sources.',
        url: network === 'devnet' ? 'https://jup.ag/swap/SOL-USDC?network=devnet' : 'https://jup.ag/swap/SOL-USDC',
        note: 'Jupiter will open in a new window. Connect Phantom, Solflare, or another wallet there to swap.',
      };
    }

    const chainName = getChainName();
    return {
      name: 'Uniswap',
      description: `Swap tokens using Uniswap on ${chainName}. Get the best rates with automatic routing.`,
      url: `https://app.uniswap.org/swap?chain=${activeEVMChain || 'ethereum'}`,
      note: `Uniswap will open in a new window. Connect your wallet there to swap tokens on ${chainName}.`,
    };
  };

  const dexInfo = getDexInfo();
  const chainName = getChainName();

  const openDexPopup = () => {
    const width = 420;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    window.open(
      dexInfo.url,
      'dex-swap',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );
  };

  const openDexTab = () => {
    window.open(dexInfo.url, '_blank');
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  // Get user's token balance for input token
  const getInputTokenBalance = () => {
    if (!inputToken) return null;
    if (activeChain === 'solana') {
      if (inputToken.symbol === 'SOL') {
        return balance?.lamports ? balance.lamports / 1e9 : 0;
      }
      const userToken = tokens.find((t) => t.mint === inputToken.address);
      return userToken ? userToken.uiBalance : 0;
    } else {
      if (inputToken.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
        return evmBalance?.formatted ?? 0;
      }
      const userToken = evmTokens.find(
        (t) => t.address.toLowerCase() === inputToken.address.toLowerCase()
      );
      return userToken ? userToken.uiBalance : 0;
    }
  };

  const inputBalance = getInputTokenBalance();

  // Calculate USD equivalent when in token mode
  const usdEquivalent = useMemo(() => {
    if (!inputAmount || parseFloat(inputAmount) <= 0 || !inputTokenPrice) return null;
    
    if (inputMode === 'token') {
      return parseFloat(inputAmount) * inputTokenPrice;
    }
    return null;
  }, [inputAmount, inputMode, inputTokenPrice]);

  // Calculate token equivalent when in USD mode
  const tokenEquivalent = useMemo(() => {
    if (!inputAmount || parseFloat(inputAmount) <= 0 || !inputTokenPrice) return null;
    
    if (inputMode === 'usd') {
      return parseFloat(inputAmount) / inputTokenPrice;
    }
    return null;
  }, [inputAmount, inputMode, inputTokenPrice]);

  // Toggle input mode
  const toggleInputMode = useCallback(() => {
    if (!inputTokenPrice || inputTokenPrice <= 0) return;
    
    // Convert current value to new mode
    if (inputAmount && parseFloat(inputAmount) > 0) {
      if (inputMode === 'token') {
        // Switching to USD mode: convert token amount to USD
        const usdValue = parseFloat(inputAmount) * inputTokenPrice;
        setInputAmount(usdValue.toFixed(2));
      } else {
        // Switching to token mode: convert USD to token amount
        const tokenValue = parseFloat(inputAmount) / inputTokenPrice;
        setInputAmount(tokenValue.toFixed(6));
      }
    }
    
    setInputMode(prev => prev === 'token' ? 'usd' : 'token');
  }, [inputAmount, inputMode, inputTokenPrice]);

  // Handle token selection from SwapTokenSelector
  const handleInputTokenSelect = useCallback((token: SwapToken) => {
    setInputToken(token);
    setQuote(null);
    setEvmQuote(null);
  }, []);

  const handleOutputTokenSelect = useCallback((token: SwapToken) => {
    setOutputToken(token);
    setQuote(null);
    setEvmQuote(null);
  }, []);

  // Get native balance for token selector
  const nativeBalanceForSelector = useMemo(() => {
    if (activeChain === 'solana') {
      return balance?.sol || 0;
    }
    return evmBalance?.formatted || 0;
  }, [activeChain, balance, evmBalance]);

  // In-app swap UI
  const hasQuote = activeChain === 'solana' ? quote : evmQuote;
  const outputAmountFormatted = activeChain === 'solana' ? quote?.outputAmountFormatted : evmQuote?.destAmountFormatted;
  const minimumReceivedFormatted = activeChain === 'solana' ? quote?.minimumReceivedFormatted : evmQuote?.minimumReceivedFormatted;
  const routeDisplay = activeChain === 'solana' ? quote?.route : evmQuote?.route;
  const priceImpact = activeChain === 'solana' ? quote?.priceImpact : null;
  const poweredByName = activeChain === 'solana' ? 'Jupiter' : 'ParaSwap';
  const poweredByLogo = activeChain === 'solana' ? 'https://static.jup.ag/jup/icon.png' : 'https://app.paraswap.io/paraswap.svg';
  const externalSwapName = activeChain === 'solana' ? 'Jupiter' : 'ParaSwap';

  if (swapAvailable && useInAppSwap) {
    return (
      <div className="swap-view">
        <div className="form-header">
          <h3>Swap Tokens</h3>
          <button className="close-btn" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className="swap-content">
          {/* Success State */}
          {success && (
            <div className="swap-success">
              <div className="swap-success-icon">
                <CheckIcon size={32} />
              </div>
              <h4>Swap Successful!</h4>
              <p>Your swap has been confirmed on the blockchain.</p>
              <a
                href={success.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="swap-explorer-link"
              >
                <ExternalLinkIcon size={14} />
                View on Explorer
              </a>
              <button
                className="btn btn-primary btn-block"
                onClick={() => setSuccess(null)}
                style={{ marginTop: '16px' }}
              >
                New Swap
              </button>
            </div>
          )}

          {/* Swap Processing Status */}
          {executing && swapStatus && (
            <div className="swap-processing-status">
              <div className="swap-processing-animation">
                <div className="swap-processing-spinner"></div>
              </div>
              <div className="swap-processing-text">{swapStatus}</div>
              <div className="swap-processing-hint">
                {activeChain === 'evm'
                  ? 'EVM transactions may take 15-60 seconds to confirm'
                  : 'Solana transactions typically confirm in a few seconds'}
              </div>
            </div>
          )}

          {/* Swap Form */}
          {!success && !executing && (
            <>
              {/* Input Token */}
              <div className="swap-input-group">
                <label className="swap-label">You Pay</label>
                <div className="swap-input-row">
                  {/* USD prefix when in USD mode */}
                  {inputMode === 'usd' && (
                    <span className="swap-input-prefix">$</span>
                  )}
                  <input
                    type="number"
                    className="swap-amount-input"
                    placeholder={inputMode === 'usd' ? '0.00' : '0.00'}
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    disabled={executing || tokensLoading}
                  />
                  <SwapTokenSelector
                    selectedToken={inputToken}
                    onSelect={handleInputTokenSelect}
                    chainType={activeChain}
                    evmChainId={activeEVMChain || undefined}
                    solanaTokens={tokens}
                    evmTokens={evmTokens}
                    nativeBalance={nativeBalanceForSelector}
                    excludeToken={outputToken}
                    disabled={executing || tokensLoading}
                  />
                </div>
                {/* Contract address for verification */}
                {inputToken && !isNativeToken(inputToken.address, inputToken.symbol) && (
                  <div className="swap-contract-address" title={inputToken.address}>
                    Contract: {truncateAddress(inputToken.address)}
                  </div>
                )}
                {/* Equivalent value display - clickable to toggle mode */}
                {inputAmount && parseFloat(inputAmount) > 0 && inputTokenPrice !== null && inputToken && (
                  <button
                    type="button"
                    className="swap-usd-value swap-mode-toggle"
                    onClick={toggleInputMode}
                    title={`Click to enter in ${inputMode === 'token' ? 'USD' : inputToken.symbol}`}
                  >
                    {inputMode === 'token' ? (
                      <>≈ ${usdEquivalent?.toFixed(2)}</>
                    ) : (
                      <>≈ {tokenEquivalent?.toFixed(6)} {inputToken.symbol}</>
                    )}
                    <svg className="swap-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"/>
                    </svg>
                  </button>
                )}
                {inputBalance !== null && inputToken && (
                  <div className="swap-balance">
                    Balance: {inputBalance.toFixed(4)} {inputToken.symbol}
                    <div className="swap-quick-btns">
                      <button
                        className="swap-quick-btn"
                        onClick={() => {
                          // Always set in token mode for percentage buttons
                          if (inputMode === 'usd') {
                            setInputMode('token');
                          }
                          setInputAmount((inputBalance * 0.5).toFixed(6));
                        }}
                        disabled={executing}
                      >
                        50%
                      </button>
                      <button
                        className="swap-quick-btn"
                        onClick={() => {
                          if (!inputToken) return;
                          // Always set in token mode for MAX button
                          if (inputMode === 'usd') {
                            setInputMode('token');
                          }
                          if (activeChain === 'solana') {
                            if (inputToken.symbol === 'SOL') {
                              const gasReserve = Math.min(0.005, inputBalance * 0.1);
                              const maxSwappable = Math.max(0, inputBalance - gasReserve);
                              setInputAmount(maxSwappable.toFixed(6));
                            } else {
                              setInputAmount(inputBalance.toFixed(6));
                            }
                          } else {
                            const isNativeToken = inputToken.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
                            if (isNativeToken) {
                              let gasReserve = 0.003;
                              if (activeEVMChain === 'arbitrum' || activeEVMChain === 'optimism' || activeEVMChain === 'base') {
                                gasReserve = 0.0005;
                              } else if (activeEVMChain === 'polygon') {
                                gasReserve = 0.05;
                              }
                              const effectiveReserve = Math.min(gasReserve, inputBalance * 0.1);
                              const maxSwappable = Math.max(0, inputBalance - effectiveReserve);
                              setInputAmount(maxSwappable.toFixed(6));
                            } else {
                              setInputAmount(inputBalance.toFixed(6));
                            }
                          }
                        }}
                        disabled={executing}
                      >
                        MAX
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Flip Button */}
              <div className="swap-flip-container">
                <button className="swap-flip-btn" onClick={handleFlipTokens}>
                  <SwapIcon size={18} />
                </button>
              </div>

              {/* Output Token */}
              <div className="swap-input-group">
                <label className="swap-label">You Receive</label>
                <div className="swap-input-row">
                  <input
                    type="text"
                    className="swap-amount-input"
                    placeholder="0.00"
                    value={loadingQuote ? 'Loading...' : outputAmountFormatted || ''}
                    readOnly
                  />
                  <SwapTokenSelector
                    selectedToken={outputToken}
                    onSelect={handleOutputTokenSelect}
                    chainType={activeChain}
                    evmChainId={activeEVMChain || undefined}
                    solanaTokens={tokens}
                    evmTokens={evmTokens}
                    nativeBalance={nativeBalanceForSelector}
                    excludeToken={inputToken}
                    disabled={executing || tokensLoading}
                  />
                </div>
                {/* Contract address for verification */}
                {outputToken && !isNativeToken(outputToken.address, outputToken.symbol) && (
                  <div className="swap-contract-address" title={outputToken.address}>
                    Contract: {truncateAddress(outputToken.address)}
                  </div>
                )}
                {/* USD value for output - derive from input value minus fees/impact
                    Price APIs for unverified tokens can be stale/incorrect, so we calculate based on what user is paying */}
                {outputAmountFormatted && parseFloat(outputAmountFormatted) > 0 && (
                  <div className="swap-usd-value">
                    {actualTokenAmount && parseFloat(actualTokenAmount) > 0 && inputTokenPrice !== null ? (
                      // Calculate output USD = input USD - platform fee - price impact
                      (() => {
                        const inputUsd = parseFloat(actualTokenAmount) * inputTokenPrice;
                        // Platform fee (e.g., 50 bps = 0.5%)
                        const platformFeePct = referralStatus?.enabled ? (referralStatus.feeBps / 10000) : 0;
                        // Price impact from quote (e.g., "0.01%" -> 0.0001)
                        const priceImpactPct = priceImpact ? parseFloat(priceImpact) / 100 : 0;
                        // Output USD = input - fees - impact
                        const outputUsd = inputUsd * (1 - platformFeePct - priceImpactPct);
                        return <>≈ ${outputUsd.toFixed(2)}</>;
                      })()
                    ) : outputTokenPrice !== null ? (
                      // Fallback to output token price if input price unavailable
                      <>≈ ${(parseFloat(outputAmountFormatted) * outputTokenPrice).toFixed(2)}</>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Quote Details */}
              {hasQuote && !loadingQuote && inputToken && outputToken && (
                <div className="swap-quote-details">
                  <div className="swap-quote-row">
                    <span>Rate</span>
                    <span>
                      1 {inputToken.symbol} ≈{' '}
                      {outputAmountFormatted && inputAmount
                        ? (parseFloat(outputAmountFormatted) / parseFloat(inputAmount)).toFixed(6)
                        : '0'}{' '}
                      {outputToken.symbol}
                    </span>
                  </div>
                  <div className="swap-quote-row">
                    <span>Min. Received</span>
                    <span>
                      {minimumReceivedFormatted} {outputToken.symbol}
                    </span>
                  </div>
                  {priceImpact && (
                    <div className="swap-quote-row">
                      <span>Price Impact</span>
                      <span className={parseFloat(priceImpact) > 1 ? 'swap-warning' : ''}>
                        {priceImpact}
                      </span>
                    </div>
                  )}
                  {evmQuote?.gasCostUSD && (
                    <div className="swap-quote-row">
                      <span>Est. Gas Cost</span>
                      <span>${parseFloat(evmQuote.gasCostUSD).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="swap-quote-row">
                    <span>Route</span>
                    <span className="swap-route">{routeDisplay || 'Direct'}</span>
                  </div>
                  {quote?.platformFeeFormatted && referralStatus?.enabled && (
                    <div className="swap-quote-row">
                      <span>Platform Fee ({referralStatus.feeBps / 100}%)</span>
                      <span>
                        {quote.platformFeeFormatted} {outputToken.symbol}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Slippage Setting */}
              <div className="swap-slippage">
                <div className="swap-slippage-header">
                  <span>Slippage Tolerance</span>
                  <button 
                    className="swap-slippage-custom-toggle"
                    onClick={() => setShowCustomSlippage(!showCustomSlippage)}
                    type="button"
                  >
                    {showCustomSlippage ? 'Presets' : 'Custom'}
                  </button>
                </div>
                
                {!showCustomSlippage ? (
                  <div className="swap-slippage-options">
                    {[50, 100, 200, 500, 1000].map((bps) => (
                      <button
                        key={bps}
                        className={`swap-slippage-btn ${slippageBps === bps && !customSlippage ? 'active' : ''}`}
                        onClick={() => {
                          setSlippageBps(bps);
                          setCustomSlippage('');
                        }}
                      >
                        {bps / 100}%
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="swap-slippage-custom">
                    <input
                      type="number"
                      className="swap-slippage-input"
                      placeholder="e.g. 5"
                      value={customSlippage}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomSlippage(value);
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue) && numValue > 0 && numValue <= 50) {
                          setSlippageBps(Math.round(numValue * 100));
                        }
                      }}
                      min="0.1"
                      max="50"
                      step="0.1"
                    />
                    <span className="swap-slippage-suffix">%</span>
                  </div>
                )}
                
                {/* High slippage warning */}
                {slippageBps > 500 && (
                  <div className="swap-slippage-warning">
                    ⚠️ High slippage ({slippageBps / 100}%) - Use for deflationary tokens or high volatility
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && <div className="swap-error">{error}</div>}

              {/* Swap Button */}
              <button
                className="btn btn-primary btn-block swap-execute-btn"
                onClick={handleSwap}
                disabled={
                  !inputToken ||
                  !outputToken ||
                  !hasQuote ||
                  executing ||
                  loadingQuote ||
                  tokensLoading ||
                  !actualTokenAmount ||
                  parseFloat(actualTokenAmount) <= 0 ||
                  (inputBalance !== null && parseFloat(actualTokenAmount) > inputBalance) ||
                  !swapAvailable
                }
              >
                {tokensLoading ? (
                  'Loading Tokens...'
                ) : executing ? (
                  <>
                    <span className="spinner small" />
                    {swapStatus || 'Swapping...'}
                  </>
                ) : loadingQuote ? (
                  'Getting Quote...'
                ) : !swapAvailable ? (
                  'Swap Not Available'
                ) : !inputToken || !outputToken ? (
                  'Select Tokens'
                ) : !actualTokenAmount || parseFloat(actualTokenAmount) <= 0 ? (
                  'Enter Amount'
                ) : inputBalance !== null && parseFloat(actualTokenAmount) > inputBalance ? (
                  'Insufficient Balance'
                ) : !hasQuote ? (
                  'Unable to Quote'
                ) : (
                  <>
                    <SwapIcon size={16} />
                    Swap {inputToken.symbol} for {outputToken.symbol}
                  </>
                )}
              </button>

              {/* External Swap Fallback */}
              <div className="swap-external-option">
                <button className="swap-external-btn" onClick={() => setUseInAppSwap(false)}>
                  <ExternalLinkIcon size={14} />
                  Use {externalSwapName} Website Instead
                </button>
              </div>

              {/* Powered by */}
              <div className="swap-powered-by">
                <span>Powered by</span>
                <img
                  src={poweredByLogo}
                  alt={poweredByName}
                  className="swap-jupiter-logo"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span>{poweredByName}</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // External DEX UI (fallback)
  return (
    <div className="swap-view">
      <div className="form-header">
        <h3>Swap Tokens</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="swap-content">
        <div className="swap-icon-container">
          <SwapIcon size={48} />
        </div>
        <p className="swap-description">{dexInfo.description}</p>

        <div className="swap-info">
          <div className="swap-info-item">
            <span className="swap-info-label">Your Wallet</span>
            <span className="swap-info-value">{truncateAddress(address, 6)}</span>
          </div>
          <div className="swap-info-item">
            <span className="swap-info-label">Network</span>
            <span className="swap-info-value">{chainName}</span>
          </div>
        </div>

        <button
          className="btn btn-secondary btn-block"
          onClick={copyAddress}
          style={{ marginBottom: '12px' }}
        >
          {copied ? (
            <>
              <CheckIcon size={16} />
              Address Copied!
            </>
          ) : (
            <>
              <CopyIcon size={16} />
              Copy Wallet Address
            </>
          )}
        </button>

        <div className="swap-options">
          <button
            className="btn btn-primary btn-block"
            onClick={openDexPopup}
            style={{ marginBottom: '8px' }}
          >
            <SwapIcon size={16} />
            Open {dexInfo.name} Swap
          </button>
          <button className="btn btn-secondary btn-block" onClick={openDexTab}>
            <ExternalLinkIcon size={16} />
            Open in New Tab
          </button>
        </div>

        <p className="swap-note">
          {dexInfo.note} Copy your address above if you need to send tokens back to this wallet.
        </p>

        {swapAvailable && (
          <div className="swap-inapp-option">
            <button className="swap-inapp-btn" onClick={() => setUseInAppSwap(true)}>
              <SwapIcon size={14} />
              Use In-App Swap
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SwapView;
