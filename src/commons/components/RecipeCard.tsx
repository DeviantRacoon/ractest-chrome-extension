import { ChevronDown, Edit2, FileCode, Play, Trash2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type { TestProfile } from "../types";
import { Button, Card } from "./ui";

interface RecipeCardProps {
  recipe: TestProfile;
  onRun: (recipe: TestProfile, startFromIndex: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({
  recipe,
  onRun,
  onEdit,
  onDelete,
}) => {
  const { language, t } = useI18n();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Position of the floating dropdown (fixed, so it escapes any overflow constraint)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  // Close on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        chevronRef.current &&
        !chevronRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(
      language === "es" ? "es-ES" : "en-US",
      { day: "numeric", month: "short", year: "numeric" },
    );

  const handleToggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dropdownOpen && chevronRef.current) {
      const rect = chevronRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setDropdownOpen((v) => !v);
  };

  const handleRunFrom = (index: number) => {
    setDropdownOpen(false);
    onRun(recipe, index);
  };

  const hasMultipleSteps =
    recipe.steps.filter((s) => s.action !== "DIVIDER").length > 1;

  return (
    <>
      <Card
        glass
        hoverable
        className="group relative border-border-default/50 hover:border-accent-primary/50 transition-all duration-300"
        padding="none"
      >
        {/* Background Gradient Effect */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-transparent via-transparent to-accent-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        <div className="p-4 flex gap-4 relative z-10 items-center">
          {/* Main Info */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-text-primary truncate group-hover:text-accent-primary transition-colors">
                {recipe.name}
              </h3>
              <span className="text-xs text-text-muted hidden sm:inline-block">
                •
              </span>
              <span className="text-xs text-text-muted hidden sm:inline-block">
                {formatDate(recipe.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <div className="flex items-center gap-1.5 min-w-0">
                <FileCode className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
                <span className="truncate text-xs opacity-80">
                  {recipe.url}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-1 h-1 rounded-full bg-border-default" />
                <span className="text-xs text-text-muted">
                  {t("recipes.stepCount", { count: recipe.steps.length })}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Edit/Delete — visible on hover */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mr-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(recipe.id)}
                className="w-8 h-8 p-0 text-text-muted hover:text-text-primary"
                title={t("recipes.editTitle")}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(recipe.id)}
                className="w-8 h-8 p-0 text-text-muted hover:text-status-error"
                title={t("recipes.deleteTitle")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Split Play Button — no overflow-hidden, individual radii */}
            <div className="flex items-center flex-shrink-0 shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/40 group-hover:scale-110 transition-all duration-300">
              {/* Play — rounded-full left side (or full if no chevron) */}
              <button
                type="button"
                title={t("recipes.runTitle")}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRunFrom(0);
                }}
                className={`flex items-center justify-center w-9 h-9 bg-accent-primary hover:bg-accent-hover text-white transition-colors ${
                  hasMultipleSteps ? "rounded-l-lg" : "rounded-lg"
                }`}
              >
                <Play className="w-4 h-4 ml-0.5 fill-current" />
              </button>

              {/* Chevron — rounded-full right side */}
              {hasMultipleSteps && (
                <button
                  ref={chevronRef}
                  type="button"
                  title={t("execution.startFromDropdown")}
                  onClick={handleToggleDropdown}
                  className="flex items-center justify-center w-5 h-9 rounded-r-lg bg-accent-primary/80 hover:bg-accent-hover border-l border-white/20 text-white transition-colors"
                >
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Dropdown — rendered in a portal via fixed positioning to escape overflow */}
      {dropdownOpen && (
        <div
          ref={dropdownRef}
          style={{ top: dropdownPos.top, right: dropdownPos.right }}
          className="fixed w-56 bg-bg-card border border-border-default rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-[9999] animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted border-b border-border-default/50 bg-bg-main/40">
            {t("execution.startFromDropdown")}
          </p>
          <ul className="max-h-52 overflow-y-auto py-1">
            {recipe.steps.map((step, index) => {
              const isDivider = step.action === "DIVIDER";
              return isDivider ? (
                <li
                  key={step.id}
                  className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted/60"
                >
                  {step.value || "—"}
                </li>
              ) : (
                <li key={step.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover transition-colors"
                    onClick={() => handleRunFrom(index)}
                  >
                    <span className="w-5 h-5 flex items-center justify-center rounded-full bg-accent-primary/15 text-accent-primary text-[10px] font-bold flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-semibold text-text-primary truncate">
                        {step.action}
                      </span>
                      <span className="block text-[10px] text-text-muted truncate">
                        {step.selector}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
};
