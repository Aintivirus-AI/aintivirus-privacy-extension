

import React, { useState, useEffect, useMemo } from 'react';
import { QueuedRequest } from '../../dapp/types';
import {
  decodeEvmTx,
  DecodedEvmTx,
  TxWarning,
  getContractDisplayName,
  formatEthValue,
} from '../../decoding';
import { formatOrigin as formatOriginUtil } from '../../shared/utils/formatOrigin';


const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  siteInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
  },
  favicon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  faviconImage: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  siteText: {
    flex: 1,
    minWidth: 0,
  },
  origin: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#ffffff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  requestType: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  txCard: {
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  txHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  txType: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  txAmount: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#22c55e',
  },
  txAmountNegative: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#ef4444',
  },
  txDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txLabel: {
    fontSize: '13px',
    color: '#64748b',
  },
  txValue: {
    fontSize: '13px',
    color: '#ffffff',
    fontFamily: 'monospace',
    maxWidth: '60%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    textAlign: 'right' as const,
  },
  txValueHighlight: {
    color: '#f59e0b',
  },
  txValueDanger: {
    color: '#ef4444',
    fontWeight: 600,
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '8px 0',
  },
  decodedCall: {
    marginTop: '12px',
    padding: '12px',
    background: 'rgba(91, 95, 199, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(91, 95, 199, 0.2)',
  },
  decodedCallHeader: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#5b5fc7',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  decodedParam: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  decodedParamName: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  decodedParamValue: {
    fontSize: '12px',
    color: '#ffffff',
    fontFamily: 'monospace',
    maxWidth: '50%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    textAlign: 'right' as const,
  },
  feeSection: {
    marginTop: '8px',
  },
  feeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  feeLabel: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  feeValue: {
    fontSize: '13px',
    color: '#ffffff',
  },
  warningBox: {
    display: 'flex',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: '8px',
    alignItems: 'flex-start',
  },
  warningDanger: {
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  warningCaution: {
    background: 'rgba(251, 191, 36, 0.1)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
  },
  warningInfo: {
    background: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
  },
  warningIcon: {
    width: 20,
    height: 20,
    flexShrink: 0,
    marginTop: 2,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '2px',
  },
  warningDescription: {
    fontSize: '12px',
    lineHeight: 1.4,
    opacity: 0.9,
  },
  dataSection: {
    marginTop: '4px',
  },
  dataToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#94a3b8',
    border: 'none',
    width: '100%',
    textAlign: 'left' as const,
  },
  dataContent: {
    marginTop: '8px',
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#94a3b8',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    maxHeight: '150px',
    overflowY: 'auto' as const,
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  button: {
    flex: 1,
    padding: '14px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: 'none',
  },
  rejectButton: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  },
  approveButton: {
    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    color: '#ffffff',
  },
  kindBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    marginLeft: '8px',
  },
};


interface Props {
  request: QueuedRequest;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}


