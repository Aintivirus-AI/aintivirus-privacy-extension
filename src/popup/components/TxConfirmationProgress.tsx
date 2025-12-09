

import React from 'react';
import {
  TxDisplayStatus,
  SolanaConfirmationProgress,
  EVMConfirmationProgress,
  SolanaCommitment,
  getSolanaCommitmentDescription,
  getEstimatedTimeRemaining,
  getStatusActionSuggestion,
  isInProgress,
} from '@wallet/txStatus';


export interface TxConfirmationProgressProps {
  
  chainType: 'solana' | 'evm';
  
  status: TxDisplayStatus;
  
  progress: SolanaConfirmationProgress | EVMConfirmationProgress;
  
  chainId?: string;
  
  detailed?: boolean;
  
  className?: string;
}


interface SolanaProgressProps {
  progress: SolanaConfirmationProgress;
  status: TxDisplayStatus;
  detailed: boolean;
}

function SolanaProgress({ progress, status, detailed }: SolanaProgressProps) {
  const steps: { level: SolanaCommitment; label: string }[] = [
    { level: 'processed', label: 'Processed' },
    { level: 'confirmed', label: 'Confirmed' },
    { level: 'finalized', label: 'Finalized' },
  ];

  const getCurrentStepIndex = () => {
    const idx = steps.findIndex(s => s.level === progress.commitment);
    return idx >= 0 ? idx : -1;
  };

  const currentIdx = getCurrentStepIndex();
  const isComplete = status === 'confirmed';
  const isFailed = status === 'failed';

  return (
    <div className="solana-progress">
      <div className="progress-steps">
        {steps.map((step, idx) => {
          const isActive = idx === currentIdx && !isComplete;
          const isCompleted = idx < currentIdx || (idx === currentIdx && isComplete);
          const isPending = idx > currentIdx;

          return (
            <div
              key={step.level}
              className={`progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isPending ? 'pending' : ''} ${isFailed && idx === currentIdx ? 'failed' : ''}`}
            >
              <div className="step-indicator">
                {isCompleted ? (
                  <CheckIcon />
                ) : isFailed && idx === currentIdx ? (
                  <XIcon />
                ) : (
                  <span className="step-number">{idx + 1}</span>
                )}
              </div>
              <span className="step-label">{step.label}</span>
              {idx < steps.length - 1 && (
                <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />
              )}
            </div>
          );
        })}
      </div>

      {detailed && progress.commitment && (
        <div className="progress-description">
          <p>{getSolanaCommitmentDescription(progress.commitment)}</p>
          {progress.slot && (
            <span className="progress-slot">Slot: {progress.slot.toLocaleString()}</span>
          )}
        </div>
      )}

      <style>{`
        .solana-progress {
          padding: 12px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
        }

        .progress-steps {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          position: relative;
        }

        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          position: relative;
          z-index: 1;
          flex: 1;
        }

        .step-indicator {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-secondary);
          border: 2px solid var(--border-default);
          transition: all 0.2s ease;
        }

        .step-number {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .step-label {
          font-size: 10px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .step-connector {
          position: absolute;
          top: 14px;
          left: calc(50% + 14px);
          right: calc(-50% + 14px);
          height: 2px;
          background: var(--border-default);
          z-index: 0;
        }

        .step-connector.completed {
          background: var(--success);
        }

        .progress-step.active .step-indicator {
          border-color: var(--accent-primary);
          background: var(--accent-muted);
          animation: step-pulse 2s ease-in-out infinite;
        }

        .progress-step.active .step-number {
          color: var(--accent-primary);
        }

        .progress-step.active .step-label {
          color: var(--accent-primary);
        }

        .progress-step.completed .step-indicator {
          border-color: var(--success);
          background: var(--success);
          color: white;
        }

        .progress-step.completed .step-label {
          color: var(--success);
        }

        .progress-step.completed .step-indicator svg {
          width: 14px;
          height: 14px;
        }

        .progress-step.failed .step-indicator {
          border-color: var(--error);
          background: var(--error);
          color: white;
        }

        .progress-step.failed .step-label {
          color: var(--error);
        }

        @keyframes step-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .progress-description {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
        }

        .progress-description p {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 0;
          line-height: 1.4;
        }

        .progress-slot {
          display: inline-block;
          margin-top: 6px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 2px 8px;
          border-radius: var(--radius-sm);
        }

        @media (prefers-reduced-motion: reduce) {
          .progress-step.active .step-indicator {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}


interface EVMProgressProps {
  progress: EVMConfirmationProgress;
  status: TxDisplayStatus;
  chainId?: string;
  detailed: boolean;
}

function EVMProgress({ progress, status, chainId, detailed }: EVMProgressProps) {
  const isComplete = status === 'confirmed';
  const isFailed = status === 'failed';
  const isPending = status === 'pending';

  return (
    <div className="evm-progress">
      <div className="progress-header">
        <span className="progress-label">
          {isPending ? 'Awaiting inclusion...' : 'Confirmations'}
        </span>
        {!isPending && (
          <span className="progress-count">
            {progress.current} / {progress.target}
          </span>
        )}
      </div>

      <div className="progress-bar-container">
        <div
          className={`progress-bar ${isComplete ? 'complete' : ''} ${isFailed ? 'failed' : ''}`}
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {detailed && (
        <div className="progress-details">
          {progress.blockNumber && (
            <div className="progress-detail-row">
              <span className="detail-label">Block</span>
              <span className="detail-value">{progress.blockNumber.toLocaleString()}</span>
            </div>
          )}
          {progress.currentBlock && progress.blockNumber && (
            <div className="progress-detail-row">
              <span className="detail-label">Current Block</span>
              <span className="detail-value">{progress.currentBlock.toLocaleString()}</span>
            </div>
          )}
          {isInProgress(status) && chainId && (
            <div className="progress-detail-row">
              <span className="detail-label">Est. Time</span>
              <span className="detail-value">
                {getEstimatedTimeRemaining(status, 'evm', chainId, progress) || 'Calculating...'}
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        .evm-progress {
          padding: 12px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
        }

        .progress-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .progress-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .progress-count {
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .progress-bar-container {
          height: 6px;
          background: var(--bg-secondary);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), var(--accent-hover));
          border-radius: 3px;
          transition: width 0.5s ease;
          animation: bar-shimmer 2s ease-in-out infinite;
        }

        .progress-bar.complete {
          background: var(--success);
          animation: none;
        }

        .progress-bar.failed {
          background: var(--error);
          animation: none;
        }

        @keyframes bar-shimmer {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .progress-details {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .progress-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .detail-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        .detail-value {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-secondary);
        }

        @media (prefers-reduced-motion: reduce) {
          .progress-bar {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}


const CheckIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
  </svg>
);


export function TxConfirmationProgress({
  chainType,
  status,
  progress,
  chainId,
  detailed = false,
  className = '',
}: TxConfirmationProgressProps) {
  const actionSuggestion = getStatusActionSuggestion(status, chainType);

  return (
    <div className={`tx-confirmation-progress ${className}`}>
      {chainType === 'solana' ? (
        <SolanaProgress
          progress={progress as SolanaConfirmationProgress}
          status={status}
          detailed={detailed}
        />
      ) : (
        <EVMProgress
          progress={progress as EVMConfirmationProgress}
          status={status}
          chainId={chainId}
          detailed={detailed}
        />
      )}

      {actionSuggestion && detailed && (
        <div className="action-suggestion">
          <InfoIcon />
          <span>{actionSuggestion}</span>
        </div>
      )}

      <style>{`
        .tx-confirmation-progress {
          width: 100%;
        }

        .action-suggestion {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-top: 12px;
          padding: 10px 12px;
          background: var(--accent-muted);
          border-radius: var(--radius-md);
          border: 1px solid var(--accent-primary);
        }

        .action-suggestion svg {
          flex-shrink: 0;
          width: 14px;
          height: 14px;
          color: var(--accent-primary);
          margin-top: 1px;
        }

        .action-suggestion span {
          font-size: 12px;
          color: var(--accent-primary);
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}

const InfoIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7v4" strokeLinecap="round" />
    <circle cx="8" cy="5" r="0.5" fill="currentColor" />
  </svg>
);


export interface TxProgressIndicatorProps {
  
  percentage: number;
  
  complete?: boolean;
  
  failed?: boolean;
  
  size?: number;
  
  strokeWidth?: number;
  
  className?: string;
}


export function TxProgressIndicator({
  percentage,
  complete = false,
  failed = false,
  size = 20,
  strokeWidth = 2,
  className = '',
}: TxProgressIndicatorProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`tx-progress-indicator ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`}>
        {}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={strokeWidth}
        />
        {}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={complete ? 'var(--success)' : failed ? 'var(--error)' : 'var(--accent-primary)'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: 'stroke-dashoffset 0.5s ease',
          }}
        />
      </svg>

      <style>{`
        .tx-progress-indicator {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .tx-progress-indicator svg {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  );
}

export default TxConfirmationProgress;
