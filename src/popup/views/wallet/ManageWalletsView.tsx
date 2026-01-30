/**
 * Manage Wallets View - List, rename, delete, and switch between wallets
 */

import React, { useState, useEffect } from 'react';
import { sendToBackground } from '@shared/messaging';
import type { WalletEntry } from '@shared/types';
import {
  CloseIcon,
  EditIcon,
  TrashIcon,
  KeyIcon,
  LockIcon,
  PlusIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  CopyIcon,
} from '../../Icons';
import { truncateAddress } from '../../utils/format';

export interface ManageWalletsViewProps {
  activeWalletId: string | null;
  onClose: () => void;
  onAddWallet: () => void;
  onWalletSwitch: () => void;
}

export const ManageWalletsView: React.FC<ManageWalletsViewProps> = ({
  activeWalletId,
  onClose,
  onAddWallet,
  onWalletSwitch,
}) => {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Export states
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'mnemonic' | 'privateKey' | null>(null);
  const [exportedData, setExportedData] = useState<string | null>(null);
  const [exportChain, setExportChain] = useState<'solana' | 'evm'>('solana');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    setLoading(true);
    const res = await sendToBackground({ type: 'WALLET_LIST', payload: undefined });
    if (res.success && res.data) {
      setWallets(res.data as WalletEntry[]);
    }
    setLoading(false);
  };

  const handleRename = async () => {
    if (!editingWalletId || !editLabel.trim()) return;
    setProcessing(true);
    setError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_RENAME',
        payload: { walletId: editingWalletId, label: editLabel.trim() },
      });

      if (res.success) {
        setEditingWalletId(null);
        setEditLabel('');
        await fetchWallets();
      } else {
        setError(res.error || 'Failed to rename wallet');
      }
    } catch {
      setError('Failed to rename wallet');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingWalletId || !password) return;
    setProcessing(true);
    setError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_DELETE_ONE',
        payload: { walletId: deletingWalletId, password },
      });

      if (res.success) {
        setDeletingWalletId(null);
        setPassword('');
        await fetchWallets();
        onWalletSwitch(); // Refresh wallet state
      } else {
        setError(res.error || 'Failed to delete wallet');
      }
    } catch {
      setError('Failed to delete wallet');
    } finally {
      setProcessing(false);
    }
  };

  const handleSwitch = async (walletId: string) => {
    if (!walletId) return;
    setProcessing(true);
    setError('');

    try {
      const res = await sendToBackground({
        type: 'WALLET_SWITCH',
        payload: { walletId },
      });

      if (res.success) {
        onWalletSwitch();
        onClose();
      } else {
        setError(res.error || 'Failed to switch wallet');
      }
    } catch {
      setError('Failed to switch wallet');
    } finally {
      setProcessing(false);
    }
  };

  const startEdit = (wallet: WalletEntry) => {
    setEditingWalletId(wallet.id);
    setEditLabel(wallet.label);
    setDeletingWalletId(null);
    setError('');
  };

  const startDelete = (walletId: string) => {
    setDeletingWalletId(walletId);
    setEditingWalletId(null);
    setPassword('');
    setError('');
  };

  // Direct wallet switch - no password needed since wallet is already unlocked
  const startSwitch = (walletId: string) => {
    handleSwitch(walletId);
  };

  const cancelAction = () => {
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setExportingWalletId(null);
    setExportType(null);
    setExportedData(null);
    setPassword('');
    setError('');
    setCopied(false);
  };

  const startExportMnemonic = (walletId: string) => {
    setExportingWalletId(walletId);
    setExportType('mnemonic');
    setExportedData(null);
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setPassword('');
    setError('');
    setCopied(false);
  };

  const startExportPrivateKey = (walletId: string) => {
    setExportingWalletId(walletId);
    setExportType('privateKey');
    setExportedData(null);
    setExportChain('solana');
    setEditingWalletId(null);
    setDeletingWalletId(null);
    setPassword('');
    setError('');
    setCopied(false);
  };

  const handleExport = async () => {
    if (!exportingWalletId || !password || !exportType) return;
    setProcessing(true);
    setError('');

    try {
      if (exportType === 'mnemonic') {
        const res = await sendToBackground({
          type: 'WALLET_EXPORT_ONE',
          payload: { walletId: exportingWalletId, password },
        });
        if (res.success && res.data) {
          const data = res.data as { mnemonic: string };
          setExportedData(data.mnemonic);
        } else {
          setError(res.error || 'Failed to export recovery phrase');
        }
      } else {
        const res = await sendToBackground({
          type: 'WALLET_EXPORT_PRIVATE_KEY',
          payload: { walletId: exportingWalletId, password, chain: exportChain },
        });
        if (res.success && res.data) {
          const data = res.data as { privateKey: string };
          setExportedData(data.privateKey);
        } else {
          setError(res.error || 'Failed to export private key');
        }
      }
    } catch {
      setError('Failed to export');
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyExported = async () => {
    if (!exportedData) return;
    try {
      await navigator.clipboard.writeText(exportedData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  return (
    <div className="manage-wallets-view">
      <div className="form-header">
        <h3>Manage Wallets</h3>
        <button className="close-btn" onClick={onClose}>
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="wallet-count-info">
        <span>{wallets.length} / 100 wallets</span>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : (
        <div className="wallets-list">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className={`wallet-list-item ${wallet.id === activeWalletId ? 'active' : ''}`}
            >
              {editingWalletId === wallet.id ? (
                <div className="wallet-edit-row">
                  <input
                    type="text"
                    className="form-input"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    maxLength={32}
                    autoFocus
                  />
                  <div className="wallet-edit-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleRename}
                      disabled={processing || !editLabel.trim()}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={cancelAction}
                      disabled={processing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : deletingWalletId === wallet.id ? (
                <div className="wallet-confirm-row">
                  <p className="confirm-text">Delete "{wallet.label}"?</p>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Enter password to confirm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                    </button>
                  </div>
                  {error && <div className="form-error">{error}</div>}
                  <div className="wallet-edit-actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={handleDelete}
                      disabled={processing || !password}
                    >
                      {processing ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={cancelAction}
                      disabled={processing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : exportingWalletId === wallet.id ? (
                <div className="wallet-confirm-row">
                  {exportedData ? (
                    <>
                      <p className="confirm-text" style={{ color: 'var(--warning)' }}>
                        ⚠️ {exportType === 'mnemonic' ? 'Recovery Phrase' : 'Private Key'} - Keep
                        this secret!
                      </p>
                      <div
                        className="full-address"
                        style={{
                          marginBottom: 'var(--space-sm)',
                          lineHeight: 1.6,
                          wordBreak: 'break-all',
                          fontSize: '0.75rem',
                          background: 'var(--bg-tertiary)',
                          padding: 'var(--space-sm)',
                          borderRadius: 'var(--radius-sm)',
                          maxHeight: '120px',
                          overflowY: 'auto',
                        }}
                      >
                        {exportedData}
                      </div>
                      <div className="wallet-edit-actions">
                        <button className="btn btn-sm btn-primary" onClick={handleCopyExported}>
                          {copied ? (
                            <>
                              <CheckIcon size={12} /> Copied!
                            </>
                          ) : (
                            <>
                              <CopyIcon size={12} /> Copy
                            </>
                          )}
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={cancelAction}>
                          Done
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="confirm-text">
                        {exportType === 'mnemonic'
                          ? `Export recovery phrase for "${wallet.label}"?`
                          : `Export private key for "${wallet.label}"?`}
                      </p>
                      {exportType === 'privateKey' && (
                        <div style={{ marginBottom: 'var(--space-sm)' }}>
                          <label
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--text-secondary)',
                              marginBottom: '4px',
                              display: 'block',
                            }}
                          >
                            Select chain:
                          </label>
                          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                            <button
                              className={`btn btn-sm ${exportChain === 'solana' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setExportChain('solana')}
                              style={{ flex: 1 }}
                            >
                              Solana
                            </button>
                            <button
                              className={`btn btn-sm ${exportChain === 'evm' ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setExportChain('evm')}
                              style={{ flex: 1 }}
                            >
                              EVM
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="password-input-wrapper">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="form-input"
                          placeholder="Enter password to export"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                      </div>
                      {error && <div className="form-error">{error}</div>}
                      <div className="wallet-edit-actions">
                        <button
                          className="btn btn-sm btn-warning"
                          onClick={handleExport}
                          disabled={processing || !password}
                        >
                          {processing ? 'Exporting...' : 'Export'}
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={cancelAction}
                          disabled={processing}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div
                    className="wallet-item-main"
                    onClick={() => wallet.id !== activeWalletId && startSwitch(wallet.id)}
                  >
                    <div className="wallet-item-info">
                      <span className="wallet-item-label">{wallet.label}</span>
                      <span className="wallet-item-address">
                        {truncateAddress(wallet.publicKey, 6)}
                      </span>
                    </div>
                    {wallet.id === activeWalletId && <span className="active-badge">Active</span>}
                  </div>
                  <div className="wallet-item-actions">
                    <button className="icon-btn" onClick={() => startEdit(wallet)} title="Rename">
                      <EditIcon size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => startExportMnemonic(wallet.id)}
                      title="Show Recovery Phrase"
                    >
                      <KeyIcon size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => startExportPrivateKey(wallet.id)}
                      title="Export Private Key"
                    >
                      <LockIcon size={14} />
                    </button>
                    {wallets.length > 1 && (
                      <button
                        className="icon-btn danger"
                        onClick={() => startDelete(wallet.id)}
                        title="Delete"
                      >
                        <TrashIcon size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn-secondary btn-block"
        onClick={onAddWallet}
        disabled={wallets.length >= 100}
        style={{ marginTop: 'var(--space-md)' }}
      >
        <PlusIcon size={16} />
        <span>Add Wallet</span>
      </button>
    </div>
  );
};

export default ManageWalletsView;
