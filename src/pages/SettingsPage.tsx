import React from "react";
import { SettingsView } from "../modules/settings";
import { useSettings } from "../modules/settings/hooks/useSettings";

const SettingsPage: React.FC = () => {
  const logic = useSettings();
  return <SettingsView {...logic} />;
};

export default SettingsPage;
