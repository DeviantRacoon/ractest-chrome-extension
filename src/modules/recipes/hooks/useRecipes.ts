import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../commons/components/ui";
import { useI18n } from "../../../commons/i18n";
import storageService from "../../../commons/lib/storage";
import type { FlowFolder, TestProfile } from "../../../commons/types";

export const useRecipes = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [recipes, setRecipes] = useState<TestProfile[]>([]);
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingRecipe, setExecutingRecipeState] = useState<{
    recipe: TestProfile;
    startFromIndex: number;
  } | null>(null);

  const setExecutingRecipe = (
    recipe: TestProfile | null,
    startFromIndex = 0,
  ) => {
    setExecutingRecipeState(recipe ? { recipe, startFromIndex } : null);
  };

  const { success, error } = useToast();
  const { t } = useI18n();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

  // Folder modal state
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FlowFolder | null>(null);
  const [deleteFolderModalOpen, setDeleteFolderModalOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  // Load recipes and folders on mount
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      await storageService.initializeMockData();
      const [profiles, folderList] = await Promise.all([
        storageService.getProfiles(),
        storageService.getFolders(),
      ]);
      setRecipes(profiles);
      setFolders(folderList);
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
      await loadAll();
      success(t("recipes.toast.deleted"));
    } catch (err) {
      console.error("Error deleting recipe:", err);
      error(t("recipes.toast.deleteError"));
    } finally {
      setDeleteModalOpen(false);
      setRecipeToDelete(null);
    }
  };

  // --- Folder handlers ---

  const handleOpenCreateFolder = () => {
    setEditingFolder(null);
    setFolderModalOpen(true);
  };

  const handleOpenEditFolder = (folder: FlowFolder) => {
    setEditingFolder(folder);
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async (name: string, icon: string) => {
    try {
      if (editingFolder) {
        await storageService.updateFolder(editingFolder.id, { name, icon });
        success(t("folders.toast.updated"));
      } else {
        await storageService.saveFolder({ name, icon });
        success(t("folders.toast.created"));
      }
      await loadAll();
    } catch (err) {
      console.error("Error saving folder:", err);
      error(t("folders.toast.error"));
    }
  };

  const handleDeleteFolderRequest = (folderId: string) => {
    setFolderToDelete(folderId);
    setDeleteFolderModalOpen(true);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      await storageService.deleteFolder(folderToDelete);
      await loadAll();
      success(t("folders.toast.deleted"));
    } catch (err) {
      console.error("Error deleting folder:", err);
      error(t("folders.toast.error"));
    } finally {
      setDeleteFolderModalOpen(false);
      setFolderToDelete(null);
    }
  };

  // Filtering
  const filteredRecipes = recipes.filter(
    (recipe) =>
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.url.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Grouped: recipes belonging to a folder
  const recipesByFolder = (folderId: string) =>
    filteredRecipes.filter((r) => r.folderId === folderId);

  // Ungrouped: recipes with no folder or folder not found
  const ungroupedRecipes = filteredRecipes.filter(
    (r) => !r.folderId || !folders.some((f) => f.id === r.folderId),
  );

  return {
    searchQuery,
    setSearchQuery,
    recipes,
    folders,
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
    recipesByFolder,
    ungroupedRecipes,
    // folder modal
    folderModalOpen,
    setFolderModalOpen,
    editingFolder,
    handleOpenCreateFolder,
    handleOpenEditFolder,
    handleSaveFolder,
    deleteFolderModalOpen,
    setDeleteFolderModalOpen,
    handleDeleteFolderRequest,
    handleConfirmDeleteFolder,
  };
};
