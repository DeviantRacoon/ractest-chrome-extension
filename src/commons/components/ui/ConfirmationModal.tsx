import { AlertTriangle } from "lucide-react";
import React from "react";
import Button from "./Button";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  variant = "danger",
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-bg-card border border-border-default shadow-2xl rounded-2xl w-full max-w-sm p-6 overflow-hidden animate-scale-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div
            className={`p-3 rounded-full ${
              variant === "danger"
                ? "bg-status-error/10 text-status-error"
                : "bg-status-warning/10 text-status-warning"
            }`}
          >
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-text-primary mb-1">
              {title}
            </h3>
            <p className="text-sm text-text-muted">{message}</p>
          </div>

          <div className="flex gap-3 w-full mt-2">
            <Button
              variant="ghost"
              fullWidth
              onClick={onCancel}
              disabled={loading}
              className="border border-border-default/50"
            >
              {cancelText}
            </Button>
            <Button
              variant={variant === "danger" ? "danger" : "primary"}
              fullWidth
              onClick={onConfirm}
              loading={loading}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
