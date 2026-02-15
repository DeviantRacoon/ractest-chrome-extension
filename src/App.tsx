import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import MainLayout from "./commons/components/MainLayout";
import { applyThemeToDocument } from "./commons/lib/theme";
import { ToastProvider } from "./commons/components/ui";
import storageService from "./commons/lib/storage";
import AutopilotPage from "./pages/AutopilotPage";
import HistoryPage from "./pages/HistoryPage";
import ProfileFormPage from "./pages/ProfileFormPage";
import RecipesPage from "./pages/RecipesPage";
import SettingsPage from "./pages/SettingsPage";
import StepEditorPage from "./pages/StepEditorPage";
import TestInspectorPage from "./pages/TestInspectorPage";

function App() {
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await storageService.getSettings();
        applyThemeToDocument(data.theme);
      } catch (error) {
        console.error("Error loading settings in App:", error);
      }
    };
    loadSettings();
  }, []);

  return (
    <ToastProvider>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<RecipesPage />} />
            <Route path="profile/new" element={<ProfileFormPage />} />
            <Route path="profile/edit" element={<ProfileFormPage />} />
            <Route path="profile/:id/steps" element={<StepEditorPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="test-inspector" element={<TestInspectorPage />} />
            <Route path="autopilot" element={<AutopilotPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
}

export default App;
