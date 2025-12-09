

import React, { useState, useMemo } from 'react';
import { QueuedRequest } from '../../dapp/types';
import { formatOrigin as formatOriginUtil } from '../../shared/utils/formatOrigin';


const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  siteInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '12px',
  },
  favicon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faviconImage: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  origin: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
    textAlign: 'center' as const,
  },
  requestText: {
    fontSize: '14px',
    color: '#94a3b8',
    textAlign: 'center' as const,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#94a3b8',
  },
  viewToggle: {
    display: 'flex',
    gap: '4px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
    padding: '2px',
  },
  toggleButton: {
    padding: '4px 10px',
    fontSize: '12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: 'transparent',
    color: '#64748b',
  },
  toggleButtonActive: {
    background: 'rgba(91, 95, 199, 0.3)',
    color: '#ffffff',
  },
  messageBox: {
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  hexBox: {
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#94a3b8',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    maxHeight: '200px',
    overflowY: 'auto' as const,
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  warningBox: {
    display: 'flex',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(251, 191, 36, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(251, 191, 36, 0.3)',
  },
  dangerBox: {
    display: 'flex',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
  },
  warningIcon: {
    width: 24,
    height: 24,
    flexShrink: 0,
  },
  warningText: {
    fontSize: '13px',
    color: '#fbbf24',
    lineHeight: 1.5,
  },
  dangerText: {
    fontSize: '13px',
    color: '#ef4444',
    lineHeight: 1.5,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
  },
  infoLabel: {
    fontSize: '13px',
    color: '#64748b',
  },
  infoValue: {
    fontSize: '13px',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  messageStats: {
    display: 'flex',
    gap: '16px',
    padding: '8px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#64748b',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
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
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
  },
  approveButton: {
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    color: '#ffffff',
  },
};


interface Props {
  request: QueuedRequest;
  onApprove: () => void;
  onReject: (reason?: string) => void;
}


export function SignApproval({ request, onApprove, onReject }: Props) {
  const [viewMode, setViewMode] = useState<'text' | 'hex'>('text');

  
  const formattedOrigin = useMemo(() => formatOriginUtil(request.origin), [request.origin]);

  
  const messageData = useMemo(() => {
    const params = request.params as unknown[];
    if (!params) return { text: '', hex: '', isHex: false, byteLength: 0 };

    
    if (request.method === 'personal_sign' && Array.isArray(params)) {
      const message = params[0] as string;
      if (message.startsWith('0x')) {
        const decoded = hexToString(message.slice(2));
        const byteLength = (message.length - 2) / 2;
        return {
          text: decoded,
          hex: message,
          isHex: true,
          byteLength,
        };
      }
      return {
        text: message,
        hex: stringToHex(message),
        isHex: false,
        byteLength: new TextEncoder().encode(message).length,
      };
    }

    
    if (request.method === 'signMessage') {
      const { message } = request.params as { message: string };
      try {
        
        const decoded = atob(message);
        const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
        return {
          text: decoded,
          hex: '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''),
          isHex: false,
          byteLength: bytes.length,
        };
      } catch {
        return {
          text: message,
          hex: '',
          isHex: false,
          byteLength: 0,
        };
      }
    }

    
    if (request.method === 'wallet_switchEthereumChain') {
      const { chainId } = params[0] as { chainId: string };
      return {
        text: `Switch to chain: ${chainId}`,
        hex: '',
        isHex: false,
        byteLength: 0,
      };
    }

    
    if (request.method === 'wallet_addEthereumChain') {
      const chainParams = params[0] as {
        chainId: string;
        chainName: string;
        rpcUrls: string[];
      };
      return {
        text: `Add new chain:\n\nName: ${chainParams.chainName}\nChain ID: ${chainParams.chainId}\nRPC: ${chainParams.rpcUrls?.[0] || 'N/A'}`,
        hex: '',
        isHex: false,
        byteLength: 0,
      };
    }

    return {
      text: JSON.stringify(params, null, 2),
      hex: '',
      isHex: false,
      byteLength: 0,
    };
  }, [request]);

  const getRequestTitle = (): string => {
    switch (request.method) {
      case 'personal_sign':
        return 'Sign Message';
      case 'eth_sign':
        return 'Sign Message (Legacy)';
      case 'signMessage':
        return 'Sign Message';
      case 'wallet_switchEthereumChain':
        return 'Switch Network';
      case 'wallet_addEthereumChain':
        return 'Add Network';
      default:
        return 'Sign Request';
    }
  };

  const getWarnings = (): { type: 'warning' | 'danger'; message: string }[] => {
    const warnings: { type: 'warning' | 'danger'; message: string }[] = [];

    
    if (request.method === 'eth_sign') {
      warnings.push({
        type: 'danger',
        message:
          'eth_sign is deprecated and dangerous. This method can sign arbitrary data that could be a transaction. Only proceed if you absolutely trust this site.',
      });
    }

    
    if (messageData.text.includes('0x') && messageData.byteLength > 100) {
      const looksLikeTx =
        messageData.hex.includes('095ea7b3') || 
        messageData.hex.includes('a9059cbb') || 
        messageData.hex.includes('23b872dd');   

      if (looksLikeTx) {
        warnings.push({
          type: 'danger',
          message:
            'This message appears to contain transaction-like data. Be extremely careful - signing this could authorize token transfers.',
        });
      }
    }

    
    if (messageData.byteLength > 1000) {
      warnings.push({
        type: 'warning',
        message: 'This is a large message. Make sure you understand what you are signing.',
      });
    }

    return warnings;
  };

  const warnings = getWarnings();
  const showViewToggle = messageData.hex && messageData.byteLength > 0;

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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
                fill="#64748b"
              />
            </svg>
          )}
        </div>
        <span style={styles.origin}>{formattedOrigin.etldPlusOne}</span>
        <span style={styles.requestText}>{getRequestTitle()}</span>
      </div>

      {}
      {warnings.map((warning, idx) =>
        warning.type === 'danger' ? (
          <div key={idx} style={styles.dangerBox}>
            <svg style={styles.warningIcon} viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 22h20L12 2z"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
              />
              <path
                d="M12 10v4M12 18h.01"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={styles.dangerText}>{warning.message}</span>
          </div>
        ) : (
          <div key={idx} style={styles.warningBox}>
            <svg style={styles.warningIcon} viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 22h20L12 2z"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
              />
              <path
                d="M12 10v4M12 18h.01"
                stroke="#fbbf24"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={styles.warningText}>{warning.message}</span>
          </div>
        )
      )}

      {}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>
            {request.method.includes('Chain') ? 'Details' : 'Message'}
          </span>
          {showViewToggle && (
            <div style={styles.viewToggle}>
              <button
                style={{
                  ...styles.toggleButton,
                  ...(viewMode === 'text' ? styles.toggleButtonActive : {}),
                }}
                onClick={() => setViewMode('text')}
              >
                Text
              </button>
              <button
                style={{
                  ...styles.toggleButton,
                  ...(viewMode === 'hex' ? styles.toggleButtonActive : {}),
                }}
                onClick={() => setViewMode('hex')}
              >
                Hex
              </button>
            </div>
          )}
        </div>

        {viewMode === 'text' ? (
          <div style={styles.messageBox}>{messageData.text}</div>
        ) : (
          <div style={styles.hexBox}>{messageData.hex}</div>
        )}

        {messageData.byteLength > 0 && (
          <div style={styles.messageStats}>
            <span>{messageData.byteLength} bytes</span>
            {messageData.isHex && <span>• Hex encoded</span>}
          </div>
        )}
      </div>

      {}
      <div style={styles.infoRow}>
        <span style={styles.infoLabel}>Method</span>
        <span style={styles.infoValue}>{request.method}</span>
      </div>

      {}
      <div style={styles.buttons}>
        <button
          style={{ ...styles.button, ...styles.rejectButton }}
          onClick={() => onReject()}
        >
          Cancel
        </button>
        <button
          style={{ ...styles.button, ...styles.approveButton }}
          onClick={onApprove}
        >
          Sign
        </button>
      </div>
    </div>
  );
}


function hexToString(hex: string): string {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substr(i, 2), 16);
    if (charCode > 0 && charCode < 128) {
      str += String.fromCharCode(charCode);
    } else if (charCode >= 128) {
      
      str += '�';
    }
  }
  return str;
}

function stringToHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default SignApproval;
