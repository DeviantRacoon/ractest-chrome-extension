import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../commons/components/ui";
import { useI18n } from "../../../commons/i18n";
import storageService from "../../../commons/lib/storage";
import type { TestProfile } from "../../../commons/types";

export const useSequenceForm = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { success, error } = useToast();

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [sequence, setSequence] = useState<
    Array<{ id: string; recipeId: string }>
  >([]);
  const [availableRecipes, setAvailableRecipes] = useState<TestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");

  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    try {
      const profiles = await storageService.getProfiles();
      setAvailableRecipes(profiles);
    } catch (err) {
      console.error(err);
      error(t("sequence.new.toast.error") || "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipeClick = () => {
    if (!selectedRecipeId) return;
    // Auto-populate URL from first recipe added if empty
    if (!url.trim() && sequence.length === 0) {
      const recipe = availableRecipes.find((r) => r.id === selectedRecipeId);
      if (recipe?.url) {
        setUrl(recipe.url);
      }
    }
    setSequence((prev) => [
      ...prev,
      { id: crypto.randomUUID(), recipeId: selectedRecipeId },
    ]);
    setSelectedRecipeId("");
  };

  const handleRemoveRecipe = (instanceId: string) => {
    setSequence((prev) => prev.filter((item) => item.id !== instanceId));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSequence((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);

        const newItems = [...items];
        const [removed] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, removed);
        return newItems;
      });
    }
  };

  const handleSave = async () => {
    if (!name.trim() || sequence.length === 0) return;
    try {
      const newSteps = sequence.map((item, index) => ({
        id: crypto.randomUUID(),
        action: "RECIPE" as const,
        selector: "body",
        value: item.recipeId,
        delay: 0,
        order: index,
      }));

      await storageService.saveProfile({
        name: name.trim(),
        url: url.trim() || availableRecipes.find((r) => r.id === sequence[0]?.recipeId)?.url || "",
        steps: newSteps,
      });

      success(t("sequence.new.toast.success") || "Success");
      navigate("/");
    } catch (err) {
      console.error("Error saving sequence:", err);
      error(t("sequence.new.toast.error") || "Error");
    }
  };

  const handleCancel = () => {
    navigate("/");
  };

  const sortedRecipes = [...availableRecipes].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return {
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
  };
};
