import { useEffect, useState } from "react";
import { useToast } from "../../../commons/components/ui";
import { inspectorService } from "../../../commons/lib/inspectorService";
import type { SelectorInfo } from "../../../commons/types";

export const useTestInspector = () => {
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [capturedSelectors, setCapturedSelectors] = useState<SelectorInfo[]>(
    [],
  );

  const { error } = useToast();

  useEffect(() => {
    // Listen for captured elements
    inspectorService.onElementCaptured((payload) => {
      console.log("Element captured:", payload);
      setCapturedSelectors((prev) => [...prev, payload.selectorInfo]);
    });
  }, []);

  const handleActivateInspector = async () => {
    try {
      await inspectorService.activateInspector("test-profile-id");
      setIsInspectorActive(true);
    } catch (err) {
      console.error("Failed to activate inspector:", err);
      error(
        "Error al activar el inspector. Asegúrate de estar en una pestaña web válida.",
      );
    }
  };

  const handleDeactivateInspector = async () => {
    try {
      await inspectorService.deactivateInspector();
      setIsInspectorActive(false);
    } catch (error) {
      console.error("Failed to deactivate inspector:", error);
    }
  };

  const openDemoPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("demo.html") });
  };

  return {
    isInspectorActive,
    capturedSelectors,
    handleActivateInspector,
    handleDeactivateInspector,
    openDemoPage,
  };
};
