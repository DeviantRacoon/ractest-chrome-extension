import { Activity, Brain, RotateCcw, Timer } from "lucide-react";
import React from "react";
import { useI18n } from "../../../commons/i18n";
import type { RecipeExecutionResult } from "../../../commons/types";

interface AutopilotTelemetrySummaryProps {
  result: RecipeExecutionResult;
  compact?: boolean;
}

export const AutopilotTelemetrySummary: React.FC<
  AutopilotTelemetrySummaryProps
> = ({ result, compact = false }) => {
  const { t } = useI18n();
  const telemetry = result.autopilotTelemetry?.summary;
  const isAutopilotRun = result.recipeId === "agent-autopilot";

  if (!isAutopilotRun) return null;

  if (!telemetry) {
    return (
      <div className="bg-bg-card border border-border-default rounded-lg p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t("history.details.telemetry.title")}
        </h4>
        <p className="mt-2 text-xs text-text-muted">
          {t("history.details.telemetry.notAvailable")}
        </p>
      </div>
    );
  }

  const replanReasons = Object.entries(telemetry.replanReasons || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const metrics = [
    {
      key: "cycles",
      label: t("history.details.telemetry.cycles"),
      value: telemetry.cycles,
      icon: Activity,
    },
    {
      key: "avgCycle",
      label: t("history.details.telemetry.avgCycle"),
      value: `${telemetry.avgCycleMs} ms`,
      icon: Timer,
    },
    {
      key: "replans",
      label: t("history.details.telemetry.replans"),
      value: telemetry.replans,
      icon: RotateCcw,
    },
    {
      key: "llmPlanMs",
      label: t("history.details.telemetry.llmPlanMs"),
      value: `${telemetry.llmPlanMsTotal} ms`,
      icon: Brain,
    },
  ];

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-4 space-y-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t("history.details.telemetry.title")}
        </h4>
        <p className="mt-1 text-[11px] text-text-muted">
          {t("history.details.telemetry.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.key}
              className="rounded-md border border-border-default/60 bg-bg-secondary/30 p-2.5"
            >
              <div className="flex items-center gap-1.5 text-text-muted text-[10px] uppercase tracking-wide">
                <Icon className="w-3 h-3" />
                <span>{metric.label}</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-text-primary">
                {metric.value}
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border border-border-default/60 bg-bg-secondary/30 p-2">
            <div className="text-text-muted">
              {t("history.details.telemetry.observeMs")}
            </div>
            <div className="mt-1 text-text-primary font-medium">
              {telemetry.observeMsTotal} ms
            </div>
          </div>
          <div className="rounded-md border border-border-default/60 bg-bg-secondary/30 p-2">
            <div className="text-text-muted">
              {t("history.details.telemetry.actMs")}
            </div>
            <div className="mt-1 text-text-primary font-medium">
              {telemetry.actMsTotal} ms
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border-default/60 bg-bg-secondary/30 p-2">
        <div className="text-[10px] uppercase tracking-wide text-text-muted">
          {t("history.details.telemetry.replanReasons")}
        </div>
        {replanReasons.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {replanReasons.map(([reason, count]) => (
              <div
                key={reason}
                className="flex items-center justify-between text-xs text-text-secondary"
              >
                <span className="font-mono">{reason}</span>
                <span className="text-text-primary font-semibold">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-xs text-text-muted">
            {t("history.details.telemetry.noReplanReasons")}
          </div>
        )}
      </div>
    </div>
  );
};
