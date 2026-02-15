import React from "react";
import { StepEditorView } from "../modules/step-editor";
import { useStepEditor } from "../modules/step-editor/hooks/useStepEditor";

const StepEditorPage: React.FC = () => {
  const logic = useStepEditor();
  return <StepEditorView {...logic} />;
};

export default StepEditorPage;
