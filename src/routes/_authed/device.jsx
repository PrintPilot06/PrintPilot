import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plug, RefreshCw, Pause, Play, Square, Upload, Loader2, Wifi, WifiOff, Thermometer } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, TextField, SelectField, StatBlock, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { printerCommand, printerStatus, uploadGcode } from "@/lib/server-fns";
import { base44 } from "@/api/base44Client";

export const Route = createFileRoute("/_authed/device")({
  component: DevicePage,
});

const STORAGE_KEY = "printpilot.printer.connection";

function DevicePage() {
  const store = usePrint();
  const navigate = useNavigate();
  const statusFn = useServerFn(printerStatus);
  const commandFn = useServerFn(printerCommand);
  const uploadFn = useServerFn(uploadGcode);

  const [conn, setConn] = useState({ kind: "octoprint", baseUrl: "", apiKey: "" });
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setConn((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed stored connection */
    }
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      if (!conn.baseUrl) {
        if (!silent) setError("Enter the printer's address first.");
        return;
      }
      if (!silent) setBusy(true);
      try {
        const result = await statusFn({
          data: { kind: conn.kind, baseUrl: conn.baseUrl, apiKey: conn.apiKey || undefined },
        });
        setStatus(result);
        setConnected(true);
        setError(null);
      } catch (err) {
        setConnected(false);
        setStatus(null);
        if (!silent) setError(err.message || "Could not reach the printer.");
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [conn, statusFn]
  );

  useEffect(() => {
    if (!connected) return undefined;
    const timer = setInterval(() => refresh(true), 15000);
    return () => clearInterval(timer);
  }, [connected, refresh]);

  const connect = async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
    await refresh();
  };

  const sendCommand = async (action) => {
    setBusy(true);
    try {
      await commandFn({ data: { kind: conn.kind, baseUrl: conn.baseUrl, apiKey: conn.apiKey || undefined, action } });
      toast.success(`Printer ${action} sent`);
      await refresh(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendGcode = async () => {
    if (!store.result) {
      toast.error("Slice the plate before sending G-code.");
      return;
    }
    setBusy(true);
    try {
      const filename = `${(store.projectName || "printpilot").replace(/[^a-z0-9-_]+/gi, "-")}.gcode`;
      await uploadFn({
        data: {
          kind: conn.kind,
          baseUrl: conn.baseUrl,
          apiKey: conn.apiKey || undefined,
          filename,
          gcode: store.result.gcode,
        },
      });
      await base44.entities.PrintJob.create({
        model_name: store.models.map((m) => m.name).join(", ") || filename,
        printer_name: store.printer.name,
        material: store.filament.material,
        status: "queued",
        estimated_seconds: store.result.stats.timeSeconds,
        filament_grams: store.result.stats.filamentGrams,
        layer_count: store.result.stats.layerCount,
        notes: `Uploaded to ${conn.kind} as ${filename}`,
      });
      toast.success("G-code uploaded to the printer");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const actions = {
    onImport: () => navigate({ to: "/" }),
    onExport: store.exportGcode,
    onUndo: store.undo,
    onRedo: store.redo,
    onSlice: store.sliceNow,
    onSend: sendGcode,
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    canSend: !!store.result && !!conn.baseUrl,
  };

  const progress = status?.progress != null ? Math.round(status.progress * 100) : null;

  return (
    <AppShell
      title="Device"
      subtitle={connected ? status?.state || "Connected" : "Not connected"}
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard
            title="Connection"
            action={connected ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
          >
            <div className="space-y-2">
              <SelectField
                label="Firmware interface"
                value={conn.kind}
                onChange={(v) => setConn({ ...conn, kind: v })}
                options={[
                  { value: "octoprint", label: "OctoPrint" },
                  { value: "moonraker", label: "Klipper / Moonraker" },
                ]}
              />
              <TextField
                label="Printer address"
                value={conn.baseUrl}
                placeholder="http://192.168.1.40"
                onChange={(v) => setConn({ ...conn, baseUrl: v })}
              />
              <TextField
                label="API key"
                type="password"
                value={conn.apiKey}
                placeholder="Optional for Moonraker"
                onChange={(v) => setConn({ ...conn, apiKey: v })}
              />
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                {connected ? "Reconnect" : "Connect"}
              </button>
              <p className="text-[10.5px] leading-relaxed text-muted-foreground/80">
                The address and key stay in this browser only. PrintPilot calls your printer through the app
                server, so it must be reachable from the internet or your local network.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Controls">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                disabled={!connected || busy}
                onClick={() => sendCommand("pause")}
                className="flex flex-col items-center gap-1 rounded-xl border border-border/70 px-2 py-2 text-[10.5px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </button>
              <button
                type="button"
                disabled={!connected || busy}
                onClick={() => sendCommand("resume")}
                className="flex flex-col items-center gap-1 rounded-xl border border-border/70 px-2 py-2 text-[10.5px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </button>
              <button
                type="button"
                disabled={!connected || busy}
                onClick={() => sendCommand("cancel")}
                className="flex flex-col items-center gap-1 rounded-xl border border-border/70 px-2 py-2 text-[10.5px] text-destructive transition-colors hover:border-destructive/50 disabled:opacity-40"
              >
                <Square className="h-3.5 w-3.5" />
                Cancel
              </button>
            </div>
            <button
              type="button"
              onClick={sendGcode}
              disabled={!connected || !store.result || busy}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload sliced G-code
            </button>
          </SectionCard>
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          {!connected ? (
            <div className="rounded-2xl border border-border/70 bg-card/60 p-6 text-center">
              <WifiOff className="mx-auto h-6 w-6 text-muted-foreground" />
              <h2 className="mt-2 font-heading text-[15px] font-semibold text-foreground">No printer connected</h2>
              <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
                PrintPilot talks to OctoPrint and Klipper/Moonraker over their HTTP APIs. Enter your printer's
                address on the right and connect — status, temperatures, progress and job control come straight
                from the machine. Slicing and G-code export work without any connection.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="metric-label">Printer state</div>
                    <div className="font-heading text-[16px] font-semibold text-foreground">{status?.state}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => refresh()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatBlock label="Nozzle" value={status?.nozzle != null ? `${status.nozzle.toFixed(1)}°` : "—"} />
                  <StatBlock label="Nozzle target" value={status?.nozzleTarget != null ? `${status.nozzleTarget}°` : "—"} />
                  <StatBlock label="Bed" value={status?.bed != null ? `${status.bed.toFixed(1)}°` : "—"} />
                  <StatBlock label="Bed target" value={status?.bedTarget != null ? `${status.bedTarget}°` : "—"} />
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                    <span className="truncate">{status?.fileName || "No job loaded"}</span>
                    <span className="font-mono text-foreground">{progress != null ? `${progress}%` : "—"}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress ?? 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
                <div className="flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-[14px] font-semibold text-foreground">Monitoring</h2>
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                  Status refreshes every 15 seconds while this page is open. Camera streams are provided by the
                  printer's own web interface at {conn.baseUrl}.
                </p>
                <a
                  href={conn.baseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-1.5 text-[11.5px] text-foreground transition-colors hover:border-primary/50"
                >
                  Open printer interface
                </a>
              </div>
            </>
          )}

          {!store.result && (
            <EmptyHint>Slice the plate first — then the G-code can be uploaded straight to the printer.</EmptyHint>
          )}
        </div>
      </div>
    </AppShell>
  );
}