export function TransactionApproval({ request, onApprove, onReject }: Props) {
  const [showData, setShowData] = useState(false);
  const [decoded, setDecoded] = useState<DecodedEvmTx | null>(null);
  const [isDecoding, setIsDecoding] = useState(true);

  
  const formattedOrigin = useMemo(() => formatOriginUtil(request.origin), [request.origin]);

  
  useEffect(() => {
    let cancelled = false;

    async function decodeTransaction() {
      if (request.chainType !== 'evm') {
        setIsDecoding(false);
        return;
      }

      const params = (request.params as unknown[])?.[0] as {
        from?: string;
        to?: string;
        value?: string;
        data?: string;
        gas?: string;
        gasLimit?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
        gasPrice?: string;
        nonce?: number;
        chainId?: number;
      };

      if (!params) {
        setIsDecoding(false);
        return;
      }

      try {
        
        await new Promise(resolve => setTimeout(resolve, 0));
        
        if (cancelled) return;

        const decodedTx = decodeEvmTx(params);
        
        if (!cancelled) {
          setDecoded(decodedTx);
          setIsDecoding(false);
        }
      } catch (error) {

        if (!cancelled) {
          setIsDecoding(false);
        }
      }
    }

    decodeTransaction();

    return () => {
      cancelled = true;
    };
  }, [request]);

  
  const solanaDetails = useMemo(() => {
    if (request.chainType === 'solana') {
      const params = request.params as {
        transaction: { data: string; isVersioned: boolean };
      };

      return {
        from: 'Your Wallet',
        to: 'Solana Program',
        data: params?.transaction?.data || '',
      };
    }
    return null;
  }, [request]);

  const getKindBadgeStyle = (kind: string) => {
    const colors: Record<string, string> = {
      transfer: '#22c55e',
      approval: '#f59e0b',
      swap: '#3b82f6',
      nft: '#8b5cf6',
      contract_creation: '#ef4444',
      permit2: '#ef4444',
      unknown: '#64748b',
    };
    const color = colors[kind] || colors.unknown;
    return {
      ...styles.kindBadge,
      background: color + '20',
      color: color,
    };
  };

  const getWarningStyle = (level: string) => {
    switch (level) {
      case 'danger':
        return { ...styles.warningBox, ...styles.warningDanger };
      case 'caution':
        return { ...styles.warningBox, ...styles.warningCaution };
      default:
        return { ...styles.warningBox, ...styles.warningInfo };
    }
  };

  const getWarningColor = (level: string) => {
    switch (level) {
      case 'danger':
        return '#ef4444';
      case 'caution':
        return '#fbbf24';
      default:
        return '#3b82f6';
    }
  };

  const getChainName = (chainId?: number): string => {
    if (!chainId) return request.chainType === 'solana' ? 'Solana' : 'Unknown';

    const chains: Record<number, string> = {
      1: 'Ethereum',
      10: 'Optimism',
      56: 'BNB Chain',
      137: 'Polygon',
      42161: 'Arbitrum',
      8453: 'Base',
    };

    return chains[chainId] || `Chain ${chainId}`;
  };

  
  if (isDecoding && request.chainType === 'evm') {
    return (
      <div style={styles.container}>
        <div style={styles.siteInfo}>
          <div style={styles.favicon}>
            {request.favicon ? (
              <img
                src={request.favicon}
                alt=""
                style={styles.faviconImage}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <GlobeIcon />
            )}
          </div>
          <div style={styles.siteText}>
            <div style={styles.origin}>{formattedOrigin.etldPlusOne}</div>
            <div style={styles.requestType}>Transaction Request</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
          <div style={{ marginBottom: '12px' }}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              style={{
                animation: 'spin 1s linear infinite',
                display: 'inline-block',
              }}
            >
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="rgba(91, 95, 199, 0.2)"
                strokeWidth="3"
              />
              <path
                d="M 20 4 A 16 16 0 0 1 36 20"
                stroke="#5b5fc7"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
          <div>Decoding transaction...</div>
        </div>
      </div>
    );
  }

  
  if (decoded) {
    const hasValue =
      decoded.details.valueEth !== '0 ETH' && decoded.details.value !== '0';

    return (
      <div style={styles.container}>
        {}
        <div style={styles.siteInfo}>
          <div style={styles.favicon}>
            {request.favicon ? (
              <img
                src={request.favicon}
                alt=""
                style={styles.faviconImage}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <GlobeIcon />
            )}
          </div>
          <div style={styles.siteText}>
            <div style={styles.origin}>{formattedOrigin.etldPlusOne}</div>
            <div style={styles.requestType}>Transaction Request</div>
          </div>
        </div>

        {}
        {decoded.warnings.map((warning, idx) => (
          <div key={idx} style={getWarningStyle(warning.level)}>
            <WarningIcon color={getWarningColor(warning.level)} />
            <div style={styles.warningContent}>
              <div
                style={{
                  ...styles.warningTitle,
                  color: getWarningColor(warning.level),
                }}
              >
                {warning.title}
              </div>
              <div
                style={{
                  ...styles.warningDescription,
                  color: getWarningColor(warning.level),
                }}
              >
                {warning.description}
              </div>
            </div>
          </div>
        ))}

        {}
        <div style={styles.txCard}>
          <div style={styles.txHeader}>
            <span style={styles.txType}>
              {decoded.summary}
              <span style={getKindBadgeStyle(decoded.kind)}>{decoded.kind}</span>
            </span>
          </div>

          <div style={styles.txDetails}>
            {decoded.details.to && (
              <div style={styles.txRow}>
                <span style={styles.txLabel}>To</span>
                <span style={styles.txValue}>
                  {getContractDisplayName(decoded.details.to)}
                </span>
              </div>
            )}

            {hasValue && (
              <div style={styles.txRow}>
                <span style={styles.txLabel}>Value</span>
                <span
                  style={{
                    ...styles.txValue,
                    ...(decoded.kind === 'transfer'
                      ? styles.txAmountNegative
                      : {}),
                  }}
                >
                  {decoded.kind === 'transfer' ? '−' : ''}
                  {decoded.details.valueEth}
                </span>
              </div>
            )}

            <div style={styles.txRow}>
              <span style={styles.txLabel}>Network</span>
              <span style={styles.txValue}>
                {getChainName(decoded.details.chainId)}
              </span>
            </div>

            {decoded.details.selector && (
              <div style={styles.txRow}>
                <span style={styles.txLabel}>Function</span>
                <span style={styles.txValue}>
                  {decoded.decodedCall?.name || decoded.details.selector}
                </span>
              </div>
            )}
          </div>

          {}
          {decoded.decodedCall && decoded.decodedCall.params.length > 0 && (
            <div style={styles.decodedCall}>
              <div style={styles.decodedCallHeader}>Parameters</div>
              {decoded.decodedCall.params.map((param, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.decodedParam,
                    borderBottom:
                      idx === decoded.decodedCall!.params.length - 1
                        ? 'none'
                        : '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <span style={styles.decodedParamName}>
                    {param.name} ({param.type})
                  </span>
                  <span
                    style={{
                      ...styles.decodedParamValue,
                      ...(param.isAmount && param.displayValue === 'UNLIMITED'
                        ? styles.txValueDanger
                        : param.isAddress
                          ? styles.txValueHighlight
                          : {}),
                    }}
                  >
                    {param.displayValue}
                  </span>
                </div>
              ))}
            </div>
          )}

          {}
          <div style={styles.feeSection}>
            <div style={styles.divider} />
            {decoded.details.gasLimit && (
              <div style={styles.feeRow}>
                <span style={styles.feeLabel}>Gas Limit</span>
                <span style={styles.feeValue}>
                  {parseInt(decoded.details.gasLimit, 16).toLocaleString()}
                </span>
              </div>
            )}
            <div style={styles.feeRow}>
              <span style={styles.feeLabel}>Estimated Fee</span>
              <span style={styles.feeValue}>~0.001 ETH</span>
            </div>
          </div>
        </div>

        {}
        {decoded.details.data && decoded.details.data !== '0x' && (
          <div style={styles.dataSection}>
            <button
              style={styles.dataToggle}
              onClick={() => setShowData(!showData)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  transform: showData ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.2s',
                }}
              >
                <path
                  d="M6 4L10 8L6 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span>
                Raw Data ({decoded.details.dataSize} bytes)
              </span>
            </button>

            {showData && (
              <div style={styles.dataContent}>{decoded.details.data}</div>
            )}
          </div>
        )}

        {}
        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.rejectButton }}
            onClick={() => onReject()}
          >
            Reject
          </button>
          <button
            style={{ ...styles.button, ...styles.approveButton }}
            onClick={onApprove}
          >
            Confirm
          </button>
        </div>
      </div>
    );
  }

  
  return (
    <div style={styles.container}>
      <div style={styles.siteInfo}>
        <div style={styles.favicon}>
          {request.favicon ? (
            <img
              src={request.favicon}
              alt=""
              style={styles.faviconImage}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <GlobeIcon />
          )}
        </div>
        <div style={styles.siteText}>
          <div style={styles.origin}>{formattedOrigin.etldPlusOne}</div>
          <div style={styles.requestType}>Transaction Request</div>
        </div>
      </div>

      <div style={styles.txCard}>
        <div style={styles.txHeader}>
          <span style={styles.txType}>Solana Transaction</span>
        </div>

        <div style={styles.txDetails}>
          <div style={styles.txRow}>
            <span style={styles.txLabel}>From</span>
            <span style={styles.txValue}>{solanaDetails?.from || 'Your Wallet'}</span>
          </div>
          <div style={styles.txRow}>
            <span style={styles.txLabel}>Network</span>
            <span style={styles.txValue}>Solana</span>
          </div>
        </div>
      </div>

      {solanaDetails?.data && (
        <div style={styles.dataSection}>
          <button
            style={styles.dataToggle}
            onClick={() => setShowData(!showData)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                transform: showData ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            >
              <path
                d="M6 4L10 8L6 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>Transaction Data</span>
          </button>

          {showData && (
            <div style={styles.dataContent}>{solanaDetails.data}</div>
          )}
        </div>
      )}

      <div style={styles.buttons}>
        <button
          style={{ ...styles.button, ...styles.rejectButton }}
          onClick={() => onReject()}
        >
          Reject
        </button>
        <button
          style={{ ...styles.button, ...styles.approveButton }}
          onClick={onApprove}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}


function WarningIcon({ color }: { color: string }) {
  return (
    <svg style={styles.warningIcon} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 22h20L12 2z" fill="none" stroke={color} strokeWidth="2" />
      <path
        d="M12 10v4M12 18h.01"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
        fill="#64748b"
      />
    </svg>
  );
}

export default TransactionApproval;
