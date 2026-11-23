import { useEffect } from "react";
import { Printer, Droplet, Sparkles, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SectionCard, SelectField, SliderRow, ToggleRow } from "@/components/controls";
import { useProfiles } from "@/lib/useProfiles";
import { INFILL_PATTERNS } from "@/lib/defaults";

export function PrinterCard({ store }) {
  const { printers } = useProfiles();
  const match = printers.find((p) => p.name === store.printer.name);

  return (
    <SectionCard
      title="Printer"
      action={<span className="chip">{store.printer.firmware}</span>}
    >
      <SelectField
        value={match?.id || ""}
        onChange={(id) => {
          const profile = printers.find((p) => p.id === id);
          if (profile) store.applyPrinterProfile(profile);
        }}
        options={[
          { value: "", label: store.printer.name },
          ...printers.filter((p) => p.name !== store.printer.name).map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <Printer className="h-3 w-3" strokeWidth={1.8} />
        {store.printer.build_x} × {store.printer.build_y} × {store.printer.build_z} mm ·{" "}
        {store.printer.nozzle_diameter} mm
      </div>
    </SectionCard>
  );
}

export function FilamentCard({ store }) {
  const { filaments } = useProfiles();
  const match = filaments.find((f) => f.name === store.filament.name);

  return (
    <SectionCard title="Filament" action={<span className="chip">{store.filament.material}</span>}>
      <SelectField
        value={match?.id || ""}
        onChange={(id) => {
          const profile = filaments.find((f) => f.id === id);
          if (profile) store.applyFilamentProfile(profile);
        }}
        options={[
          { value: "", label: store.filament.name },
          ...filaments.filter((f) => f.name !== store.filament.name).map((f) => ({ value: f.id, label: f.name })),
        ]}
      />
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <Droplet className="h-3 w-3" strokeWidth={1.8} />
        {store.settings.nozzleTemp} °C nozzle · {store.settings.bedTemp} °C bed · {store.filament.diameter} mm
      </div>
    </SectionCard>
  );
}

export function QuickSettings({ store }) {
  const { settings, patchSettings, mode, setMode } = store;
  const advanced = mode === "advanced";

  return (
    <SectionCard
      title="Print settings"
      action={
        <button
          type="button"
          onClick={() => setMode(advanced ? "beginner" : "advanced")}
          className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          {advanced ? "Advanced" : "Beginner"}
        </button>
      }
    >
      <SliderRow
        label="Layer height"
        value={settings.layerHeight}
        onChange={(v) => patchSettings({ layerHeight: v }, { record: false })}
        min={0.08}
        max={0.32}
        step={0.02}
        unit="mm"
        format={(v) => v.toFixed(2)}
      />
      <SliderRow
        label="Walls"
        value={settings.wallCount}
        onChange={(v) => patchSettings({ wallCount: v }, { record: false })}
        min={1}
        max={8}
        unit=""
      />
      <SliderRow
        label="Infill"
        value={settings.infillDensity}
        onChange={(v) => patchSettings({ infillDensity: v }, { record: false })}
        min={0}
        max={100}
        unit="%"
      />
      {advanced && (
        <>
          <SliderRow
            label="Print speed"
            value={settings.printSpeed}
            onChange={(v) => patchSettings({ printSpeed: v }, { record: false })}
            min={20}
            max={Math.min(store.printer.max_speed || 300, 500)}
            step={5}
            unit="mm/s"
          />
          <SliderRow
            label="Nozzle temp"
            value={settings.nozzleTemp}
            onChange={(v) => patchSettings({ nozzleTemp: v }, { record: false })}
            min={170}
            max={store.printer.max_nozzle_temp || 300}
            step={5}
            unit="°C"
          />
          <SliderRow
            label="Bed temp"
            value={settings.bedTemp}
            onChange={(v) => patchSettings({ bedTemp: v }, { record: false })}
            min={0}
            max={store.printer.max_bed_temp || 110}
            step={5}
            unit="°C"
          />
          <SelectField
            className="mt-2"
            label="Infill pattern"
            value={settings.infillPattern}
            onChange={(v) => patchSettings({ infillPattern: v }, { record: false })}
            options={INFILL_PATTERNS}
          />
          <div className="mt-2">
            <ToggleRow
              label="Supports"
              hint={`Overhang angle ${settings.supportAngle}°`}
              checked={settings.supports}
              onChange={(v) => patchSettings({ supports: v })}
            />
            <ToggleRow
              label="Ironing"
              checked={settings.ironing}
              onChange={(v) => patchSettings({ ironing: v })}
            />
          </div>
        </>
      )}
      <Link
        to="/settings"
        className="mt-2 flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        All {advanced ? "180+" : "settings"}
        <ChevronRight className="h-3.5 w-3.5 text-primary" />
      </Link>
    </SectionCard>
  );
}

export function AiHintCard({ store, onOpen }) {
  return (
    <SectionCard title="PrintPilot AI" action={<Sparkles className="h-3.5 w-3.5 text-primary" />} className="border-primary/25 bg-primary/[0.05]">
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        Ask about this plate, or let the assistant measure it, repair it and change settings with tools.
      </p>
      <div className="mt-2.5 space-y-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-[11.5px] text-foreground transition-colors hover:border-primary/50"
        >
          Analyze this plate
          <ChevronRight className="h-3.5 w-3.5 text-primary" />
        </button>
        {store.aiLog.length > 0 && (
          <div className="px-1 text-[10.5px] text-muted-foreground">
            {store.aiLog.length} AI action{store.aiLog.length === 1 ? "" : "s"} logged this session
          </div>
        )}
      </div>
    </SectionCard>
  );
}