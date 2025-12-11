/**
 * Tests for AddressChip component
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddressChip } from '../AddressChip';
import { ToastProvider } from '../ToastProvider';
import { TEST_SOLANA_ADDRESS, TEST_EVM_ADDRESS } from '../../../__tests__/utils/fixtures';

// Create a mock for clipboard.writeText
const mockWriteText = jest.fn().mockResolvedValue(undefined);

// Set up clipboard mock at module level
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: mockWriteText,
    readText: jest.fn().mockResolvedValue(''),
  },
  writable: true,
  configurable: true,
});

// Helper to render with provider
const renderWithProvider = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('AddressChip', () => {
  beforeEach(() => {
    // Reset the clipboard mock before each test
    mockWriteText.mockClear();
    mockWriteText.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should render with Solana address', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      // Should display truncated address
      expect(screen.getByText(/\.\.\./, { exact: false })).toBeInTheDocument();
    });

    it('should render with EVM address', () => {
      renderWithProvider(
        <AddressChip address={TEST_EVM_ADDRESS} chain="evm" evmChainId="ethereum" />,
      );

      expect(screen.getByText(/\.\.\./, { exact: false })).toBeInTheDocument();
    });

    it('should render with label', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" label="My Wallet" />,
      );

      expect(screen.getByText('My Wallet')).toBeInTheDocument();
    });

    it('should display full address in title', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" showFullOnHover />,
      );

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveAttribute('title', TEST_SOLANA_ADDRESS);
    });

    it('should not display title when showFullOnHover is false', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" showFullOnHover={false} />,
      );

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).not.toHaveAttribute('title');
    });
  });

  describe('Sizes', () => {
    it('should render small size', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" size="sm" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveClass('address-chip-sm');
    });

    it('should render medium size by default', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveClass('address-chip-md');
    });

    it('should render large size', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" size="lg" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveClass('address-chip-lg');
    });
  });

  describe('Copy functionality', () => {
    it('should copy address when clicking (without copy button)', async () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" showCopyButton={false} />,
      );

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      fireEvent.click(chip);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(TEST_SOLANA_ADDRESS);
      });
    });

    it('should copy address when clicking copy button', async () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" showCopyButton />,
      );

      const copyButton = screen.getByLabelText('Copy address');
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(TEST_SOLANA_ADDRESS);
      });
    });

    it('should call onCopy callback', async () => {
      const onCopy = jest.fn();
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" onCopy={onCopy} />,
      );

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      fireEvent.click(chip);

      await waitFor(() => {
        expect(onCopy).toHaveBeenCalled();
      });
    });

    it('should show copied state', async () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      fireEvent.click(chip);

      await waitFor(() => {
        expect(chip).toHaveClass('copied');
      });
    });

    it('should handle copy error', async () => {
      mockWriteText.mockRejectedValueOnce(new Error('Copy failed'));

      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      fireEvent.click(chip);

      // Should show error toast (check toast appears)
      await waitFor(
        () => {
          expect(screen.getByText('Failed to copy')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    });
  });

  describe('Explorer link', () => {
    it('should show explorer link by default', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      // ExplorerLinkIcon should be rendered
      expect(document.querySelector('.address-chip-explorer')).toBeInTheDocument();
    });

    it('should hide explorer link when showExplorer is false', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" showExplorer={false} />,
      );

      expect(document.querySelector('.address-chip-explorer')).not.toBeInTheDocument();
    });
  });

  describe('First time warning', () => {
    it('should show warning icon for first time addresses', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" isFirstTime />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveClass('first-time');
      expect(screen.getByLabelText('First time sending to this address')).toBeInTheDocument();
    });

    it('should not show warning icon by default', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).not.toHaveClass('first-time');
    });
  });

  describe('Accessibility', () => {
    it('should have correct aria-label', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" label="Main Wallet" />,
      );

      const chip = screen.getByRole('button', { name: /Main Wallet:.*Click to copy/i });
      expect(chip).toHaveAttribute('aria-label');
      expect(chip.getAttribute('aria-label')).toContain('Main Wallet');
      expect(chip.getAttribute('aria-label')).toContain(TEST_SOLANA_ADDRESS);
    });

    it('should be focusable', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveAttribute('tabIndex', '0');
    });

    it('should support keyboard interaction', async () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      chip.focus();
      fireEvent.keyDown(chip, { key: 'Enter' });

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith(TEST_SOLANA_ADDRESS);
      });
    });
  });

  describe('Identicon', () => {
    it('should render identicon', () => {
      renderWithProvider(<AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />);

      const identicon = document.querySelector('.address-identicon');
      expect(identicon).toBeInTheDocument();
    });

    it('should have consistent identicon for same address', () => {
      const { rerender } = renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />,
      );

      const identicon1 = document.querySelector('.address-identicon svg')?.innerHTML;

      rerender(
        <ToastProvider>
          <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" />
        </ToastProvider>,
      );

      const identicon2 = document.querySelector('.address-identicon svg')?.innerHTML;

      expect(identicon1).toBe(identicon2);
    });
  });

  describe('Custom styling', () => {
    it('should apply custom className', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" className="custom-class" />,
      );

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveClass('custom-class');
    });

    it('should apply custom style', () => {
      renderWithProvider(
        <AddressChip address={TEST_SOLANA_ADDRESS} chain="solana" style={{ marginTop: '10px' }} />,
      );

      const chip = screen.getByRole('button', { name: /.*Click to copy/i });
      expect(chip).toHaveStyle({ marginTop: '10px' });
    });
  });
});
