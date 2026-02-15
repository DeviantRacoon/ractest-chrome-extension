import {
  Calendar,
  CheckCircle2,
  Clock,
  History,
  Trash2,
  XCircle,
} from "lucide-react";
import React from "react";
import { useI18n } from "../../commons/i18n";
import { Button, ConfirmationModal } from "../../commons/components/ui";
import { HistoryDetailsModal } from "./components/HistoryDetailsModal";
import type { useHistory } from "./hooks/useHistory";

type HistoryViewProps = ReturnType<typeof useHistory>;

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  loading,
  clearHistoryModalOpen,
  setClearHistoryModalOpen,
  handleClearHistoryRequest,
  handleConfirmClearHistory,
  formatDate,
  formatDuration,
  selectedExecution,
  handleSelectExecution,
  handleCloseDetails,
}) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur supports-[backdrop-filter]:bg-bg-main/60 border-b border-border-default px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10">
            <img
              src="/icon.webp"
              alt="RacTest Icon"
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {t("history.title")}
            </h1>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              {t("history.subtitle")}
            </p>
          </div>
        </div>
        {history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearHistoryRequest}
            className="text-text-muted hover:text-status-error hover:bg-status-error/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-primary border-t-transparent"></div>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-75">
            <div className="w-16 h-16 rounded-2xl bg-bg-card/50 flex items-center justify-center mb-4 border border-border-default/50">
              <History className="w-8 h-8 text-text-muted/50" />
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-1">
              {t("history.empty.title")}
            </h3>
            <p className="text-xs text-text-muted max-w-[200px]">
              {t("history.empty.body")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectExecution(item)}
                className="group relative bg-bg-card/50 hover:bg-bg-card border border-border-default/50 hover:border-accent-primary/30 rounded-xl p-4 transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-status-success" />
                    ) : item.status === "failed" ? (
                      <XCircle className="w-4 h-4 text-status-error" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-text-muted/50" />
                    )}
                    <h3 className="font-semibold text-sm text-text-primary">
                      {item.recipeName || t("history.unnamed")}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border-default/50">
                    {formatDuration(item.duration)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary mt-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-text-muted" />
                    <span>{formatDate(item.startTime)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-text-muted" />
                    <span>
                      {t("history.stepCount", {
                        count: item.steps ? item.steps.length : 0,
                      })}
                    </span>
                  </div>
                </div>

                {item.errorMessage && (
                  <div className="mt-3 p-2 bg-status-error/5 border border-status-error/10 rounded text-[11px] text-status-error break-words">
                    {item.errorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={clearHistoryModalOpen}
        title={t("history.clear.title")}
        message={t("history.clear.message")}
        confirmText={t("history.clear.confirm")}
        cancelText={t("history.clear.cancel")}
        onConfirm={handleConfirmClearHistory}
        onCancel={() => setClearHistoryModalOpen(false)}
        variant="danger"
      />

      <HistoryDetailsModal
        isOpen={!!selectedExecution}
        onClose={handleCloseDetails}
        result={selectedExecution}
      />
    </div>
  );
};
