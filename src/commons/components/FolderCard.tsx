import {
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderOpen,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { useI18n } from "../i18n";
import type { FlowFolder, TestProfile } from "../types";
import { DEFAULT_FOLDER_ICON, FOLDER_ICON_MAP } from "./folderIcons";
import { RecipeCard } from "./RecipeCard";
import { Button } from "./ui";

interface FolderCardProps {
  folder: FlowFolder;
  recipes: TestProfile[];
  forceOpen?: boolean; // e.g. when search is active
  onEdit: (folder: FlowFolder) => void;
  onDelete: (folderId: string) => void;
  onRunRecipe: (recipe: TestProfile, startFromIndex: number) => void;
  onEditRecipe: (id: string) => void;
  onDeleteRecipe: (id: string) => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  recipes,
  forceOpen,
  onEdit,
  onDelete,
  onRunRecipe,
  onEditRecipe,
  onDeleteRecipe,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const isOpen = forceOpen || open;

  // Resolve Lucide icon component from stored key
  const FolderIcon =
    FOLDER_ICON_MAP[folder.icon] ?? FOLDER_ICON_MAP[DEFAULT_FOLDER_ICON];

  return (
    <div className="rounded-xl border border-border-default/50 bg-bg-card/30 overflow-hidden transition-all duration-200 hover:border-border-default group">
      {/* Folder Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen((prev) => !prev)}
      >
        {/* Chevron */}
        <span className="text-text-muted flex-shrink-0">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>

        {/* Lucide folder icon */}
        <span className="flex-shrink-0 text-accent-primary/80 group-hover:text-accent-primary transition-colors">
          <FolderIcon className="w-5 h-5" />
        </span>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-text-primary group-hover:text-accent-primary transition-colors truncate block">
            {folder.name}
          </span>
        </div>

        {/* Flow count */}
        <span className="text-xs text-text-muted bg-bg-main/60 px-2 py-0.5 rounded-full flex-shrink-0">
          {t("folders.flowCount", { count: recipes.length })}
        </span>

        {/* Actions — visible on hover */}
        <div
          className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(folder)}
            className="w-8 h-8 p-0 text-text-muted hover:text-text-primary hover:bg-bg-hover"
            title={t("folders.edit")}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(folder.id)}
            className="w-8 h-8 p-0 text-text-muted hover:text-status-error hover:bg-status-error/10"
            title={t("folders.delete.title")}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isOpen && (
        <div className="border-t border-border-default/30 px-3 py-3 space-y-2">
          {recipes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <FolderOpen className="w-8 h-8 text-text-muted/40 mb-2" />
              <p className="text-xs text-text-muted">{t("folders.empty")}</p>
            </div>
          ) : (
            recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onRun={onRunRecipe}
                onEdit={onEditRecipe}
                onDelete={onDeleteRecipe}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
