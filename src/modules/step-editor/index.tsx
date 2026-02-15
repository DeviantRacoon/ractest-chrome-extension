import { closestCenter, DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ExternalLink,
  List,
  MousePointer,
  Play,
  Save,
  Sparkles,
} from "lucide-react";
import React from "react";
import { useI18n } from "../../commons/i18n";
import { AIPromptModal } from "../../commons/components/AIPromptModal";
import { StepConfigCard } from "../../commons/components/StepConfigCard";
import { StepDivider } from "../../commons/components/StepDivider";
import { Button } from "../../commons/components/ui";
import type { TestStep } from "../../commons/types";
import type { useStepEditor } from "./hooks/useStepEditor";

// Sortable wrapper for StepConfigCard
interface SortableStepCardProps {
  step: TestStep;
  index: number;
  onUpdate: (stepId: string, updates: Partial<TestStep>) => void;
  onDelete: (stepId: string) => void;
  onHighlight: (selector: string) => void;
}

const SortableStepCard: React.FC<SortableStepCardProps> = (props) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {props.step.action === "DIVIDER" ? (
        <StepDivider
          {...props}
          isDragging={isDragging}
          dragHandleListeners={listeners}
        />
      ) : (
        <StepConfigCard
          {...props}
          isDragging={isDragging}
          dragHandleListeners={listeners}
        />
      )}
    </div>
  );
};

type StepEditorViewProps = ReturnType<typeof useStepEditor>;

export const StepEditorView: React.FC<StepEditorViewProps> = ({
  id,
  profile,
  steps,
  isInspectorActive,
  loading,
  saving,
  sensors,
  handleOpenUrlAndActivate,
  handleStepUpdate,
  handleStepDelete,
  handleStepHighlight,
  handleDragEnd,
  handleSave,
  handleAddDivider,
  navigate,
  aiModalOpen,
  aiLoading,
  handleOpenAIModal,
  handleCloseAIModal,
  handleAIGenerate,
  handleCaptureSingle,
  hasApiKey,
}) => {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-main">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-primary border-t-transparent"></div>
      </div>
    );
  }

  // Ensure hooks don't clear unused variables, they are used in the return JSX
  // but typescript check might be because I haven't used them in the JSX above yet?
  // They are used in the AIPromptModal below.

  if (!profile && id) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-bg-main text-center p-6">
        <div className="text-4xl mb-4">😕</div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {t("stepEditor.notFoundTitle")}
        </h3>
        <Button onClick={() => navigate("/")}>{t("stepEditor.backHome")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur supports-[backdrop-filter]:bg-bg-main/60 border-b border-border-default px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="w-8 h-8 p-0 rounded-full hover:bg-bg-card -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Button>
          <div>
            <h1 className="text-base font-bold text-text-primary leading-tight">
              {t("stepEditor.title")}
            </h1>
            <p className="text-xs text-text-muted truncate max-w-[150px]">
              {profile?.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenUrlAndActivate}
            className="text-text-muted hover:text-accent-primary"
            title={t("stepEditor.openUrl")}
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={steps.length === 0}
            className="shadow-lg shadow-accent-primary/20"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {t("stepEditor.save")}
          </Button>
        </div>
      </div>

      {/* Action Toolbar (Sticky below header) */}
      <div className="sticky top-[60px] z-10 bg-bg-main/95 backdrop-blur border-b border-border-default/50 px-4 py-3 flex gap-3 items-center justify-between">
        {/* Left Side: Empty now or maybe breadcrumbs later */}
        <div className="flex-1"></div>

        {/* Right Side: Actions based on Mode */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCaptureSingle}
            disabled={isInspectorActive}
            className={`whitespace-nowrap text-xs border border-border-default hover:border-accent-primary/50 text-text-primary px-3 shadow-sm ${
              isInspectorActive
                ? "ring-2 ring-accent-primary border-accent-primary bg-accent-primary/10 text-accent-primary"
                : ""
            }`}
          >
            <MousePointer className="w-3.5 h-3.5 mr-2" />
            {t("stepEditor.capture")}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddDivider}
            className="whitespace-nowrap text-xs border border-border-default hover:border-accent-primary/50 text-text-secondary px-4 shadow-sm"
          >
            <List className="w-3.5 h-3.5 mr-2" />
            {t("stepEditor.section")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenAIModal}
            disabled={hasApiKey === false}
            title={
              hasApiKey === false
                ? t("stepEditor.aiNeedApiKey")
                : t("stepEditor.aiGenerate")
            }
            className="whitespace-nowrap text-xs border border-border-default hover:border-accent-primary/50 text-accent-primary px-4 shadow-sm bg-accent-primary/5 hover:bg-accent-primary/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
          >
            <Sparkles className="w-3.5 h-3.5 mr-2" />
            {t("stepEditor.aiMagic")}
          </Button>
        </div>
      </div>

      {/* Step List (No more Agent Mode check) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
        {steps.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {steps.map((step, index) => (
                <SortableStepCard
                  key={step.id}
                  step={step}
                  index={index}
                  onUpdate={handleStepUpdate}
                  onDelete={handleStepDelete}
                  onHighlight={handleStepHighlight}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center opacity-75">
            <div className="w-16 h-16 rounded-2xl bg-bg-card/50 flex items-center justify-center mb-4 border border-border-default/50">
              <Play className="w-8 h-8 text-text-muted/50 ml-1" />
            </div>
            <h3 className="text-sm font-medium text-text-primary mb-1">
              {t("stepEditor.emptyTitle")}
            </h3>
            <p className="text-xs text-text-muted max-w-[250px]">
              {t("stepEditor.emptyBody")}
            </p>
          </div>
        )}
      </div>

      <AIPromptModal
        isOpen={aiModalOpen}
        onClose={handleCloseAIModal}
        onSubmit={handleAIGenerate}
        loading={aiLoading}
      />
    </div>
  );
};
