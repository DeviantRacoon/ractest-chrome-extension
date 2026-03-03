import { closestCenter, DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Globe, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import React from "react";
import { Button, Input, Select } from "../../commons/components/ui";
import { useSequenceForm } from "./hooks/useSequenceForm";

type SequenceFormViewProps = ReturnType<typeof useSequenceForm>;

// Define SortableSequenceItem here
interface SortableSequenceItemProps {
  id: string; // unique ID for this instance in the sequence array
  recipeId: string;
  recipeName: string;
  index: number;
  onRemove: (id: string) => void;
}

const SortableSequenceItem: React.FC<SortableSequenceItemProps> = ({
  id,
  recipeName,
  index,
  onRemove,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg border bg-bg-card/50 ${
        isDragging
          ? "border-accent-primary shadow-lg ring-1 ring-accent-primary/50"
          : "border-border-default hover:border-border-hover"
      }`}
    >
      <div
        className="cursor-move text-text-muted hover:text-text-primary p-1"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-primary/10 text-accent-primary flex items-center justify-center text-xs font-mono font-bold">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-text-primary truncate block">
          {recipeName}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(id)}
        className="text-text-muted hover:text-status-error p-1 h-auto"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
};

export const SequenceFormView: React.FC<SequenceFormViewProps> = ({
  t,
  name,
  setName,
  url,
  setUrl,
  sequence,
  loading,
  sortedRecipes,
  availableRecipes,
  selectedRecipeId,
  setSelectedRecipeId,
  handleAddRecipeClick,
  handleRemoveRecipe,
  handleDragEnd,
  handleSave,
  handleCancel,
}) => {
  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur border-b border-border-default px-3 py-3 space-y-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-text-muted hover:text-text-primary px-2"
            title={t("sequence.new.cancel")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-text-primary truncate">
              {t("sequence.new.title")}
            </h2>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!name.trim() || sequence.length === 0}
            className="px-3"
            title={t("sequence.new.save")}
          >
            <Save className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 space-y-5">
          {/* Name Section */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("sequence.new.nameLabel")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("sequence.new.namePlaceholder")}
              fullWidth
            />
          </div>

          {/* URL Section */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
              {t("sequence.new.urlLabel")}
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("sequence.new.urlPlaceholder")}
              leftIcon={<Globe className="w-4 h-4" />}
              fullWidth
              helperText={t("sequence.new.urlHelper")}
            />
          </div>

          {/* Sequence Add Section */}
          <div className="bg-bg-card/20 border border-border-default rounded-xl p-3 space-y-3">
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {t("sequence.new.addFlow")}
            </label>

            <div className="flex flex-col gap-2">
              <Select
                options={sortedRecipes.map((r) => ({
                  value: r.id,
                  label: r.name,
                }))}
                value={selectedRecipeId}
                onChange={setSelectedRecipeId}
                placeholder={
                  loading ? "Loading..." : t("sequence.new.selectRecipe")
                }
                fullWidth
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddRecipeClick}
                disabled={!selectedRecipeId}
                className="w-full justify-center"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("sequence.new.add")}
              </Button>
            </div>
          </div>

          {/* Sequence Order Section */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
              {t("sequence.new.currentSequence")}
            </label>
            <p className="text-xs text-text-muted mb-3">
              {t("sequence.new.dragToReorder")}
            </p>
            <div className="space-y-2 pb-6">
              {sequence.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-text-muted border-2 border-dashed border-border-default rounded-xl p-4 bg-bg-card/30">
                  <Plus className="w-6 h-6 mb-2 opacity-50" />
                  <p className="text-xs text-center text-text-muted">
                    {t("sequence.new.emptyState")}
                  </p>
                </div>
              ) : (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sequence.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {sequence.map((item, index) => {
                      const recipe = availableRecipes.find(
                        (r) => r.id === item.recipeId,
                      );
                      return (
                        <SortableSequenceItem
                          key={item.id}
                          id={item.id}
                          recipeId={item.recipeId}
                          recipeName={recipe?.name || "Unknown Recipe"}
                          index={index}
                          onRemove={handleRemoveRecipe}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
