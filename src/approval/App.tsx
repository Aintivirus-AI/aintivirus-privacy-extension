import React, { useState, useEffect } from 'react';
import { ConnectApproval } from './components/ConnectApproval';
import { SignApproval } from './components/SignApproval';
import { SignTypedDataApproval } from './components/SignTypedDataApproval';
import { TransactionApproval } from './components/TransactionApproval';
import { QueuedRequest, AccountInfo } from '../dapp/types';

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #1a1b2e 0%, #0f0f1a 100%)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    width: 32,
    height: 32,
    background: 'linear-gradient(135deg, #5b5fc7 0%, #9945FF 100%)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#ffffff',
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '16px',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#5b5fc7',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  error: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#ef4444',
  },
};

export function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<QueuedRequest | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');

    if (!requestId) {
      setError('No request ID provided');
      setLoading(false);
      return;
    }

    fetchRequestDetails(requestId);
  }, []);

  async function fetchRequestDetails(requestId: string) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DAPP_GET_PENDING_REQUESTS',
        payload: undefined,
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch requests');
      }

      const requests = response.data as QueuedRequest[];
      const targetRequest = requests.find((r) => r.id === requestId);

      if (!targetRequest) {
        setError('Request not found or already processed');
        setLoading(false);
        return;
      }

      setRequest(targetRequest);

      const walletResponse = await chrome.runtime.sendMessage({
        type: 'WALLET_GET_STATE',
        payload: undefined,
      });

      if (walletResponse.success && walletResponse.data) {
        const walletState = walletResponse.data;

        const accountList: AccountInfo[] = [];

        if (targetRequest.chainType === 'solana' && walletState.address) {
          accountList.push({
            address: walletState.address,
            label: walletState.activeWalletName || 'Main Wallet',
            balance: walletState.balance ? `${walletState.balance} SOL` : undefined,
            isActive: true,
          });
        }

        if (targetRequest.chainType === 'evm' && walletState.evmAddress) {
          accountList.push({
            address: walletState.evmAddress,
            label: walletState.activeWalletName || 'Main Wallet',
            isActive: true,
          });
        }

        setAccounts(accountList);
      }

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  async function handleApprove(selectedAccounts: string[], remember: boolean) {
    if (!request) return;

    try {
      setLoading(true);

      await chrome.runtime.sendMessage({
        type: 'DAPP_APPROVE',
        payload: {
          requestId: request.id,
          selectedAccounts,
          remember,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
      setLoading(false);
    }
  }

  async function handleReject(reason?: string) {
    if (!request) return;

    try {
      setLoading(true);

      await chrome.runtime.sendMessage({
        type: 'DAPP_REJECT',
        payload: {
          requestId: request.id,
          reason: reason || 'User rejected',
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span style={{ color: '#94a3b8' }}>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <Header />
        <div style={styles.error}>
          <p>{error}</p>
          <button
            onClick={() => window.close()}
            style={{
              marginTop: 16,
              padding: '12px 24px',
              background: '#5b5fc7',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <Header />
      <div style={styles.content}>
        {request && renderApprovalComponent(request, accounts, handleApprove, handleReject)}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={styles.header}>
      <div style={styles.logo}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2L20 6V12C20 17.52 16.79 22.12 12 23C7.21 22.12 4 17.52 4 12V6L12 2Z"
            fill="white"
          />
          <path
            d="M10 8L14 12L10 16"
            stroke="#5b5fc7"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span style={styles.title}>Aintivirus Wallet</span>
    </div>
  );
}

function isTypedDataRequest(request: QueuedRequest): boolean {
  return (
    request.method === 'eth_signTypedData' ||
    request.method === 'eth_signTypedData_v3' ||
    request.method === 'eth_signTypedData_v4'
  );
}

function renderApprovalComponent(
  request: QueuedRequest,
  accounts: AccountInfo[],
  onApprove: (accounts: string[], remember: boolean) => void,
  onReject: (reason?: string) => void,
) {
  const { approvalType } = request;

  switch (approvalType) {
    case 'connect':
      return (
        <ConnectApproval
          request={request}
          accounts={accounts}
          onApprove={onApprove}
          onReject={onReject}
        />
      );

    case 'signMessage':
      if (isTypedDataRequest(request)) {
        return (
          <SignTypedDataApproval
            request={request}
            onApprove={() => onApprove([], false)}
            onReject={onReject}
          />
        );
      }
      return (
        <SignApproval
          request={request}
          onApprove={() => onApprove([], false)}
          onReject={onReject}
        />
      );

    case 'sign':
    case 'transaction':
      return (
        <TransactionApproval
          request={request}
          onApprove={() => onApprove([], false)}
          onReject={onReject}
        />
      );

    case 'switchChain':
    case 'addChain':
      return (
        <SignApproval
          request={request}
          onApprove={() => onApprove([], false)}
          onReject={onReject}
        />
      );

    default:
      return (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <p>Unknown approval type: {approvalType}</p>
          <button onClick={() => onReject('Unknown approval type')}>Cancel</button>
        </div>
      );
  }
}

export default App;
