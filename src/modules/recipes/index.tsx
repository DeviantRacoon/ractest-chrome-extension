import { Bot, FolderPlus, Plus, Search } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { ExecutionPanel } from "../../commons/components/ExecutionPanel";
import { FolderCard } from "../../commons/components/FolderCard";
import { FolderModal } from "../../commons/components/FolderModal";
import { RecipeCard } from "../../commons/components/RecipeCard";
import { Button, ConfirmationModal, Input } from "../../commons/components/ui";
import { useI18n } from "../../commons/i18n";
import type { useRecipes } from "./hooks/useRecipes";

type RecipesViewProps = ReturnType<typeof useRecipes>;

export const RecipesView: React.FC<RecipesViewProps> = ({
  searchQuery,
  setSearchQuery,
  loading,
  folders,
  executingRecipe,
  setExecutingRecipe,
  deleteModalOpen,
  setDeleteModalOpen,
  handleCreateNew,
  handleEdit,
  handleDeleteRequest,
  handleConfirmDelete,
  recipesByFolder,
  ungroupedRecipes,
  folderModalOpen,
  setFolderModalOpen,
  editingFolder,
  handleOpenCreateFolder,
  handleOpenEditFolder,
  handleSaveFolder,
  deleteFolderModalOpen,
  setDeleteFolderModalOpen,
  handleDeleteFolderRequest,
  handleConfirmDeleteFolder,
}) => {
  const navigate = useNavigate();
  const { t } = useI18n();

  // When searching, auto-expand all folders that have results
  const isSearching = searchQuery.trim().length > 0;
  const hasAnyResults =
    ungroupedRecipes.length > 0 ||
    folders.some((f) => recipesByFolder(f.id).length > 0);

  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur supports-[backdrop-filter]:bg-bg-main/60 border-b border-border-default px-4 py-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
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
                {t("recipes.title")}
              </h1>
              <p className="text-xs text-text-muted font-medium mt-0.5">
                {t("recipes.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/autopilot")}
              className="shadow-lg shadow-accent-secondary/20 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 w-full sm:w-auto"
            >
              <Bot className="w-4 h-4 mr-1" />
              <span>{t("recipes.autopilot")}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenCreateFolder}
              className="border border-border-default/60 hover:border-accent-primary/40 "
              title={t("folders.new")}
            >
              <FolderPlus className="w-4 h-4" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateNew}
              className="shadow-lg shadow-accent-primary/20 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              <span className="ml-1">{t("recipes.new")}</span>
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <Input
            type="text"
            placeholder={t("recipes.searchPlaceholder")}
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            fullWidth
            className="bg-bg-card/50 border-border-default/50 focus:bg-bg-card transition-all"
            leftIcon={
              <Search className="w-4 h-4 text-text-muted group-hover:text-accent-primary transition-colors" />
            }
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-primary border-t-transparent"></div>
          </div>
        ) : (
          <div className="space-y-3 pb-20">
            {/* Empty state */}
            {!hasAnyResults && (
              <div
                className="flex flex-col items-center justify-center py-12 text-center opacity-0 animate-fade-in"
                style={{ animationFillMode: "forwards" }}
              >
                <div className="w-16 h-16 rounded-2xl bg-bg-card/50 flex items-center justify-center mb-4 border border-border-default/50">
                  <Search className="w-8 h-8 text-text-muted/50" />
                </div>
                <h3 className="text-sm font-medium text-text-primary mb-1">
                  {searchQuery
                    ? t("recipes.empty.noResults")
                    : t("recipes.empty.noFlows")}
                </h3>
                <p className="text-xs text-text-muted max-w-[200px]">
                  {searchQuery
                    ? t("recipes.empty.trySearch")
                    : t("recipes.empty.createFirst")}
                </p>
                {!searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCreateNew}
                    className="mt-4 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10"
                  >
                    {t("recipes.empty.createButton")}
                  </Button>
                )}
              </div>
            )}

            {/* Folder cards */}
            {folders.map((folder) => {
              const folderRecipes = recipesByFolder(folder.id);
              if (isSearching && folderRecipes.length === 0) return null;
              return (
                <FolderCard
                  key={folder.id}
                  folder={folder}
                  recipes={folderRecipes}
                  forceOpen={isSearching}
                  onEdit={handleOpenEditFolder}
                  onDelete={handleDeleteFolderRequest}
                  onRunRecipe={setExecutingRecipe}
                  onEditRecipe={handleEdit}
                  onDeleteRecipe={handleDeleteRequest}
                />
              );
            })}

            {/* Ungrouped recipes */}
            {ungroupedRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onRun={setExecutingRecipe}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        )}
      </div>

      {/* Execution Panel Modal */}
      {executingRecipe && (
        <ExecutionPanel
          recipe={executingRecipe.recipe}
          startFromIndex={executingRecipe.startFromIndex}
          onClose={() => setExecutingRecipe(null)}
        />
      )}

      {/* Folder Create/Edit Modal */}
      <FolderModal
        isOpen={folderModalOpen}
        folder={editingFolder}
        onSave={handleSaveFolder}
        onClose={() => setFolderModalOpen(false)}
      />

      {/* Delete Flow Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title={t("recipes.delete.title")}
        message={t("recipes.delete.message")}
        confirmText={t("recipes.delete.confirm")}
        cancelText={t("recipes.delete.cancel")}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalOpen(false)}
        variant="danger"
      />

      {/* Delete Folder Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteFolderModalOpen}
        title={t("folders.delete.title")}
        message={t("folders.delete.message")}
        confirmText={t("folders.delete.confirm")}
        cancelText={t("folders.delete.cancel")}
        onConfirm={handleConfirmDeleteFolder}
        onCancel={() => setDeleteFolderModalOpen(false)}
        variant="danger"
      />
    </div>
  );
};
