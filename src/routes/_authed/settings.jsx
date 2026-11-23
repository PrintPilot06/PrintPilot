import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Trash2, Plug, Check, KeyRound, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, TextField, SelectField, ToggleRow, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { AI_PROVIDERS } from "@/lib/defaults";
import { testAiConfig } from "@/lib/server-fns";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsPage,
});

const EMPTY_CONFIG = {
  label: "",
  provider: "openai",
  model: "gpt-4o-mini",
  base_url: "https://api.openai.com/v1",
  api_key: "",
  is_active: true,
  auto_execute: false,
};

function SettingsPage() {
  const store = usePrint();
  const navigate = useNavigate();
  const testFn = useServerFn(testAiConfig);
  const [configs, setConfigs] = useState([]);
  const [draft, setDraft] = useState(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await base44.entities.AIConfig.list("-created_date", 50);
      const arr = Array.isArray(list) ? list : list?.items || [];
      setConfigs(arr);
      const active = arr.find((c) => c.is_active) || null;
      if (active) store.setAiConfig(active);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const provider = AI_PROVIDERS.find((p) => p.id === (draft?.provider || "openai"));

  const save = async () => {
    if (!draft?.model?.trim()) {
      toast.error("Choose a model.");
      return;
    }
    try {
      const payload = { ...draft };
      if (!payload.api_key) delete payload.api_key;
      if (!payload.label) payload.label = provider?.label || payload.provider;
      let record;
      if (payload.id) {
        record = await base44.entities.AIConfig.update(payload.id, payload);
      } else {
        record = await base44.entities.AIConfig.create(payload);
      }
      if (payload.is_active) {
        const others = configs.filter((c) => c.id !== record.id && c.is_active);
        for (const other of others) {
          await base44.entities.AIConfig.update(other.id, { is_active: false });
        }
      }
      toast.success("AI configuration saved");
      setDraft(null);
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const activate = async (config) => {
    try {
      for (const other of configs) {
        if (other.id !== config.id && other.is_active) {
          await base44.entities.AIConfig.update(other.id, { is_active: false });
        }
      }
      await base44.entities.AIConfig.update(config.id, { is_active: true });
      toast.success(`${config.label || config.provider} is now active`);
      await load();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async (config) => {
    await base44.entities.AIConfig.delete(config.id);
    if (store.aiConfig?.id === config.id) store.setAiConfig(null);
    await load();
  };

  const test = async () => {
    if (!draft?.id) {
      toast.error("Save the configuration before testing it.");
      return;
    }
    setTesting(true);
    try {
      const result = await testFn({ data: { configId: draft.id } });
      toast.success(`Connection OK — model replied: ${result.reply || "ready"}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setTesting(false);
    }
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
      title="Settings"
      subtitle="AI providers & application"
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard title="Editor mode">
            <div className="flex rounded-xl border border-border/70 bg-background/40 p-0.5">
              {["beginner", "advanced"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => store.setMode(option)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-[11.5px] capitalize transition-colors",
                    store.mode === option ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/80">
              Beginner mode shows the settings that matter most. Advanced reveals speeds, temperatures, cooling
              and support controls.
            </p>
          </SectionCard>

          <SectionCard title="About" action={<Info className="h-3.5 w-3.5 text-muted-foreground" />}>
            <div className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <p>PrintPilot — AI 3D printing slicer.</p>
              <p>
                Slicing engine, mesh analysis and G-code generation are implemented in this application. 3D
                rendering uses three.js (MIT). Built on TanStack Start.
              </p>
              <p>
                Your models are stored privately; only your account can open them. API keys are kept with your
                account record and never written into projects or logs.
              </p>
              <p className="text-muted-foreground/70">
                Slicing works entirely offline. Only the AI assistant and printer connections use the network.
              </p>
            </div>
          </SectionCard>
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h2 className="font-heading text-[15px] font-semibold text-foreground">AI providers</h2>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Bring your own key. PrintPilot AI speaks to OpenAI, Anthropic, Google Gemini, any OpenAI-compatible
              endpoint, or a local server such as Ollama or LM Studio. Slicing never depends on it.
            </p>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_360px]">
              <div className="space-y-1.5">
                {loading ? (
                  <div className="py-6 text-center text-[12px] text-muted-foreground">Loading…</div>
                ) : configs.length === 0 ? (
                  <EmptyHint>No provider configured yet. Add one to enable PrintPilot AI.</EmptyHint>
                ) : (
                  configs.map((config) => (
                    <div
                      key={config.id}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2",
                        config.is_active ? "border-primary/50 bg-primary/[0.06]" : "border-border/60 bg-background/40"
                      )}
                    >
                      <button type="button" onClick={() => setDraft({ ...config, api_key: "" })} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-medium text-foreground">
                            {config.label || config.provider}
                          </span>
                          {config.is_active && <Check className="h-3 w-3 text-primary" />}
                        </div>
                        <div className="font-mono text-[10.5px] text-muted-foreground">
                          {config.provider} · {config.model}
                          {config.api_key ? " · key saved" : " · no key"}
                        </div>
                      </button>
                      {!config.is_active && (
                        <button
                          type="button"
                          onClick={() => activate(config)}
                          className="rounded-md border border-border/70 px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                        >
                          Use
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(config)}
                        className="rounded-md border border-border/70 p-1 text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => setDraft({ ...EMPTY_CONFIG })}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50"
                >
                  <Plus className="h-3.5 w-3.5 text-primary" />
                  Add provider
                </button>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/40 p-3.5">
                {!draft ? (
                  <EmptyHint>Select a provider to edit, or add a new one.</EmptyHint>
                ) : (
                  <div className="space-y-2">
                    <div className="font-heading text-[13px] font-semibold text-foreground">
                      {draft.id ? "Edit provider" : "New provider"}
                    </div>
                    <SelectField
                      label="Provider"
                      value={draft.provider}
                      onChange={(value) => {
                        const meta = AI_PROVIDERS.find((p) => p.id === value);
                        setDraft({
                          ...draft,
                          provider: value,
                          base_url: meta?.baseUrl || "",
                          model: meta?.models?.[0] || draft.model,
                        });
                      }}
                      options={AI_PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
                    />
                    <TextField
                      label="Label"
                      value={draft.label || ""}
                      placeholder={provider?.label}
                      onChange={(v) => setDraft({ ...draft, label: v })}
                    />
                    <TextField
                      label="Model"
                      value={draft.model || ""}
                      placeholder={provider?.models?.[0] || "model id"}
                      hint={provider?.models?.length ? `Suggested: ${provider.models.join(", ")}` : undefined}
                      onChange={(v) => setDraft({ ...draft, model: v })}
                    />
                    <TextField
                      label="API base URL"
                      value={draft.base_url || ""}
                      placeholder={provider?.baseUrl}
                      hint={
                        draft.provider === "local"
                          ? "For Ollama use http://localhost:11434/v1 — it must be reachable from the app."
                          : undefined
                      }
                      onChange={(v) => setDraft({ ...draft, base_url: v })}
                    />
                    <TextField
                      label="API key"
                      type="password"
                      value={draft.api_key || ""}
                      placeholder={draft.id ? "Saved — leave blank to keep" : provider?.keyHint}
                      onChange={(v) => setDraft({ ...draft, api_key: v })}
                    />
                    <ToggleRow
                      label="Run routine changes automatically"
                      hint="Destructive edits still ask for approval."
                      checked={!!draft.auto_execute}
                      onChange={(v) => setDraft({ ...draft, auto_execute: v })}
                    />
                    <div className="flex gap-2 pt-1">
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
                        onClick={test}
                        disabled={testing}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/70 px-3 py-1.5 text-[12px] text-foreground transition-colors hover:border-primary/50 disabled:opacity-50"
                      >
                        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                        Test
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}