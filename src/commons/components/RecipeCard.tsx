import { Edit2, FileCode, Play, Trash2 } from "lucide-react";
import React from "react";
import { useI18n } from "../i18n";
import type { TestProfile } from "../types";
import { Button, Card } from "./ui";

interface RecipeCardProps {
  recipe: TestProfile;
  onRun: (recipe: TestProfile) => void;
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(
      language === "es" ? "es-ES" : "en-US",
      {
      day: "numeric",
      month: "short",
      year: "numeric",
      },
    );
  };

  return (
    <Card
      glass
      hoverable
      className="group relative overflow-hidden border-border-default/50 hover:border-accent-primary/50 transition-all duration-300"
      padding="none"
    >
      {/* Background Gradient Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-accent-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

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
              <span className="truncate text-xs opacity-80">{recipe.url}</span>
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
          {/* Edit/Delete Actions - Visible on Hover (or always visible on mobile if needed, but lets keep hover for clean look) */}
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

          {/* Run Action */}
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRun(recipe);
            }}
            className="rounded-full w-9 h-9 p-0 shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/40 group-hover:scale-110 transition-all duration-300 flex-shrink-0"
            title={t("recipes.runTitle")}
          >
            <Play className="w-4 h-4 ml-0.5 fill-current" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
