import { lazy, Suspense, useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import MainLayout from "./commons/components/MainLayout";
import { ToastProvider } from "./commons/components/ui";
import storageService from "./commons/lib/storage";
import { applyThemeToDocument } from "./commons/lib/theme";

const RecipesPage = lazy(() => import("./pages/RecipesPage"));
const ProfileFormPage = lazy(() => import("./pages/ProfileFormPage"));
const SequenceFormPage = lazy(() => import("./pages/SequenceFormPage"));
const StepEditorPage = lazy(() => import("./pages/StepEditorPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const HistoryDetailsPage = lazy(() => import("./pages/HistoryDetailsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AboutPrivacyPage = lazy(() => import("./pages/AboutPrivacyPage"));
const TestInspectorPage = lazy(() => import("./pages/TestInspectorPage"));
const AutopilotPage = lazy(() => import("./pages/AutopilotPage"));

const RouteFallback = () => (
  <div className="flex h-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
  </div>
);

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
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<RecipesPage />} />
              <Route path="profile/new" element={<ProfileFormPage />} />
              <Route path="profile/edit" element={<ProfileFormPage />} />
              <Route path="sequence/new" element={<SequenceFormPage />} />
              <Route path="profile/:id/steps" element={<StepEditorPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="history/:id" element={<HistoryDetailsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="settings/about" element={<AboutPrivacyPage />} />
              <Route path="test-inspector" element={<TestInspectorPage />} />
              <Route path="autopilot" element={<AutopilotPage />} />
            </Route>
          </Routes>
        </Suspense>
      </MemoryRouter>
    </ToastProvider>
  );
}

export default App;
