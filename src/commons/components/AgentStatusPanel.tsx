import { AlertCircle, Brain, CheckCircle2, Loader2 } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { Button } from "./ui";

export interface AgentLog {
  id: string;
  timestamp: number;
  type: "info" | "action" | "success" | "error" | "thinking";
  message: string;
}

interface AgentStatusPanelProps {
  logs: AgentLog[];
  isRunning: boolean;
  onStop: () => void;
}

export const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({
  logs,
  isRunning,
  onStop,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="bg-bg-card rounded-lg border border-border-default/50 overflow-hidden flex flex-col h-[300px] shadow-sm">
      {/* Header */}
      <div className="bg-bg-terminal px-4 py-2 border-b border-border-default flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-primary/90">
          <Brain
            className={`w-4 h-4 ${isRunning ? "text-accent-primary animate-pulse" : "text-text-muted"}`}
          />
          <span className="text-xs font-mono font-medium">AGENT_LITE_V1.0</span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent-primary/10 border border-accent-primary/20 text-[10px] text-accent-primary animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              EJECUTANDO
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onStop}
            className="h-6 text-[10px] hover:bg-status-error/10 hover:text-status-error px-2"
          >
            DETENER
          </Button>
        </div>
      </div>

      {/* Logs Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-bg-terminal/50"
      >
        {logs.length === 0 && (
          <div className="text-text-muted/50 text-center italic mt-10">
            Esperando instrucciones...
          </div>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300"
          >
            <span className="text-text-muted min-w-[60px]">
              {new Date(log.timestamp).toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
            <div className="flex-1">
              {log.type === "thinking" && (
                <span className="text-accent-secondary flex items-center gap-1">
                  <Brain className="w-3 h-3" />
                  {log.message}
                </span>
              )}
              {log.type === "action" && (
                <span className="text-accent-primary font-bold">
                  {">"} {log.message}
                </span>
              )}
              {log.type === "info" && (
                <span className="text-text-secondary">{log.message}</span>
              )}
              {log.type === "success" && (
                <span className="text-status-success flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {log.message}
                </span>
              )}
              {log.type === "error" && (
                <span className="text-status-error flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {log.message}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
