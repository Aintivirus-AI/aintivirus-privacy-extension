import React, { useState, useMemo } from 'react';
import { QueuedRequest } from '../../dapp/types';
import {
  decodeTypedData,
  formatDomain,
  getChainName,
  TypedDataParseResult,
  HighlightedField,
  TxWarning,
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
  card: {
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  cardHeader: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  domainRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  domainLabel: {
    fontSize: '13px',
    color: '#64748b',
  },
  domainValue: {
    fontSize: '13px',
    color: '#ffffff',
    fontFamily: 'monospace',
    maxWidth: '60%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    textAlign: 'right' as const,
  },
  fieldRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '10px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    gap: '12px',
  },
  fieldLabel: {
    fontSize: '13px',
    color: '#94a3b8',
    flexShrink: 0,
  },
  fieldValue: {
    fontSize: '13px',
    color: '#ffffff',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
    textAlign: 'right' as const,
    flex: 1,
  },
  highlightSpender: {
    color: '#f59e0b',
  },
  highlightAmount: {
    color: '#22c55e',
  },
  highlightDeadline: {
    color: '#3b82f6',
  },
  highlightDanger: {
    color: '#ef4444',
    fontWeight: 600,
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
    marginBottom: '4px',
  },
  warningDescription: {
    fontSize: '12px',
    lineHeight: 1.5,
    opacity: 0.9,
  },
  toggleButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#94a3b8',
    border: 'none',
    width: '100%',
    textAlign: 'left' as const,
  },
  rawData: {
    marginTop: '8px',
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#94a3b8',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
    maxHeight: '200px',
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
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#ffffff',
  },
  approveButton: {
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    color: '#ffffff',
  },
  patternBadge: {
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

export function SignTypedDataApproval({ request, onApprove, onReject }: Props) {
  const [showRaw, setShowRaw] = useState(false);

  const parseResult = useMemo(() => {
    const params = request.params as unknown[];
    if (!params || params.length < 2) {
      return null;
    }

    const typedDataString = params[1] as string;
    return decodeTypedData(typedDataString);
  }, [request.params]);

  const formattedOrigin = useMemo(() => formatOriginUtil(request.origin), [request.origin]);

  const getPatternLabel = (pattern: string): { label: string; color: string } => {
    switch (pattern) {
      case 'permit':
        return { label: 'Permit', color: '#f59e0b' };
      case 'permit2':
        return { label: 'Permit2', color: '#ef4444' };
      case 'permit2_batch':
        return { label: 'Batch Permit2', color: '#ef4444' };
      case 'order':
        return { label: 'Order', color: '#3b82f6' };
      case 'vote':
        return { label: 'Vote', color: '#8b5cf6' };
      case 'delegation':
        return { label: 'Delegation', color: '#06b6d4' };
      default:
        return { label: '', color: 'transparent' };
    }
  };

  const getFieldStyle = (field: HighlightedField): React.CSSProperties => {
    switch (field.highlight) {
      case 'spender':
      case 'operator':
        return styles.highlightSpender;
      case 'amount':
        if (field.displayValue === 'UNLIMITED') {
          return styles.highlightDanger;
        }
        return styles.highlightAmount;
      case 'deadline':
        if (field.displayValue.includes('Never') || field.displayValue.includes('2099')) {
          return styles.highlightDanger;
        }
        return styles.highlightDeadline;
      default:
        return {};
    }
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

  if (!parseResult || !parseResult.isValid) {
    return (
      <div style={styles.container}>
        <div style={styles.siteInfo}>
          <div style={styles.favicon}>
            <WarningIcon color="#ef4444" />
          </div>
          <span style={styles.origin}>{formattedOrigin.etldPlusOne}</span>
          <span style={styles.requestText}>Sign Typed Data</span>
        </div>

        <div style={{ ...styles.warningBox, ...styles.warningDanger }}>
          <WarningIcon color="#ef4444" />
          <div style={styles.warningContent}>
            <div style={{ ...styles.warningTitle, color: '#ef4444' }}>
              Could not parse typed data
            </div>
            <div style={{ ...styles.warningDescription, color: '#ef4444' }}>
              {parseResult?.error || 'Invalid typed data format'}
            </div>
          </div>
        </div>

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
            Sign Anyway
          </button>
        </div>
      </div>
    );
  }

  const { displayModel, warnings, pattern, raw } = parseResult;
  const patternInfo = getPatternLabel(pattern);

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
        <span style={styles.origin}>{formattedOrigin.etldPlusOne}</span>
        <span style={styles.requestText}>
          Sign {displayModel?.primaryType || 'Typed Data'}
          {patternInfo.label && (
            <span
              style={{
                ...styles.patternBadge,
                background: patternInfo.color + '20',
                color: patternInfo.color,
              }}
            >
              {patternInfo.label}
            </span>
          )}
        </span>
      </div>

      {warnings.map((warning, idx) => (
        <div key={idx} style={getWarningStyle(warning.level)}>
          <WarningIcon color={getWarningColor(warning.level)} />
          <div style={styles.warningContent}>
            <div style={{ ...styles.warningTitle, color: getWarningColor(warning.level) }}>
              {warning.title}
            </div>
            <div style={{ ...styles.warningDescription, color: getWarningColor(warning.level) }}>
              {warning.description}
            </div>
          </div>
        </div>
      ))}

      {displayModel?.domain && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>Domain</div>
          {displayModel.domain.name && (
            <div style={styles.domainRow}>
              <span style={styles.domainLabel}>Name</span>
              <span style={styles.domainValue}>{displayModel.domain.name}</span>
            </div>
          )}
          {displayModel.domain.version && (
            <div style={styles.domainRow}>
              <span style={styles.domainLabel}>Version</span>
              <span style={styles.domainValue}>{displayModel.domain.version}</span>
            </div>
          )}
          {displayModel.domain.chainId && (
            <div style={styles.domainRow}>
              <span style={styles.domainLabel}>Chain</span>
              <span style={styles.domainValue}>
                {getChainName(displayModel.domain.chainId)} ({displayModel.domain.chainId})
              </span>
            </div>
          )}
          {displayModel.domain.verifyingContract && (
            <div style={{ ...styles.domainRow, borderBottom: 'none' }}>
              <span style={styles.domainLabel}>Contract</span>
              <span style={styles.domainValue}>
                {displayModel.domain.verifyingContract.slice(0, 10)}...
                {displayModel.domain.verifyingContract.slice(-8)}
              </span>
            </div>
          )}
        </div>
      )}

      {displayModel?.messageFields && displayModel.messageFields.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>{displayModel.primaryType}</div>
          {displayModel.messageFields.map((field, idx) => (
            <div
              key={idx}
              style={{
                ...styles.fieldRow,
                borderBottom:
                  idx === displayModel.messageFields.length - 1
                    ? 'none'
                    : '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <span style={styles.fieldLabel}>{field.name}</span>
              <span style={{ ...styles.fieldValue, ...getFieldStyle(field) }}>
                {field.displayValue}
                {field.highlight !== 'normal' && field.displayValue === 'UNLIMITED' && ' ⚠️'}
              </span>
            </div>
          ))}
        </div>
      )}

      {displayModel?.nestedStructs?.map((struct, structIdx) => (
        <div key={structIdx} style={styles.card}>
          <div style={styles.cardHeader}>{struct.name}</div>
          {struct.fields.map((field, idx) => (
            <div
              key={idx}
              style={{
                ...styles.fieldRow,
                borderBottom:
                  idx === struct.fields.length - 1
                    ? 'none'
                    : '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <span style={styles.fieldLabel}>{field.name}</span>
              <span style={{ ...styles.fieldValue, ...getFieldStyle(field) }}>
                {field.displayValue}
              </span>
            </div>
          ))}
        </div>
      ))}

      <button style={styles.toggleButton} onClick={() => setShowRaw(!showRaw)}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: showRaw ? 'rotate(90deg)' : 'none',
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
        <span>View Raw Data</span>
      </button>

      {showRaw && (
        <div style={styles.rawData}>{JSON.stringify(raw, null, 2)}</div>
      )}

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

function WarningIcon({ color }: { color: string }) {
  return (
    <svg style={styles.warningIcon} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L2 22h20L12 2z"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
        fill="#64748b"
      />
    </svg>
  );
}

export default SignTypedDataApproval;
