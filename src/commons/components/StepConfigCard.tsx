import {
  CheckSquare,
  ChevronDown,
  Eye,
  GripVertical,
  Keyboard,
  List,
  MousePointerClick,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { useI18n } from "../i18n";
import type { ActionType, TestStep } from "../types";
import { FakeDataSelector } from "./FakeDataSelector";
import { Input, Select } from "./ui";

interface StepConfigCardProps {
  step: TestStep;
  index: number;
  onUpdate: (stepId: string, updates: Partial<TestStep>) => void;
  onDelete: (stepId: string) => void;
  onHighlight: (selector: string) => void;
  isDragging?: boolean;
  dragHandleListeners?: DraggableSyntheticListeners;
}

const ACTION_ICONS: Record<ActionType, React.ReactNode> = {
  CLICK: <MousePointerClick className="w-4 h-4" />,
  TYPE: <Keyboard className="w-4 h-4" />,
  SELECT: <List className="w-4 h-4" />,
  CHECK: <CheckSquare className="w-4 h-4" />,
  UNCHECK: <Square className="w-4 h-4" />,
  DIVIDER: <div className="w-4 h-4 bg-border-default rounded-sm" />,
  ASSERT: <ShieldCheck className="w-4 h-4" />,
  FINISH: <CheckSquare className="w-4 h-4 text-green-500" />,
};

const ACTION_Colors: Record<ActionType, string> = {
  CLICK: "text-blue-400 bg-blue-400/10",
  TYPE: "text-purple-400 bg-purple-400/10",
  SELECT: "text-amber-400 bg-amber-400/10",
  CHECK: "text-emerald-400 bg-emerald-400/10",
  UNCHECK: "text-rose-400 bg-rose-400/10",
  DIVIDER: "text-text-muted bg-bg-secondary",
  ASSERT: "text-orange-400 bg-orange-400/10",
  FINISH: "text-green-500 bg-green-500/10",
};

const ACTION_OPTIONS = [
  {
    value: "CLICK",
    needsValue: false,
    icon: ACTION_ICONS.CLICK,
  },
  { value: "TYPE", needsValue: true, icon: ACTION_ICONS.TYPE },
  {
    value: "SELECT",
    needsValue: true,
    icon: ACTION_ICONS.SELECT,
  },
  {
    value: "CHECK",
    needsValue: false,
    icon: ACTION_ICONS.CHECK,
  },
  {
    value: "UNCHECK",
    needsValue: false,
    icon: ACTION_ICONS.UNCHECK,
  },
];

export const StepConfigCard: React.FC<StepConfigCardProps> = ({
  step,
  index,
  onUpdate,
  onDelete,
  onHighlight,
  isDragging = false,
  dragHandleListeners,
}) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(false);

  // Cast step.action to string to match Select value type, then cast back when updating
  const selectedAction = ACTION_OPTIONS.find(
    (opt) => opt.value === step.action,
  );
  const needsValue = selectedAction?.needsValue ?? false;
  const actionColorClass =
    ACTION_Colors[step.action] || "text-text-primary bg-bg-secondary";
  const getActionLabel = (action: string) => {
    switch (action) {
      case "CLICK":
        return t("stepEditor.action.CLICK");
      case "TYPE":
        return t("stepEditor.action.TYPE");
      case "SELECT":
        return t("stepEditor.action.SELECT");
      case "CHECK":
        return t("stepEditor.action.CHECK");
      case "UNCHECK":
        return t("stepEditor.action.UNCHECK");
      default:
        return action;
    }
  };
  const actionOptionsWithLabels = ACTION_OPTIONS.map((option) => ({
    ...option,
    label: getActionLabel(option.value),
  }));

  const handleActionChange = (value: string) => {
    const newAction = value as ActionType;
    onUpdate(step.id, { action: newAction });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(step.id, { value: e.target.value });
  };

  const handleDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const delay = parseInt(e.target.value) || 0;
    onUpdate(step.id, { delay });
  };

  return (
    <div
      className={`group relative transition-all duration-200 rounded-xl border border-border-default/40 bg-bg-card/40 hover:bg-bg-card hover:border-accent-primary/30 ${
        isDragging
          ? "opacity-50 scale-95 shadow-lg z-50 ring-2 ring-accent-primary"
          : "opacity-100"
      } ${isExpanded ? "bg-bg-card shadow-md border-border-default" : ""}`}
    >
      {/* Main Row / Header */}
      <div className="flex items-center gap-3 p-3 select-none">
        {/* Drag Handle */}
        <div
          className="cursor-grab active:cursor-grabbing text-text-muted/50 hover:text-text-primary transition-colors p-1 -ml-1"
          {...dragHandleListeners}
        >
          <GripVertical className="w-5 h-5" />
        </div>

        {/* Index Badge */}
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-bg-secondary text-text-secondary text-xs font-mono font-medium border border-border-default shadow-sm">
          {index + 1}
        </div>

        {/* Content Summary */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-md ${actionColorClass}`}
            >
              {ACTION_ICONS[step.action]}
            </span>
            <span className="font-semibold text-sm text-text-primary">
              {selectedAction ? getActionLabel(selectedAction.value) : ""}
            </span>
            {step.value && needsValue && (
              <span className="text-xs text-text-secondary bg-bg-secondary px-1.5 py-0.5 rounded border border-border-default truncate max-w-[100px]">
                {step.value}
              </span>
            )}
            {step.delay > 0 && (
              <span className="text-[10px] text-text-muted/70 ml-auto mr-2 font-mono">
                {step.delay}ms
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted font-mono truncate max-w-[200px] sm:max-w-xs pl-8 opacity-70 group-hover:opacity-100 transition-opacity">
            {step.selector}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onHighlight(step.selector);
            }}
            className="p-1.5 text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 rounded-md transition-colors"
            title={t("stepEditor.stepCard.highlight")}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(step.id);
            }}
            className="p-1.5 text-text-muted hover:text-status-error hover:bg-status-error/10 rounded-md transition-colors"
            title={t("stepEditor.stepCard.delete")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Expand Toggle */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-1 text-text-muted hover:text-text-primary transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded Details Form */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 space-y-4 animate-slide-down">
          <div className="h-px w-full bg-border-default/30 mb-4" />

          <div className="grid grid-cols-1 gap-4">
            <Select
              label={t("stepEditor.stepCard.actionType")}
              value={step.action}
              onChange={handleActionChange}
              options={actionOptionsWithLabels}
              fullWidth
            />

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                {t("stepEditor.stepCard.selector")}
              </label>
              <div className="px-3 py-2 bg-bg-main/50 border border-border-default/50 rounded-lg font-mono text-xs text-accent-primary break-all shadow-inner">
                {step.selector}
              </div>
            </div>

            {needsValue && (
              <div className="space-y-2">
                <Input
                  label={
                    step.action === "TYPE"
                      ? t("stepEditor.stepCard.valueText")
                      : t("stepEditor.stepCard.valueOption")
                  }
                  type="text"
                  value={step.value || ""}
                  onChange={handleValueChange}
                  placeholder={
                    step.action === "TYPE"
                      ? t("stepEditor.stepCard.valuePlaceholderText")
                      : t("stepEditor.stepCard.valuePlaceholderOption")
                  }
                  fullWidth
                  disabled={step.useFakeData}
                  className={
                    step.useFakeData
                      ? "bg-bg-secondary opacity-50 cursor-not-allowed"
                      : "bg-bg-main/50"
                  }
                />

                {step.action === "TYPE" && (
                  <div className="space-y-3 pt-2">
                    {/* Unique Text Toggle */}
                    <div
                      className="flex items-center gap-2 cursor-pointer group/toggle"
                      onClick={() =>
                        onUpdate(step.id, { uniqueText: !step.uniqueText })
                      }
                    >
                      <div
                        className={`w-9 h-5 rounded-full relative transition-colors duration-200 ease-in-out flex-shrink-0 ${
                          step.uniqueText
                            ? "bg-accent-primary"
                            : "bg-bg-secondary border border-border-default hover:border-text-muted"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                            step.uniqueText
                              ? "translate-x-4.5 left-0.5"
                              : "left-0.5"
                          }`}
                        />
                      </div>
                      <span className="text-xs text-text-secondary group-hover/toggle:text-text-primary transition-colors select-none">
                        {t("stepEditor.stepCard.uniqueText")}
                      </span>
                    </div>

                    {/* Fake Data Toggle */}
                    <div
                      className="flex items-center gap-2 cursor-pointer group/toggle"
                      onClick={() =>
                        onUpdate(step.id, { useFakeData: !step.useFakeData })
                      }
                    >
                      <div
                        className={`w-9 h-5 rounded-full relative transition-colors duration-200 ease-in-out flex-shrink-0 ${
                          step.useFakeData
                            ? "bg-accent-primary"
                            : "bg-bg-secondary border border-border-default hover:border-text-muted"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                            step.useFakeData
                              ? "translate-x-4.5 left-0.5"
                              : "left-0.5"
                          }`}
                        />
                      </div>
                      <span className="text-xs text-text-secondary group-hover/toggle:text-text-primary transition-colors select-none">
                        {t("stepEditor.stepCard.useFakeData")}
                      </span>
                    </div>

                    {/* Fake Data Selector */}
                    {step.useFakeData && (
                      <div className="pl-2 border-l-2 border-accent-primary/20">
                        <label className="block text-xs font-medium text-text-secondary mb-1.5">
                          {t("stepEditor.stepCard.fakeDataType")}
                        </label>
                        <FakeDataSelector
                          value={step.fakeDataType}
                          onChange={(value) =>
                            onUpdate(step.id, { fakeDataType: value })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Input
              label={t("stepEditor.stepCard.delay")}
              type="number"
              value={step.delay}
              onChange={handleDelayChange}
              min={0}
              step={100}
              fullWidth
              className="bg-bg-main/50"
            />
          </div>
        </div>
      )}
    </div>
  );
};
