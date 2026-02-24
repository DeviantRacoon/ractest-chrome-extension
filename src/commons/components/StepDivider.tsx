import { GripVertical, Trash2 } from "lucide-react";
import React from "react";
import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import { useI18n } from "../i18n";
import type { TestStep } from "../types";

interface StepDividerProps {
  step: TestStep;
  index: number;
  onUpdate: (stepId: string, updates: Partial<TestStep>) => void;
  onDelete: (stepId: string) => void;
  isDragging?: boolean;
  dragHandleListeners?: DraggableSyntheticListeners;
}

export const StepDivider: React.FC<StepDividerProps> = ({
  step,
  onUpdate,
  onDelete,
  isDragging = false,
  dragHandleListeners,
}) => {
  const { t } = useI18n();
  return (
    <div
      className={`group relative flex items-center gap-3 py-3 px-2 rounded-lg transition-all duration-200 ${
        isDragging
          ? "opacity-50 scale-95 z-50 bg-bg-main"
          : "hover:bg-bg-secondary/30"
      }`}
    >
      {/* Drag Handle - Only visible on hover */}
      <div
        className={`cursor-grab active:cursor-grabbing text-text-muted/30 hover:text-text-primary transition-all duration-200 p-1 -ml-1 flex-shrink-0 ${
          isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
        {...dragHandleListeners}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Divider Content */}
      <div className="flex-1 flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-default to-border-default opacity-50 group-hover:opacity-100 transition-opacity" />
        <input
          type="text"
          value={step.value || ""} // We use 'value' to store the divider text
          onChange={(e) => onUpdate(step.id, { value: e.target.value })}
          placeholder={t("stepEditor.divider.placeholder")}
          className="bg-transparent text-xs font-semibold text-text-secondary placeholder:text-text-muted/20 focus:outline-none focus:text-accent-primary text-center min-w-[120px] uppercase tracking-wider select-none"
        />
        <div className="h-px flex-1 bg-gradient-to-r from-border-default via-border-default to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Actions - Only visible on hover */}
      <button
        onClick={() => onDelete(step.id)}
        className="p-1.5 text-text-muted/30 hover:text-status-error hover:bg-status-error/10 rounded-md transition-all duration-200 opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100"
        title={t("stepEditor.divider.delete")}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
