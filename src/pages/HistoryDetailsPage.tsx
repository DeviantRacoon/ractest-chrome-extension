import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../commons/i18n";
import storageService from "../commons/lib/storage";
import type { RecipeExecutionResult } from "../commons/types";
import { HistoryDetailsView } from "../modules/history/components/HistoryDetailsView";

const HistoryDetailsPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [result, setResult] = useState<RecipeExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDetails = async () => {
      if (!id) {
        navigate("/history");
        return;
      }

      try {
        const history = await storageService.getHistory();
        const found = history.find((entry) => entry.id === id) || null;
        setResult(found);
      } catch (error) {
        console.error("Error loading history details:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-primary border-t-transparent" />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm text-text-secondary mb-4">
            {t("history.details.unnamed")}
          </p>
          <button
            onClick={() => navigate("/history")}
            className="px-4 py-2 bg-bg-secondary hover:bg-bg-card border border-border-default rounded-lg text-sm transition-colors text-text-primary"
          >
            {t("history.title")}
          </button>
        </div>
      </div>
    );
  }

  return <HistoryDetailsView result={result} />;
};

export default HistoryDetailsPage;
