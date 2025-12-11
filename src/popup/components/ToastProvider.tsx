import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import { CheckIcon, CloseIcon, AlertIcon } from '../Icons';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

export interface ToastContextValue {
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 2500;
const MAX_TOASTS = 3;

let toastCounter = 0;
const generateToastId = (): string => {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
};

const getVariantIcon = (variant: ToastVariant): React.ReactNode => {
  switch (variant) {
    case 'success':
      return <CheckIcon size={16} />;
    case 'error':
      return <AlertIcon size={16} />;
    case 'info':
    default:
      return null;
  }
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);

    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      handleDismiss();
    }, toast.duration);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [toast.duration, handleDismiss]);

  const icon = getVariantIcon(toast.variant);

  return (
    <div
      className={`toast toast-${toast.variant} ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {icon && <span className="toast-icon">{icon}</span>}
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        type="button"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = 'success', duration: number = DEFAULT_DURATION) => {
      const newToast: Toast = {
        id: generateToastId(),
        message,
        variant,
        duration,
      };

      setToasts((prev) => {
        const trimmed = prev.slice(-(MAX_TOASTS - 1));
        return [...trimmed, newToast];
      });
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue: ToastContextValue = {
    addToast,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastProvider;
