import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
} from 'react';
import { CheckIcon, CloseIcon, AlertIcon } from '../Icons';

// Toast variant types
export type ToastVariant = 'success' | 'error' | 'info';

// Single toast item
export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

// Context value type
export interface ToastContextValue {
  addToast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

// Create context with undefined default
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Default duration in ms
const DEFAULT_DURATION = 2500;
const MAX_TOASTS = 3;

// Generate unique ID
let toastCounter = 0;
const generateToastId = (): string => {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
};

// Get icon for variant
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

// Single Toast Item Component
interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    // Wait for exit animation before removing
    setTimeout(() => {
      onDismiss(toast.id);
    }, 200);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    // Set auto-dismiss timer
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

// Toast Container Component
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

// Toast Provider Component
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
        // Keep only the most recent MAX_TOASTS - 1 toasts, then add the new one
        const trimmed = prev.slice(-(MAX_TOASTS - 1));
        return [...trimmed, newToast];
      });
    },
    []
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

// Custom hook to use toast
export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastProvider;
