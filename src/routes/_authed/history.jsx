import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Clock, Weight, Trash2, Plus, Layers } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, StatBlock, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { formatDuration } from "@/lib/slicer/slice";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/history")({
  component: HistoryPage,
});

const STATUS_STYLE = {
  completed: "bg-emerald-500/10 text-emerald-300",
  printing: "bg-sky-500/10 text-sky-300",
  queued: "bg-slate-500/10 text-slate-300",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-secondary text-muted-foreground",
};

function HistoryPage() {
  const store = usePrint();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await base44.entities.PrintJob.list("-created_date", 200);
      setJobs(Array.isArray(list) ? list : list?.items || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalSeconds = jobs.reduce((sum, job) => sum + (job.duration_seconds || job.estimated_seconds || 0), 0);
  const totalGrams = jobs.reduce((sum, job) => sum + (job.filament_grams || 0), 0);
  const completed = jobs.filter((job) => job.status === "completed").length;

  const logCurrent = async () => {
    if (!store.result) {
      toast.error("Slice the plate first.");
      return;
    }
    await base44.entities.PrintJob.create({
      model_name: store.models.map((m) => m.name).join(", ") || "Untitled",
      printer_name: store.printer.name,
      material: store.filament.material,
      status: "completed",
      estimated_seconds: store.result.stats.timeSeconds,
      duration_seconds: store.result.stats.timeSeconds,
      filament_grams: store.result.stats.filamentGrams,
      layer_count: store.result.stats.layerCount,
      notes: "Logged from the slicer",
    });
    toast.success("Print logged");
    load();
  };

  const remove = async (id) => {
    await base44.entities.PrintJob.delete(id);
    setJobs((prev) => prev.filter((job) => job.id !== id));
  };

  const actions = {
    onImport: () => navigate({ to: "/" }),
    onExport: store.exportGcode,
    onUndo: store.undo,
    onRedo: store.redo,
    onSlice: store.sliceNow,
    onSend: () => navigate({ to: "/device" }),
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    canSend: !!store.result,
  };

  return (
    <AppShell
      title="Print History"
      subtitle={`${jobs.length} job${jobs.length === 1 ? "" : "s"}`}
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard title="Lifetime">
            <div className="grid grid-cols-2 gap-2">
              <StatBlock label="Print hours" value={(totalSeconds / 3600).toFixed(1)} unit="h" tone="accent" />
              <StatBlock label="Filament" value={(totalGrams / 1000).toFixed(2)} unit="kg" />
              <StatBlock label="Jobs" value={jobs.length} />
              <StatBlock label="Completed" value={completed} />
            </div>
            <button
              type="button"
              onClick={logCurrent}
              disabled={!store.result}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Log current slice
            </button>
          </SectionCard>
          <SectionCard title="Note">
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Jobs are recorded when you log a slice or upload G-code to a connected printer. Estimated and
              actual durations are kept separately so you can compare them.
            </p>
          </SectionCard>
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl">
          {loading ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground">Loading history…</div>
          ) : jobs.length === 0 ? (
            <EmptyHint>No print jobs recorded yet.</EmptyHint>
          ) : (
            <ul className="space-y-1.5">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12.5px] font-medium text-foreground">{job.model_name}</span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide",
                            STATUS_STYLE[job.status] || STATUS_STYLE.queued
                          )}
                        >
                          {job.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-muted-foreground">
                        <span>{new Date(job.created_date).toLocaleString("en-US")}</span>
                        <span>{job.printer_name}</span>
                        <span>{job.material}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDuration(job.duration_seconds || job.estimated_seconds || 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Weight className="h-2.5 w-2.5" />
                          {job.filament_grams ?? 0} g
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-2.5 w-2.5" />
                          {job.layer_count ?? "—"}
                        </span>
                      </div>
                      {job.notes && (
                        <div className="mt-0.5 text-[10.5px] text-muted-foreground/80">{job.notes}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(job.id)}
                      className="rounded-md border border-border/70 p-1 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}