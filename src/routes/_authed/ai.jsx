import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Send,
  Loader2,
  ShieldAlert,
  Check,
  X,
  Settings2,
  Trash2,
  Activity,
  Wrench,
  Coins,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import SliceStatusBar from "@/components/panels/SliceStatusBar";
import { SectionCard, EmptyHint } from "@/components/controls";
import { usePrint } from "@/lib/printStore";
import { aiChat, aiChatWithCredits, getCreditAccount } from "@/lib/server-fns";
import { CREDITS_PER_STEP } from "@/lib/credits";
import { MUTATING_TOOLS, TOOL_SCHEMAS, describeToolCall, runTool } from "@/lib/ai/tools";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/ai")({
  component: AiPage,
});

let idc = 0;
const uid = () => `m-${Date.now()}-${(idc += 1)}`;

const QUICK_PROMPTS = [
  "Analyze this model and tell me if it will print reliably.",
  "Find errors in this model and repair them.",
  "Make this model easier to print without supports.",
  "Reduce the printing time without ruining quality.",
  "Will this fit and print on my printer?",
  "Why might this print fail?",
];

function AiPage() {
  const store = usePrint();
  const navigate = useNavigate();
  const chat = useServerFn(aiChat);
  const creditChat = useServerFn(aiChatWithCredits);
  const fetchAccount = useServerFn(getCreditAccount);
  const [credits, setCredits] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await base44.entities.AIConfig.list("-created_date", 50);
        const arr = Array.isArray(list) ? list : list?.items || [];
        const active = arr.find((c) => c.is_active) || arr[0] || null;
        if (!cancelled) store.setAiConfig(active);
      } catch {
        /* no configuration yet */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAccount()
      .then((acc) => {
        if (!cancelled) setCredits(acc?.balance ?? 0);
      })
      .catch(() => {
        /* balance loads again when the assistant is used */
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAccount]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const buildContext = () =>
    JSON.stringify({
      project: store.projectName,
      printer: {
        name: store.printer.name,
        build_volume_mm: [store.printer.build_x, store.printer.build_y, store.printer.build_z],
        nozzle_mm: store.printer.nozzle_diameter,
        firmware: store.printer.firmware,
        max_speed: store.printer.max_speed,
      },
      filament: {
        name: store.filament.name,
        material: store.filament.material,
        density: store.filament.density,
        nozzle_temp: store.settings.nozzleTemp,
        bed_temp: store.settings.bedTemp,
      },
      settings: store.settings,
      models: store.models.map((m) => ({
        name: m.name,
        size_mm: m.analysis.bounds.size.map((v) => Number(v.toFixed(2))),
        triangles: m.analysis.triCount,
        watertight: m.analysis.isWatertight,
        shells: m.analysis.components,
        overhang_percent_45: Number(m.analysis.overhangPercent.toFixed(1)),
        position_mm: m.transform.position.map((v) => Number(v.toFixed(1))),
        rotation_deg: m.transform.rotation.map((v) => Number(v.toFixed(1))),
        scale: m.transform.scale.map((v) => Number(v.toFixed(3))),
      })),
      last_slice: store.result
        ? {
            layers: store.result.stats.layerCount,
            time_s: store.result.stats.timeSeconds,
            filament_g: store.result.stats.filamentGrams,
            warnings: store.result.warnings,
          }
        : null,
      detected_issues: store.diagnose().map((issue) => `${issue.title} (${issue.modelName})`),
    });

  const execCall = async (call) => {
    try {
      const result = await runTool(call.name, call.args, store);
      return JSON.stringify(result).slice(0, 4000);
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  };

  const continueLoop = async (history) => {
    let working = [...history];
    for (let step = 0; step < 6; step += 1) {
      const payload = {
        messages: working.map((m) => ({
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls,
          toolCallId: m.toolCallId,
          name: m.name,
        })),
        tools: TOOL_SCHEMAS,
        system: `PROJECT STATE (live, read from the application):\n${buildContext()}`,
      };
      const res = store.aiConfig
        ? await chat({ data: { configId: store.aiConfig.id, ...payload } })
        : await creditChat({ data: payload });
      if (typeof res.creditsLeft === "number") setCredits(res.creditsLeft);
      const assistant = { id: uid(), role: "assistant", content: res.content || "", toolCalls: res.toolCalls || [] };
      working = [...working, assistant];
      setMessages(working);
      if (!assistant.toolCalls.length) return;
      const needsApproval = assistant.toolCalls.filter((call) => MUTATING_TOOLS.has(call.name));
      if (needsApproval.length && !store.aiConfig?.auto_execute) {
        setPending({ toolCalls: assistant.toolCalls, history: working });
        return;
      }
      for (const call of assistant.toolCalls) {
        const content = await execCall(call);
        working = [...working, { id: uid(), role: "tool", toolCallId: call.id, name: call.name, content }];
      }
      setMessages(working);
    }
  };

  const send = async (text) => {
    const value = (text ?? input).trim();
    if (!value || busy) return;
    if (!store.aiConfig && credits !== null && credits < 1) {
      setError("You are out of AI credits. Add more on the AI Credits page.");
      return;
    }
    setError(null);
    setInput("");
    setBusy(true);
    const history = [...messages, { id: uid(), role: "user", content: value }];
    setMessages(history);
    try {
      await continueLoop(history);
    } catch (err) {
      setError(err.message || "The AI request failed.");
    } finally {
      setBusy(false);
    }
  };

  const resolvePending = async (approve) => {
    if (!pending) return;
    const { toolCalls, history } = pending;
    setPending(null);
    setBusy(true);
    let working = [...history];
    for (const call of toolCalls) {
      const content = approve
        ? await execCall(call)
        : JSON.stringify({ rejected: "The user declined this action. Do not repeat it unless asked." });
      working = [...working, { id: uid(), role: "tool", toolCallId: call.id, name: call.name, content }];
    }
    setMessages(working);
    try {
      await continueLoop(working);
    } catch (err) {
      setError(err.message || "The AI request failed.");
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
    onSend: () => navigate({ to: "/device" }),
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    canSend: !!store.result,
  };

  return (
    <AppShell
      title="PrintPilot AI"
      subtitle={
        store.aiConfig
          ? `${store.aiConfig.provider} · ${store.aiConfig.model}`
          : `PrintPilot credits · ${credits === null ? "…" : `${credits} left`}`
      }
      actions={actions}
      status={{ printer: store.printer.name, plateLabel: `Plate 1 · ${store.models.length} object(s)` }}
      right={
        <div className="space-y-3">
          <SectionCard
            title="Provider"
            action={
              <button
                type="button"
                onClick={() => navigate({ to: "/settings" })}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            }
          >
            {store.aiConfig ? (
              <div className="space-y-1">
                <div className="text-[12.5px] font-medium text-foreground">{store.aiConfig.label || store.aiConfig.provider}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{store.aiConfig.model}</div>
                <div className="mt-1 text-[10.5px] text-muted-foreground/80">
                  {store.aiConfig.auto_execute ? "Routine changes run automatically" : "Every change needs your approval"}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[12.5px] font-medium text-foreground">PrintPilot credits</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {credits === null ? "Loading balance…" : `${credits} credits left`}
                </div>
                <div className="mt-1 text-[10.5px] text-muted-foreground/80">
                  {CREDITS_PER_STEP} credit per AI step. No API key needed.
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/credits" })}
                  className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
                >
                  <Coins className="h-3 w-3" />
                  Get more credits
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="AI activity log" action={<Activity className="h-3.5 w-3.5 text-muted-foreground" />}>
            {store.aiLog.length === 0 ? (
              <EmptyHint>No tool calls yet.</EmptyHint>
            ) : (
              <ul className="max-h-[280px] space-y-1.5 overflow-y-auto">
                {store.aiLog
                  .slice()
                  .reverse()
                  .map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-border/60 bg-background/40 px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 text-primary" />
                        <span className="text-[11.5px] font-medium text-foreground">{entry.tool}</span>
                        <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">
                          {new Date(entry.at).toLocaleTimeString("en-US", { hour12: false })}
                        </span>
                      </div>
                      <div className={cn("mt-0.5 truncate font-mono text-[10px]", entry.ok ? "text-muted-foreground" : "text-destructive")}>
                        {entry.summary}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </SectionCard>
        </div>
      }
      bottom={<SliceStatusBar store={store} />}
    >
      <div className="flex h-full flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-border/70 bg-card/50 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="font-heading text-[15px] font-semibold text-foreground">PrintPilot AI</h2>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  I can read this project's real geometry, printer profile and settings, then act on them with
                  slicer and mesh tools. Ask for a change and I will show exactly what I intend to do first.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="rounded-full border border-border/70 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message) => {
              if (message.role === "tool") return null;
              const isUser = message.role === "user";
              return (
                <div key={message.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                      isUser
                        ? "bg-primary/15 text-foreground"
                        : "border border-border/60 bg-card/70 text-foreground"
                    )}
                  >
                    {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
                    {message.toolCalls?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {message.toolCalls.map((call) => {
                          const { label, detail } = describeToolCall(call.name, call.args);
                          return (
                            <li
                              key={call.id}
                              className="flex items-start gap-1.5 rounded-lg bg-background/50 px-2 py-1 font-mono text-[10.5px] text-muted-foreground"
                            >
                              <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                              <span className="min-w-0">
                                <span className="text-foreground">{label}</span>
                                {detail && <span className="ml-1 break-all opacity-70">{detail}</span>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}

            {pending && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-3.5">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-300">
                  <ShieldAlert className="h-4 w-4" />
                  PrintPilot AI wants to change your project
                </div>
                <ul className="mt-2 space-y-1">
                  {pending.toolCalls.map((call) => {
                    const { label, detail } = describeToolCall(call.name, call.args);
                    return (
                      <li key={call.id} className="rounded-lg bg-background/50 px-2 py-1.5 text-[11.5px]">
                        <span className="font-medium text-foreground">{label}</span>
                        {detail && <span className="ml-1 break-all font-mono text-[10.5px] text-muted-foreground">{detail}</span>}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[10.5px] text-muted-foreground">
                  Approving applies the change to the live project. You can undo it from the toolbar.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => resolvePending(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Approve &amp; run
                  </button>
                  <button
                    type="button"
                    onClick={() => resolvePending(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                Working…
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-background/60 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={store.aiConfig ? "Ask about this model, or request a change…" : "Ask about this model — uses AI credits"}
              className="max-h-[120px] min-h-[38px] flex-1 resize-none rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/60"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={busy || !input.trim()}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setPending(null);
                  setError(null);
                }}
                title="New conversation"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}