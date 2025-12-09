

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
} from 'react';


export interface UndoAction {
  id: string;
  message: string;
  
  onUndo: () => void;
  
  onConfirm?: () => void;
  
  duration?: number;
  
  icon?: React.ReactNode;
}

interface ActiveUndo extends UndoAction {
  startTime: number;
  remaining: number;
}

export interface UndoContextValue {
  
  showUndo: (action: Omit<UndoAction, 'id'>) => string;
  
  confirmUndo: (id: string) => void;
  
  dismissUndo: (id: string) => void;
}


const UndoContext = createContext<UndoContextValue | undefined>(undefined);

const DEFAULT_DURATION = 5000;
let undoCounter = 0;

const generateUndoId = (): string => {
  undoCounter += 1;
  return `undo-${Date.now()}-${undoCounter}`;
};


function UndoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7v6h6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6.27 2.73L3 13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}


interface UndoToastItemProps {
  action: ActiveUndo;
  onUndo: () => void;
  onDismiss: () => void;
}

const UndoToastItem: React.FC<UndoToastItemProps> = ({
  action,
  onUndo,
  onDismiss,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const duration = action.duration || DEFAULT_DURATION;
  
  
  useEffect(() => {
    const startTime = action.startTime;
    let animationFrame: number;
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      const newProgress = (remaining / duration) * 100;
      
      setProgress(newProgress);
      
      if (remaining > 0) {
        animationFrame = requestAnimationFrame(updateProgress);
      }
    };
    
    animationFrame = requestAnimationFrame(updateProgress);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [action.startTime, duration]);
  
  const handleUndo = () => {
    setIsExiting(true);
    setTimeout(() => {
      onUndo();
    }, 150);
  };
  
  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 150);
  };
  
  return (
    <>
      <div
        className={`undo-toast ${isExiting ? 'exiting' : ''}`}
        role="alert"
        aria-live="polite"
      >
        <div className="undo-toast-progress" style={{ width: `${progress}%` }} />
        
        <div className="undo-toast-content">
          {action.icon && (
            <span className="undo-toast-icon">{action.icon}</span>
          )}
          <span className="undo-toast-message">{action.message}</span>
        </div>
        
        <div className="undo-toast-actions">
          <button
            className="undo-toast-btn undo"
            onClick={handleUndo}
            type="button"
            aria-label="Undo action"
          >
            <UndoIcon />
            <span>Undo</span>
          </button>
          
          <button
            className="undo-toast-btn dismiss"
            onClick={handleDismiss}
            type="button"
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      
      <style>{`
        .undo-toast {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: var(--bg-elevated, #222230);
          border: 1px solid var(--border-default, #2a2a3d);
          border-radius: var(--radius-lg, 14px);
          box-shadow: var(--shadow-toast, 0 4px 16px rgba(0, 0, 0, 0.35));
          overflow: hidden;
          animation: undo-slide-in 200ms ease-out;
        }
        
        .undo-toast.exiting {
          animation: undo-slide-out 150ms ease-in forwards;
        }
        
        .undo-toast-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: var(--accent-primary, #5b5fc7);
          transition: width 100ms linear;
        }
        
        .undo-toast-content {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }
        
        .undo-toast-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        
        .undo-toast-message {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #e8e8ef);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .undo-toast-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        
        .undo-toast-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 6px 10px;
          background: transparent;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition-fast, 120ms ease);
        }
        
        .undo-toast-btn:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }
        
        .undo-toast-btn.undo {
          color: var(--accent-primary, #5b5fc7);
        }
        
        .undo-toast-btn.undo:hover {
          background: var(--accent-muted, rgba(91, 95, 199, 0.15));
        }
        
        .undo-toast-btn.dismiss {
          padding: 6px;
          color: var(--text-muted);
        }
        
        .undo-toast-btn.dismiss:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        
        @keyframes undo-slide-in {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        @keyframes undo-slide-out {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
          }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .undo-toast {
            animation: none;
          }
          .undo-toast.exiting {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};


interface UndoContainerProps {
  actions: ActiveUndo[];
  onUndo: (id: string) => void;
  onDismiss: (id: string) => void;
}

const UndoContainer: React.FC<UndoContainerProps> = ({
  actions,
  onUndo,
  onDismiss,
}) => {
  if (actions.length === 0) return null;
  
  return (
    <>
      <div className="undo-container" aria-label="Undo notifications">
        {actions.map((action) => (
          <UndoToastItem
            key={action.id}
            action={action}
            onUndo={() => onUndo(action.id)}
            onDismiss={() => onDismiss(action.id)}
          />
        ))}
      </div>
      
      <style>{`
        .undo-container {
          position: fixed;
          bottom: var(--space-6, 24px);
          left: 50%;
          transform: translateX(-50%);
          z-index: var(--z-toast, 500);
          display: flex;
          flex-direction: column;
          gap: var(--space-2, 8px);
          max-width: calc(100% - 32px);
          pointer-events: none;
        }
        
        .undo-container > * {
          pointer-events: auto;
        }
      `}</style>
    </>
  );
};


interface UndoProviderProps {
  children: React.ReactNode;
}

export const UndoProvider: React.FC<UndoProviderProps> = ({ children }) => {
  const [actions, setActions] = useState<ActiveUndo[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  
  
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, []);
  
  const showUndo = useCallback((action: Omit<UndoAction, 'id'>): string => {
    const id = generateUndoId();
    const duration = action.duration || DEFAULT_DURATION;
    
    const activeAction: ActiveUndo = {
      ...action,
      id,
      startTime: Date.now(),
      remaining: duration,
    };
    
    setActions((prev) => [...prev, activeAction]);
    
    
    const timer = window.setTimeout(() => {
      action.onConfirm?.();
      setActions((prev) => prev.filter((a) => a.id !== id));
      timersRef.current.delete(id);
    }, duration);
    
    timersRef.current.set(id, timer);
    
    return id;
  }, []);
  
  const handleUndo = useCallback((id: string) => {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    
    
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    
    
    action.onUndo();
    
    
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, [actions]);
  
  const confirmUndo = useCallback((id: string) => {
    const action = actions.find((a) => a.id === id);
    if (!action) return;
    
    
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    
    
    action.onConfirm?.();
    
    
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, [actions]);
  
  const dismissUndo = useCallback((id: string) => {
    
    confirmUndo(id);
  }, [confirmUndo]);
  
  const contextValue: UndoContextValue = {
    showUndo,
    confirmUndo,
    dismissUndo,
  };
  
  return (
    <UndoContext.Provider value={contextValue}>
      {children}
      <UndoContainer
        actions={actions}
        onUndo={handleUndo}
        onDismiss={dismissUndo}
      />
    </UndoContext.Provider>
  );
};


export const useUndo = (): UndoContextValue => {
  const context = useContext(UndoContext);
  if (context === undefined) {
    throw new Error('useUndo must be used within an UndoProvider');
  }
  return context;
};

export default UndoProvider;
