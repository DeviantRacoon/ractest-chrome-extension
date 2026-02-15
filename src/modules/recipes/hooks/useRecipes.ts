import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../../commons/i18n";
import { useToast } from "../../../commons/components/ui";
import storageService from "../../../commons/lib/storage";
import type { TestProfile } from "../../../commons/types";

export const useRecipes = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [recipes, setRecipes] = useState<TestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingRecipe, setExecutingRecipe] = useState<TestProfile | null>(
    null,
  );

  const { success, error } = useToast();
  const { t } = useI18n();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

  // Load recipes on mount
  useEffect(() => {
    loadRecipes();
  }, []);

  const loadRecipes = async () => {
    setLoading(true);
    try {
      // Initialize mock data if needed (only for development)
      await storageService.initializeMockData();
      const profiles = await storageService.getProfiles();
      setRecipes(profiles);
    } catch (err) {
      console.error("Error loading recipes:", err);
      error(t("recipes.toast.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    navigate("/profile/new");
  };

  const handleEdit = (recipeId: string) => {
    navigate(`/profile/edit?id=${recipeId}`);
  };

  const handleDeleteRequest = (id: string) => {
    setRecipeToDelete(id);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!recipeToDelete) return;

    try {
      await storageService.deleteProfile(recipeToDelete);
      await loadRecipes();
      success(t("recipes.toast.deleted"));
    } catch (err) {
      console.error("Error deleting recipe:", err);
      error(t("recipes.toast.deleteError"));
    } finally {
      setDeleteModalOpen(false);
      setRecipeToDelete(null);
    }
  };

  const filteredRecipes = recipes.filter(
    (recipe) =>
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.url.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return {
    searchQuery,
    setSearchQuery,
    recipes,
    loading,
    executingRecipe,
    setExecutingRecipe,
    deleteModalOpen,
    setDeleteModalOpen,
    handleCreateNew,
    handleEdit,
    handleDeleteRequest,
    handleConfirmDelete,
    filteredRecipes,
  };
};
