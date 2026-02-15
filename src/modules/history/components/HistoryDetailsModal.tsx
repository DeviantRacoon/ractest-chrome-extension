import {
  AlertTriangle,
  Bug,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Target,
  Terminal,
  XCircle,
} from "lucide-react";
import React, { useState } from "react";
import { useI18n } from "../../../commons/i18n";
import { Modal } from "../../../commons/components/ui";
import type { RecipeExecutionResult } from "../../../commons/types";

interface HistoryDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: RecipeExecutionResult | null;
}

export const HistoryDetailsModal: React.FC<HistoryDetailsModalProps> = ({
  isOpen,
  onClose,
  result,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"steps" | "logs">("steps");
  if (!result) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("history.details.title")}
      className="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Header Statys */}
        <div className="flex items-center gap-4 p-4 bg-bg-secondary rounded-lg border border-border-default/50">
          <div
            className={`p-3 rounded-full ${
              result.status === "completed"
                ? "bg-status-success/10 text-status-success"
                : "bg-status-error/10 text-status-error"
            }`}
          >
            {result.status === "completed" ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : (
              <XCircle className="w-8 h-8" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-text-primary">
              {result.recipeName || t("history.details.unnamed")}
            </h3>
            <div className="flex gap-4 text-xs text-text-secondary mt-1">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(result.startTime).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{((result.duration || 0) / 1000).toFixed(2)}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {result.errorMessage && (
          <div className="bg-status-error/5 border border-status-error/20 p-4 rounded-lg">
            <h4 className="text-xs font-bold text-status-error uppercase mb-1">
              {t("history.details.error")}
            </h4>
            <p className="text-sm text-text-primary/90 font-mono break-all">
              {result.errorMessage}
            </p>
            {result.failureSignal && (
              <div className="mt-3 pt-3 border-t border-status-error/20 text-xs">
                <p className="text-status-error font-semibold">
                  {t("history.details.signalDetected", {
                    subtype: result.failureSignal.subtype,
                  })}
                </p>
                <p className="text-text-secondary mt-1 font-mono break-all">
                  {result.failureSignal.message}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-border-default/50">
          <button
            onClick={() => setActiveTab("steps")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "steps"
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            <Target className="w-4 h-4" />
            {t("history.details.stepsTab", { count: result.steps?.length || 0 })}
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "logs"
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            <Terminal className="w-4 h-4" />
            {t("history.details.logsTab", {
              count: result.consoleLogs?.length || 0,
            })}
          </button>
        </div>

        {/* Content */}
        <div className="bg-bg-card border border-border-default rounded-lg overflow-hidden max-h-[400px] min-h-[200px] overflow-y-auto">
          {activeTab === "steps" ? (
            result.steps && result.steps.length > 0 ? (
              <div className="divide-y divide-border-default/30">
                {result.steps.map((step, index) => (
                  <div
                    key={index}
                    className="p-3 text-xs flex items-center justify-between hover:bg-bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-muted/50 w-6">
                        #{index + 1}
                      </span>
                      <span
                        className={`font-medium ${
                          step.status === "success"
                            ? "text-status-success"
                            : "text-status-error"
                        }`}
                      >
                        {step.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-text-secondary">
                      {/* We could try to show more info if available, but standardized result is limited */}
                      {t("history.details.id", {
                        id: step.stepId?.substring(0, 8),
                      })}
                    </div>
                    <span className="text-text-muted font-mono">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-text-muted text-xs italic">
                {t("history.details.noSteps")}
              </div>
            )
          ) : (
            // LOGS VIEW
            <div className="divide-y divide-border-default/30 font-mono text-[11px]">
              {result.consoleLogs && result.consoleLogs.length > 0 ? (
                result.consoleLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`p-2 flex gap-3 hover:bg-bg-secondary/30 ${
                      log.level === "error"
                        ? "bg-status-error/5"
                        : log.level === "warn"
                          ? "bg-status-warning/5"
                          : ""
                    }`}
                  >
                    <div className="min-w-[50px] text-text-muted opacity-70">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                    <div
                      className={`min-w-[50px] uppercase font-bold text-[9px] pt-1 ${
                        log.level === "error"
                          ? "text-status-error"
                          : log.level === "warn"
                            ? "text-status-warning"
                            : log.level === "debug"
                              ? "text-text-muted"
                              : "text-accent-primary"
                      }`}
                    >
                      {log.level === "error" ? (
                        <div className="flex items-center gap-1">
                          <Bug className="w-3 h-3" /> ERR
                        </div>
                      ) : log.level === "warn" ? (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> WRN
                        </div>
                      ) : log.level === "debug" ? (
                        <div className="flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> DBG
                        </div>
                      ) : log.level === "info" ? (
                        <div className="flex items-center gap-1">
                          <Info className="w-3 h-3" /> INF
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-full bg-current opacity-50 scale-50" />{" "}
                          LOG
                        </div>
                      )}
                    </div>
                    <div className="flex-1 break-all whitespace-pre-wrap text-text-secondary">
                      {log.message}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-text-muted text-xs italic">
                  {t("history.details.noLogs")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-border-default/30">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bg-secondary hover:bg-bg-card border border-border-default rounded-lg text-sm transition-colors text-text-primary"
          >
            {t("execution.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
