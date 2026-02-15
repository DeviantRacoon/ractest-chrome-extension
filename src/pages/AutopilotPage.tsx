import React from "react";
import { useAutopilot } from "../modules/autopilot/hooks/useAutopilot";
import { AutopilotView } from "../modules/autopilot/index";

const AutopilotPage: React.FC = () => {
  const logic = useAutopilot();
  return <AutopilotView {...logic} />;
};

export default AutopilotPage;
