import React from "react";
import { Button, Card } from "../../commons/components/ui";
import type { useTestInspector } from "./hooks/useTestInspector";

type InspectorViewProps = ReturnType<typeof useTestInspector>;

export const InspectorView: React.FC<InspectorViewProps> = ({
  isInspectorActive,
  capturedSelectors,
  handleActivateInspector,
  handleDeactivateInspector,
  openDemoPage,
}) => {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Test Inspector
        </h1>
        <p className="text-text-secondary text-sm">
          Prueba el sistema de inspección del DOM
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Control del Inspector
        </h2>

        <div className="flex gap-3 mb-4">
          <Button
            variant={isInspectorActive ? "secondary" : "primary"}
            onClick={handleActivateInspector}
            disabled={isInspectorActive}
          >
            {isInspectorActive ? "✓ Inspector Activo" : "Activar Inspector"}
          </Button>

          <Button
            variant="ghost"
            onClick={handleDeactivateInspector}
            disabled={!isInspectorActive}
          >
            Desactivar
          </Button>

          <Button variant="secondary" onClick={openDemoPage}>
            Abrir Página Demo
          </Button>
        </div>

        {isInspectorActive && (
          <div className="p-3 bg-accent-primary/10 border border-accent-primary rounded-lg">
            <p className="text-sm text-accent-primary font-medium">
              ✓ Inspector activo - Haz hover y click sobre elementos en la
              página
            </p>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Elementos Capturados ({capturedSelectors.length})
        </h2>

        {capturedSelectors.length === 0 ? (
          <p className="text-text-secondary text-sm">
            No se han capturado elementos todavía. Activa el inspector y haz
            click en elementos de la página.
          </p>
        ) : (
          <div className="space-y-3">
            {capturedSelectors.map((selector, index) => (
              <div
                key={index}
                className="p-4 bg-bg-secondary rounded-lg border border-border"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-mono text-accent-primary">
                    {selector.tagName}
                  </span>
                  <span className="text-xs text-text-muted">#{index + 1}</span>
                </div>

                <div className="space-y-1 text-sm">
                  {selector.testId && (
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium min-w-24">
                        data-testid:
                      </span>
                      <code className="text-accent-primary font-mono">
                        {selector.testId}
                      </code>
                    </div>
                  )}

                  {selector.id && (
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium min-w-24">
                        id:
                      </span>
                      <code className="text-accent-primary font-mono">
                        {selector.id}
                      </code>
                    </div>
                  )}

                  {selector.name && (
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium min-w-24">
                        name:
                      </span>
                      <code className="text-accent-primary font-mono">
                        {selector.name}
                      </code>
                    </div>
                  )}

                  {selector.ariaLabel && (
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium min-w-24">
                        aria-label:
                      </span>
                      <code className="text-text-primary font-mono text-xs">
                        {selector.ariaLabel}
                      </code>
                    </div>
                  )}

                  {selector.cssSelector && (
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium min-w-24">
                        CSS:
                      </span>
                      <code className="text-text-primary font-mono text-xs break-all">
                        {selector.cssSelector}
                      </code>
                    </div>
                  )}

                  {selector.text && (
                    <div className="flex gap-2">
                      <span className="text-text-muted font-medium min-w-24">
                        Text:
                      </span>
                      <span className="text-text-secondary text-xs italic">
                        "{selector.text}"
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
