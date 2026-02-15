import React from "react";
import { InspectorView } from "../modules/inspector";
import { useTestInspector } from "../modules/inspector/hooks/useTestInspector";

const TestInspectorPage: React.FC = () => {
  const logic = useTestInspector();
  return <InspectorView {...logic} />;
};

export default TestInspectorPage;
