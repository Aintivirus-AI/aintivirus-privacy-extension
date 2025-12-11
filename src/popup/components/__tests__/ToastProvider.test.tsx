/**
 * Tests for ToastProvider component
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast, ToastVariant } from '../ToastProvider';

// Test component that uses the toast hook
const TestConsumer: React.FC<{
  message?: string;
  variant?: ToastVariant;
  duration?: number;
}> = ({ message = 'Test message', variant = 'success', duration }) => {
  const { addToast } = useToast();

  return <button onClick={() => addToast(message, variant, duration)}>Show Toast</button>;
};

// Helper to render with provider
const renderWithProvider = (children: React.ReactNode) => {
  return render(<ToastProvider>{children}</ToastProvider>);
};

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('should render children', () => {
      renderWithProvider(<div data-testid="child">Child content</div>);

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should not render toast container when no toasts', () => {
      renderWithProvider(<div>Content</div>);

      expect(screen.queryByLabelText('Notifications')).not.toBeInTheDocument();
    });
  });

  describe('addToast', () => {
    it('should display toast when addToast is called', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer message="Hello World" />);

      await user.click(screen.getByText('Show Toast'));

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should display success toast by default', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer />);

      await user.click(screen.getByText('Show Toast'));

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast-success');
    });

    it('should display error toast', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer variant="error" />);

      await user.click(screen.getByText('Show Toast'));

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast-error');
    });

    it('should display info toast', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer variant="info" />);

      await user.click(screen.getByText('Show Toast'));

      const toast = screen.getByRole('status');
      expect(toast).toHaveClass('toast-info');
    });
  });

  describe('Auto-dismiss', () => {
    it('should auto-dismiss after default duration', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer />);

      await user.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Test message')).toBeInTheDocument();

      // Default duration is 2500ms + 200ms animation
      act(() => {
        jest.advanceTimersByTime(2700);
      });

      await waitFor(() => {
        expect(screen.queryByText('Test message')).not.toBeInTheDocument();
      });
    });

    it('should respect custom duration', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer duration={1000} />);

      await user.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Test message')).toBeInTheDocument();

      // Should still be visible before duration
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.getByText('Test message')).toBeInTheDocument();

      // Should be gone after duration + animation
      act(() => {
        jest.advanceTimersByTime(800);
      });

      await waitFor(() => {
        expect(screen.queryByText('Test message')).not.toBeInTheDocument();
      });
    });
  });

  describe('Manual dismiss', () => {
    it('should dismiss when clicking dismiss button', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer />);

      await user.click(screen.getByText('Show Toast'));
      expect(screen.getByText('Test message')).toBeInTheDocument();

      const dismissButton = screen.getByLabelText('Dismiss notification');
      await user.click(dismissButton);

      // Wait for animation
      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(screen.queryByText('Test message')).not.toBeInTheDocument();
      });
    });
  });

  describe('Multiple toasts', () => {
    it('should display multiple toasts', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      const MultiToastConsumer: React.FC = () => {
        const { addToast } = useToast();
        return (
          <>
            <button onClick={() => addToast('Toast 1')}>Show 1</button>
            <button onClick={() => addToast('Toast 2')}>Show 2</button>
          </>
        );
      };

      renderWithProvider(<MultiToastConsumer />);

      await user.click(screen.getByText('Show 1'));
      await user.click(screen.getByText('Show 2'));

      expect(screen.getByText('Toast 1')).toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();
    });

    it('should limit to MAX_TOASTS', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      const ManyToastsConsumer: React.FC = () => {
        const { addToast } = useToast();
        return (
          <button
            onClick={() => {
              addToast('Toast 1');
              addToast('Toast 2');
              addToast('Toast 3');
              addToast('Toast 4');
              addToast('Toast 5');
            }}
          >
            Show Many
          </button>
        );
      };

      renderWithProvider(<ManyToastsConsumer />);

      await user.click(screen.getByText('Show Many'));

      // Should only show MAX_TOASTS (3) toasts
      const toasts = screen.getAllByRole('status');
      expect(toasts.length).toBeLessThanOrEqual(3);
    });
  });

  describe('useToast hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const BadComponent: React.FC = () => {
        const { addToast } = useToast();
        return <button onClick={() => addToast('test')}>Click</button>;
      };

      expect(() => render(<BadComponent />)).toThrow(
        'useToast must be used within a ToastProvider',
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('should have correct ARIA attributes', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer />);

      await user.click(screen.getByText('Show Toast'));

      const toast = screen.getByRole('status');
      expect(toast).toHaveAttribute('aria-live', 'polite');
      expect(toast).toHaveAttribute('aria-atomic', 'true');
    });

    it('should have accessible dismiss button', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestConsumer />);

      await user.click(screen.getByText('Show Toast'));

      const dismissButton = screen.getByLabelText('Dismiss notification');
      expect(dismissButton).toBeInTheDocument();
      expect(dismissButton).toHaveAttribute('type', 'button');
    });
  });
});
