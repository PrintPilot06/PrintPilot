import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, Save, Trash2, Download, Upload, Printer, Droplet, Check } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, TextField, NumberField, SelectField, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { useProfiles } from "@/lib/useProfiles";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/printers")({
  component: PrintersPage,
});

const PRINTER_FIELDS = [
  { key: "name", label: "Profile name", type: "text" },
  { key: "manufacturer", label: "Manufacturer", type: "text" },
  { key: "build_x", label: "Build volume X", type: "number", unit: "mm" },
  { key: "build_y", label: "Build volume Y", type: "number", unit: "mm" },
  { key: "build_z", label: "Build volume Z", type: "number", unit: "mm" },
  { key: "nozzle_diameter", label: "Nozzle diameter", type: "number", step: 0.05, unit: "mm" },
  { key: "filament_diameter", label: "Filament diameter", type: "number", step: 0.05, unit: "mm" },
  { key: "max_nozzle_temp", label: "Max nozzle temp", type: "number", step: 5, unit: "°C" },
  { key: "max_bed_temp", label: "Max bed temp", type: "number", step: 5, unit: "°C" },
  { key: "max_speed", label: "Max speed", type: "number", step: 10, unit: "mm/s" },
  { key: "max_acceleration", label: "Max acceleration", type: "number", step: 100, unit: "mm/s²" },
];

const FILAMENT_FIELDS = [
  { key: "name", label: "Profile name", type: "text" },
  { key: "diameter", label: "Diameter", type: "number", step: 0.05, unit: "mm" },
  { key: "density", label: "Density", type: "number", step: 0.01, unit: "g/cm³" },
  { key: "nozzle_temp", label: "Nozzle temp", type: "number", step: 5, unit: "°C" },
  { key: "first_layer_nozzle_temp", label: "First layer nozzle", type: "number", step: 5, unit: "°C" },
  { key: "bed_temp", label: "Bed temp", type: "number", step: 5, unit: "°C" },
  { key: "first_layer_bed_temp", label: "First layer bed", type: "number", step: 5, unit: "°C" },
  { key: "max_volumetric_speed", label: "Max volumetric speed", type: "number", step: 1, unit: "mm³/s" },
  { key: "flow_ratio", label: "Flow ratio", type: "number", step: 0.01 },
  { key: "retraction_length", label: "Retraction length", type: "number", step: 0.1, unit: "mm" },
  { key: "retraction_speed", label: "Retraction speed", type: "number", step: 5, unit: "mm/s" },
  { key: "fan_speed", label: "Fan speed", type: "number", step: 5, unit: "%" },
];

const NEW_PRINTER = {
  name: "Custom printer",
  manufacturer: "",
  build_x: 220,
  build_y: 220,
  build_z: 250,
  nozzle_diameter: 0.4,
  filament_diameter: 1.75,
  max_nozzle_temp: 300,
  max_bed_temp: 110,
  max_speed: 300,
  max_acceleration: 5000,
  firmware: "Marlin",
  start_gcode: "",
  end_gcode: "",
};

const NEW_FILAMENT = {
  name: "Custom filament",
  material: "Custom",
  diameter: 1.75,
  density: 1.24,
  nozzle_temp: 210,
  first_layer_nozzle_temp: 215,
  bed_temp: 60,
  first_layer_bed_temp: 65,
  max_volumetric_speed: 12,
  flow_ratio: 1,
  retraction_length: 0.8,
  retraction_speed: 35,
  fan_speed: 100,
};

