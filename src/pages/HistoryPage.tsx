import React from "react";
import { HistoryView } from "../modules/history";
import { useHistory } from "../modules/history/hooks/useHistory";

const HistoryPage: React.FC = () => {
  const logic = useHistory();
  return <HistoryView {...logic} />;
};

export default HistoryPage;
