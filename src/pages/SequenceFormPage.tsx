import React from "react";
import { SequenceFormView } from "../modules/recipes/SequenceFormView";
import { useSequenceForm } from "../modules/recipes/hooks/useSequenceForm";

const SequenceFormPage: React.FC = () => {
  const logic = useSequenceForm();
  return <SequenceFormView {...logic} />;
};

export default SequenceFormPage;
