import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import React, { createContext, useCallback, useContext, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  addToast: (message: string, type: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info") => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => removeToast(id), 3000); // Auto close after 3s
    },
    [removeToast],
  );

  const success = useCallback(
    (message: string) => addToast(message, "success"),
    [addToast],
  );
  const error = useCallback(
    (message: string) => addToast(message, "error"),
    [addToast],
  );
  const info = useCallback(
    (message: string) => addToast(message, "info"),
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ addToast, success, error, info }}>
      {children}
      <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 z-[100] w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md animate-slide-up
              ${
                toast.type === "success"
                  ? "bg-bg-card/90 border-status-success/30 text-text-primary"
                  : toast.type === "error"
                    ? "bg-bg-card/90 border-status-error/30 text-text-primary"
                    : "bg-bg-card/90 border-accent-primary/30 text-text-primary"
              }
            `}
          >
            {toast.type === "success" && (
              <CheckCircle className="w-5 h-5 text-status-success shrink-0" />
            )}
            {toast.type === "error" && (
              <AlertCircle className="w-5 h-5 text-status-error shrink-0" />
            )}
            {toast.type === "info" && (
              <Info className="w-5 h-5 text-accent-primary shrink-0" />
            )}
            <p className="text-sm font-medium flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
