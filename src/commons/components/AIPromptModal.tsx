import { Sparkles, X } from "lucide-react";
import React, { useState } from "react";
import { useI18n } from "../i18n";
import { Button } from "./ui";

interface AIPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    prompt: string,
    mode: "fast" | "normal" | "complex",
  ) => Promise<void>;
  loading: boolean;
}

export const AIPromptModal: React.FC<AIPromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
}) => {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"fast" | "normal" | "complex">("normal");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      await onSubmit(prompt, mode);
      setPrompt("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-card border border-border-default rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-bg-secondary/30">
          <div className="flex items-center gap-2 text-accent-primary">
            <Sparkles className="w-5 h-5" />
            <h3 className="font-semibold text-lg text-text-primary">
              {t("stepEditor.aiModal.title")}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label={t("stepEditor.aiModal.close")}
            className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-accent-primary/30 border-t-accent-primary animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-accent-primary animate-pulse" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-text-primary">
                  {t("stepEditor.aiModal.loading.title")}
                </p>
                <p className="text-xs text-text-muted">
                  {t("stepEditor.aiModal.loading.body")}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-text-secondary">
                  {t("stepEditor.aiModal.promptLabel")}
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t("stepEditor.aiModal.promptPlaceholder")}
                  className="w-full h-32 px-4 py-3 bg-bg-main border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary transition-all resize-none text-sm placeholder:text-text-muted/50"
                  autoFocus
                />
              </div>

              <div className="flex justify-between items-center bg-bg-secondary/20 p-2 rounded-lg border border-border-default/50">
                <span className="text-xs font-medium text-text-secondary ml-1">
                  {t("stepEditor.aiModal.readingModeLabel")}
                </span>
                <div className="flex bg-bg-main border border-border-default rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("fast")}
                    title={t("stepEditor.aiModal.readingMode.fast.title")}
                    className={`p-1.5 rounded-md transition-all ${
                      mode === "fast"
                        ? "bg-accent-primary/10 text-accent-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("normal")}
                    title={t("stepEditor.aiModal.readingMode.normal.title")}
                    className={`p-1.5 rounded-md transition-all ${
                      mode === "normal"
                        ? "bg-accent-primary/10 text-accent-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("complex")}
                    title={t("stepEditor.aiModal.readingMode.complex.title")}
                    className={`p-1.5 rounded-md transition-all ${
                      mode === "complex"
                        ? "bg-accent-primary/10 text-accent-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                      <rect width="10" height="10" x="7" y="7" rx="2" />
                      <path d="m16 16-1.9-1.9" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="bg-bg-secondary/30 rounded-lg p-2 border border-border-default/30 -mt-2">
                <p className="text-[10px] text-text-muted leading-relaxed">
                  {mode === "fast" && (
                    <span className="animate-fade-in">
                      {t("stepEditor.aiModal.readingMode.fast.description")}
                    </span>
                  )}
                  {mode === "normal" && (
                    <span className="animate-fade-in">
                      {t("stepEditor.aiModal.readingMode.normal.description")}
                    </span>
                  )}
                  {mode === "complex" && (
                    <span className="animate-fade-in">
                      {t("stepEditor.aiModal.readingMode.complex.description")}
                    </span>
                  )}
                </p>
              </div>

              <div className="bg-accent-primary/5 p-3 rounded-lg border border-accent-primary/10">
                <p className="text-xs text-text-muted flex gap-2">
                  <Sparkles className="w-4 h-4 text-accent-primary shrink-0" />
                  {mode === "fast"
                    ? t("stepEditor.aiModal.tip.fast")
                    : t("stepEditor.aiModal.tip.normalComplex")}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={onClose}
                  type="button"
                  fullWidth
                >
                  {t("stepEditor.aiModal.cancel")}
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={!prompt.trim()}
                  fullWidth
                  className="shadow-lg shadow-accent-primary/20"
                >
                  {t("stepEditor.aiModal.generate")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