function PrintersPage() {
  const store = usePrint();
  const navigate = useNavigate();
  const { printers, filaments, reload, loading } = useProfiles();
  const [tab, setTab] = useState("printers");
  const [draft, setDraft] = useState(null);
  const importRef = useRef(null);

  const isPrinter = tab === "printers";
  const list = isPrinter ? printers : filaments;
  const fields = isPrinter ? PRINTER_FIELDS : FILAMENT_FIELDS;

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

  const startNew = () => setDraft({ ...(isPrinter ? NEW_PRINTER : NEW_FILAMENT) });

  const save = async () => {
    if (!draft?.name?.trim()) {
      toast.error("Give the profile a name.");
      return;
    }
    try {
      if (isPrinter) {
        if (draft.id) await base44.entities.PrinterProfile.update(draft.id, draft);
        else await base44.entities.PrinterProfile.create({ ...draft, is_builtin: false });
      } else if (draft.id) {
        await base44.entities.FilamentProfile.update(draft.id, draft);
      } else {
        await base44.entities.FilamentProfile.create({ ...draft, is_builtin: false });
      }
      toast.success("Profile saved");
      setDraft(null);
      await reload();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async (profile) => {
    try {
      if (isPrinter) await base44.entities.PrinterProfile.delete(profile.id);
      else await base44.entities.FilamentProfile.delete(profile.id);
      toast.success("Profile removed");
      await reload();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const exportAll = () => {
    const payload = isPrinter ? printers : filaments;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isPrinter ? "printpilot-printers.json" : "printpilot-filaments.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProfiles = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const clean = { ...item };
        delete clean.id;
        delete clean.created_date;
        delete clean.updated_date;
        delete clean.created_by_id;
        if (isPrinter) await base44.entities.PrinterProfile.create(clean);
        else await base44.entities.FilamentProfile.create(clean);
      }
      toast.success(`Imported ${items.length} profile(s)`);
      await reload();
    } catch (error) {
      toast.error(`Import failed: ${error.message}`);
    }
  };

  return (
    <AppShell
      title="Printers & Filament"
      subtitle={loading ? "Loading…" : `${printers.length} printers · ${filaments.length} filaments`}
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard title="Active configuration">
            <div className="space-y-2">
              <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                <div className="metric-label">Printer</div>
                <div className="text-[12.5px] font-medium text-foreground">{store.printer.name}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {store.printer.build_x} × {store.printer.build_y} × {store.printer.build_z} mm
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                <div className="metric-label">Filament</div>
                <div className="text-[12.5px] font-medium text-foreground">{store.filament.name}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {store.settings.nozzleTemp} °C / {store.settings.bedTemp} °C
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Transfer">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={exportAll}
                className="flex w-full items-center gap-2 rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50"
              >
                <Download className="h-3.5 w-3.5 text-primary" />
                Export {isPrinter ? "printers" : "filaments"}
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50"
              >
                <Upload className="h-3.5 w-3.5 text-primary" />
                Import profiles
              </button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={importProfiles} />
            </div>
          </SectionCard>
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex rounded-xl border border-border/70 bg-card/60 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setTab("printers");
                  setDraft(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors",
                  isPrinter ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Printer className="h-3.5 w-3.5" />
                Printers
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("filaments");
                  setDraft(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors",
                  !isPrinter ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Droplet className="h-3.5 w-3.5" />
                Filaments
              </button>
            </div>
            <button
              type="button"
              onClick={startNew}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New {isPrinter ? "printer" : "filament"}
            </button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
            <div className="space-y-1.5">
              {list.length === 0 && !loading && (
                <EmptyHint>No profiles yet. Create one to get started.</EmptyHint>
              )}
              {list.map((profile) => {
                const active = isPrinter
                  ? profile.name === store.printer.name
                  : profile.name === store.filament.name;
                return (
                  <div
                    key={profile.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                      active ? "border-primary/50 bg-primary/[0.06]" : "border-border/60 bg-card/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setDraft({ ...profile })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-medium text-foreground">{profile.name}</span>
                        {profile.is_builtin && (
                          <span className="rounded-full border border-border/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                            built-in
                          </span>
                        )}
                        {active && <Check className="h-3 w-3 text-primary" />}
                      </div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">
                        {isPrinter
                          ? `${profile.build_x} × ${profile.build_y} × ${profile.build_z} mm · ${profile.nozzle_diameter} mm · ${profile.firmware}`
                          : `${profile.material} · ${profile.nozzle_temp}/${profile.bed_temp} °C · ${profile.density} g/cm³`}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => (isPrinter ? store.applyPrinterProfile(profile) : store.applyFilamentProfile(profile))}
                      className="rounded-md border border-border/70 px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(profile)}
                      className="rounded-md border border-border/70 p-1 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/60 p-3.5">
              {!draft ? (
                <EmptyHint>Select a profile to edit it, or create a new one.</EmptyHint>
              ) : (
                <div className="space-y-1.5">
                  <div className="mb-1 font-heading text-[13px] font-semibold text-foreground">
                    {draft.id ? "Edit profile" : "New profile"}
                  </div>
                  {fields.map((field) =>
                    field.type === "number" ? (
                      <NumberField
                        key={field.key}
                        label={field.label}
                        value={draft[field.key]}
                        step={field.step || 1}
                        unit={field.unit}
                        onChange={(v) => setDraft({ ...draft, [field.key]: v })}
                      />
                    ) : (
                      <TextField
                        key={field.key}
                        label={field.label}
                        value={draft[field.key] || ""}
                        onChange={(v) => setDraft({ ...draft, [field.key]: v })}
                      />
                    )
                  )}
                  {isPrinter && (
                    <>
                      <SelectField
                        label="Firmware"
                        value={draft.firmware || "Marlin"}
                        onChange={(v) => setDraft({ ...draft, firmware: v })}
                        options={["Marlin", "Klipper", "Prusa", "Bambu", "RepRapFirmware"]}
                      />
                      <TextField
                        label="Start G-code"
                        value={draft.start_gcode || ""}
                        placeholder="Leave empty for the default homing sequence"
                        onChange={(v) => setDraft({ ...draft, start_gcode: v })}
                      />
                      <TextField
                        label="End G-code"
                        value={draft.end_gcode || ""}
                        placeholder="Leave empty for the default park sequence"
                        onChange={(v) => setDraft({ ...draft, end_gcode: v })}
                      />
                    </>
                  )}
                  {!isPrinter && (
                    <SelectField
                      label="Material"
                      value={draft.material || "Custom"}
                      onChange={(v) => setDraft({ ...draft, material: v })}
                      options={["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Nylon", "Polycarbonate", "Custom"]}
                    />
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={save}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      className="rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}