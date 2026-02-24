/**
 * ExecutionPanel
 * Shows real-time execution progress for a recipe.
 * Displays step-by-step status with indicators and a stop button.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  StopCircle,
  Terminal,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { executionService } from "../lib/executionService";
import type { StepExecutionResult, TestProfile } from "../types";
import { Button, useToast } from "./ui";

interface ExecutionPanelProps {
  recipe: TestProfile;
  startFromIndex?: number;
  onClose: () => void;
}

type ExecutionStatus = "running" | "completed" | "failed" | "cancelled";

export const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  recipe,
  startFromIndex = 0,
  onClose,
}) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<ExecutionStatus>("running");
  const [stepResults, setStepResults] = useState<StepExecutionResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const failureToastShownRef = useRef(false);
  const { error: toastError } = useToast();

  // Start execution on mount
  useEffect(() => {
    startTimeRef.current = Date.now();

    // Timer
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 100);

    // Set up callbacks
    executionService.onStepResult((result) => {
      setStepResults((prev) => {
        const newResults = [...prev, result];
        // Auto-scroll to bottom
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 50);
        return newResults;
      });
    });

    executionService.onComplete(() => {
      setStatus("completed");
      if (timerRef.current) clearInterval(timerRef.current);
    });

    executionService.onFailed((err, _results) => {
      setStatus("failed");
      setError(err);
      if (!failureToastShownRef.current) {
        toastError(
          t("execution.failedToast", {
            error: err || t("execution.unknownError"),
          }),
        );
        failureToastShownRef.current = true;
      }
      if (timerRef.current) clearInterval(timerRef.current);
    });

    // Execute
    executionService.executeRecipe(recipe, startFromIndex).catch((err) => {
      setStatus("failed");
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (!failureToastShownRef.current) {
        toastError(
          t("execution.failedToast", {
            error: message || t("execution.unknownError"),
          }),
        );
        failureToastShownRef.current = true;
      }
      if (timerRef.current) clearInterval(timerRef.current);
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recipe]);

  const handleStop = async () => {
    await executionService.stopExecution();
    setStatus("cancelled");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStepStatus = (stepId: string) => {
    return stepResults.find((r) => r.stepId === stepId);
  };

  const completedCount = stepResults.filter(
    (r) => r.status === "success",
  ).length;
  // Only count steps that are actually executed (excluding skipped)
  const activeStepsCount = recipe.steps.length - startFromIndex;
  const progressPercent =
    activeStepsCount > 0 ? (stepResults.length / activeStepsCount) * 100 : 100;

  // Current active step index in full list
  const currentStepIndex = startFromIndex + stepResults.length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg-main/95 backdrop-blur-md animate-fade-in">
      {/* Header */}
      <div className="relative flex-none p-4 overflow-hidden border-b border-border-default/50 bg-bg-main/50">
        {/* Progress Background */}
        <div
          className={`absolute bottom-0 left-0 h-0.5 transition-all duration-300 ${
            status === "failed"
              ? "bg-status-error"
              : status === "completed"
                ? "bg-status-success"
                : "bg-accent-primary"
          }`}
          style={{ width: `${progressPercent}%` }}
        />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                status === "running"
                  ? "bg-accent-primary/10 text-accent-primary animate-pulse"
                  : status === "completed"
                    ? "bg-status-success/10 text-status-success"
                    : status === "failed"
                      ? "bg-status-error/10 text-status-error"
                      : "bg-status-warning/10 text-status-warning"
              }`}
            >
              {status === "running" && <Terminal className="w-5 h-5" />}
              {status === "completed" && <CheckCircle2 className="w-5 h-5" />}
              {status === "failed" && <AlertTriangle className="w-5 h-5" />}
              {status === "cancelled" && <StopCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight text-text-primary">
                {status === "running"
                  ? t("execution.status.running")
                  : status === "completed"
                    ? t("execution.status.completed")
                    : status === "failed"
                      ? t("execution.status.failed")
                      : t("execution.status.cancelled")}
              </h2>
              <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                <span className="font-medium text-text-secondary">
                  {recipe.name}
                </span>
                <span>•</span>
                <div className="font-mono text-xs font-medium text-text-primary">
                  {t("execution.stepProgress", {
                    done: completedCount,
                    total: activeStepsCount,
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 border rounded-full py-1.5 bg-bg-card/50 border-border-default/50">
            <Clock className="w-3.5 h-3.5 text-text-muted" />
            <span className="font-mono text-xs font-medium text-text-primary">
              {formatTime(elapsed)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content - Timeline */}
      <div
        ref={scrollRef}
        className="flex-1 p-4 space-y-6 overflow-y-auto scroll-smooth"
      >
        <div className="relative pl-4 space-y-6 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border-default/30">
          {recipe.steps.map((step, index) => {
            const result = getStepStatus(step.id);
            const isSkipped = index < startFromIndex;
            const isActive = index === currentStepIndex && status === "running";
            const isPending = !isSkipped && index > currentStepIndex;

            return (
              <div
                key={step.id}
                className={`relative pl-8 transition-all duration-300 ${
                  isSkipped
                    ? "opacity-25"
                    : isActive
                      ? "opacity-100 scale-100"
                      : isPending
                        ? "opacity-40"
                        : "opacity-80"
                }`}
              >
                {/* Timeline Node */}
                <div
                  className={`absolute left-0 top-1 w-10 h-10 -ml-[19px] rounded-full flex items-center justify-center border-4 transition-colors duration-300 z-10 bg-bg-main ${
                    isSkipped
                      ? "border-border-default text-text-muted"
                      : isActive
                        ? "border-accent-primary text-accent-primary shadow-[0_0_15px_rgba(var(--accent-primary),0.3)]"
                        : result?.status === "success"
                          ? "border-status-success text-status-success"
                          : result?.status === "error"
                            ? "border-status-error text-status-error"
                            : "border-bg-secondary text-text-muted"
                  }`}
                >
                  {isSkipped ? (
                    <span className="font-mono text-xs font-bold">
                      {index + 1}
                    </span>
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : result?.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : result?.status === "error" ? (
                    <XCircle className="w-5 h-5" />
                  ) : (
                    <span className="font-mono text-sm font-bold">
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Card Content */}
                <div
                  className={`p-4 rounded-xl border transition-all duration-300 ${
                    isSkipped
                      ? "bg-bg-card/20 border-border-default/30"
                      : isActive
                        ? "bg-bg-card border-accent-primary/30 shadow-lg"
                        : result?.status === "error"
                          ? "bg-status-error/5 border-status-error/20"
                          : "bg-bg-card/30 border-border-default/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-1">
                    <h4
                      className={`text-sm font-bold ${isActive ? "text-accent-primary" : "text-text-primary"}`}
                    >
                      {step.action}
                    </h4>
                    {isSkipped && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-bg-main text-text-muted border border-border-default/40">
                        {t("execution.skipped")}
                      </span>
                    )}
                    {!isSkipped && result && (
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                          result.status === "success"
                            ? "bg-status-success/10 text-status-success"
                            : "bg-status-error/10 text-status-error"
                        }`}
                      >
                        {result.duration}ms
                      </span>
                    )}
                  </div>

                  <div className="p-2 font-mono text-xs break-all border rounded text-text-muted bg-bg-main/50 border-border-default/30">
                    {step.selector}
                  </div>

                  {step.value && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-text-secondary">
                      <span className="text-text-muted">
                        {t("execution.value")}
                      </span>
                      <span className="font-medium rounded bg-bg-secondary px-1.5 py-0.5 text-text-primary">
                        {step.value}
                      </span>
                    </div>
                  )}

                  {/* Error Details */}
                  {result?.error && (
                    <div className="p-2 mt-3 text-xs break-words border rounded bg-status-error/10 border-status-error/20 text-status-error">
                      {result.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* General Error (if not tied to a step) */}
        {error && !stepResults.find((r) => r.error === error) && (
          <div className="flex items-start gap-3 p-4 mx-4 mt-4 border bg-status-error/10 border-status-error/30 rounded-xl">
            <AlertTriangle className="flex-shrink-0 w-5 h-5 text-status-error" />
            <div>
              <h4 className="text-sm font-bold text-status-error">
                {t("execution.errorTitle")}
              </h4>
              <p className="mt-1 text-xs text-status-error/80">{error}</p>
            </div>
          </div>
        )}

        {/* Bottom Spacer */}
        <div className="h-20" />
      </div>

      {/* Footer Controls */}
      <div className="flex-none p-4 border-t border-border-default bg-bg-main/80 backdrop-blur-md">
        <div className="w-full max-w-md mx-auto">
          {status === "running" ? (
            <Button
              variant="danger"
              fullWidth
              size="lg"
              onClick={handleStop}
              className="transition-shadow shadow-lg shadow-status-error/20 hover:shadow-status-error/40"
            >
              <StopCircle className="w-5 h-5 mr-2" />
              {t("execution.stop")}
            </Button>
          ) : (
            <Button
              variant={status === "completed" ? "primary" : "secondary"}
              fullWidth
              size="lg"
              onClick={onClose}
              className="shadow-lg"
            >
              {status === "completed"
                ? t("execution.closeDone")
                : t("execution.close")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
