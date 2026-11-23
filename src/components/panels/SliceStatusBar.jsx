import { useState } from "react";
import { AlertTriangle, ChevronUp, Clock, Layers, Loader2, Terminal, Weight } from "lucide-react";
import { formatDuration } from "@/lib/slicer/slice";
import { cn } from "@/lib/utils";

export default function SliceStatusBar({ store }) {
  const { result, slicing, logs, models } = store;
  const [open, setOpen] = useState(false);
  const warnings = result?.warnings || [];

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-9 left-0 right-0 max-h-[240px] overflow-y-auto border-t border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur">
          {logs.length === 0 ? (
            <div className="py-3 text-[11.5px] text-muted-foreground">No activity yet.</div>
          ) : (
            <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
              {logs
                .slice()
                .reverse()
                .map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(
                      entry.level === "error" && "text-destructive",
                      entry.level === "warn" && "text-amber-400",
                      entry.level === "info" && "text-muted-foreground"
                    )}
                  >
                    <span className="mr-2 text-muted-foreground/50">
                      {new Date(entry.at).toLocaleTimeString("en-US", { hour12: false })}
                    </span>
                    {entry.message}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex h-9 items-center gap-4 px-4 text-[11.5px]">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              slicing ? "animate-pulse bg-primary" : result ? "bg-emerald-400" : "bg-muted-foreground/50"
            )}
          />
          <span className="text-muted-foreground">
            {slicing ? "Slicing…" : result ? "Sliced" : models.length ? "Ready to slice" : "Empty plate"}
          </span>
        </span>
        {slicing && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
        <span className="text-border">|</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Layers className="h-3 w-3" strokeWidth={1.8} />
          <span className="font-mono text-foreground">{result ? result.stats.layerCount : 0}</span> layers
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" strokeWidth={1.8} />
          <span className="font-mono text-foreground">
            {result ? formatDuration(result.stats.timeSeconds) : "—"}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Weight className="h-3 w-3" strokeWidth={1.8} />
          <span className="font-mono text-foreground">
            {result ? `${result.stats.filamentGrams} g` : "—"}
          </span>
        </span>
        {warnings.length > 0 && (
          <span className="flex items-center gap-1.5 text-amber-400">
            <AlertTriangle className="h-3 w-3" strokeWidth={1.9} />
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Terminal className="h-3 w-3" strokeWidth={1.8} />
          Logs
          <ChevronUp className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>
    </div>
  );
}