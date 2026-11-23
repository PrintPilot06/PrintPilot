import { cn } from "@/lib/utils";

export function SectionCard({ title, action, children, className }) {
  return (
    <section className={cn("panel animate-fade-up", className)}>
      <div className="panel-head">
        <h3 className="panel-title">{title}</h3>
        {action}
      </div>
      <div className="px-4 pb-3.5">{children}</div>
    </section>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1, unit, disabled }) {
  return (
    <label className="field-row">
      <span className="field-label">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-[72px] rounded-lg border border-border/80 bg-background/70 px-2 py-1 text-right font-mono text-[12px] text-foreground outline-none transition-colors focus:border-primary/60 disabled:opacity-50"
        />
        {unit && <span className="w-8 text-[10.5px] text-muted-foreground">{unit}</span>}
      </span>
    </label>
  );
}

export function TextField({ label, value, onChange, placeholder, type = "text", hint, disabled }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{label}</span>}
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border/80 bg-background/70 px-2.5 py-1.5 font-mono text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/60 disabled:opacity-50"
      />
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, className }) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="mb-1 block text-[11.5px] font-medium text-muted-foreground">{label}</span>}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-border/80 bg-background/70 px-2.5 py-1.5 text-[12px] text-foreground outline-none transition-colors focus:border-primary/60"
      >
        {options.map((opt) => {
          const val = typeof opt === "string" ? opt : opt.value;
          const lab = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={val} value={val} className="bg-card">
              {lab}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function ToggleRow({ label, checked, onChange, hint }) {
  return (
    <div className="field-row">
      <span>
        <span className="field-label block">{label}</span>
        {hint && <span className="block text-[10.5px] text-muted-foreground/70">{hint}</span>}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[20px] w-[36px] shrink-0 rounded-full border transition-colors",
          checked ? "border-primary/60 bg-primary/70" : "border-border bg-secondary"
        )}
        aria-pressed={checked}
      >
        <span
          className={cn(
            "absolute top-1/2 h-[14px] w-[14px] -translate-y-1/2 rounded-full bg-foreground transition-all",
            checked ? "left-[19px]" : "left-[3px]"
          )}
        />
      </button>
    </div>
  );
}

export function SliderRow({ label, value, onChange, min, max, step = 1, unit, format }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="field-label">{label}</span>
        <span className="metric-value">
          {format ? format(value) : value}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-[hsl(var(--primary))]"
      />
    </div>
  );
}

export function StatBlock({ label, value, unit, tone = "default" }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
      <div className="metric-label">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-mono text-[15px] font-medium",
          tone === "accent" ? "text-primary" : "text-foreground"
        )}
      >
        {value}
        {unit && <span className="ml-1 text-[10.5px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

export function EmptyHint({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}