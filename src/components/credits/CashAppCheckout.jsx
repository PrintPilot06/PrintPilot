import { useState } from "react";
import { ExternalLink, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { requestCredits } from "@/lib/server-fns";
import { CREDIT_PACKS } from "@/lib/credits";
import { SectionCard, NumberField, TextField } from "@/components/controls";
import { cn } from "@/lib/utils";

/** Cash App pay links accept a trailing amount: cash.app/$tag/12.50 */
export function cashAppUrl(link, amount) {
  const base = String(link || "").trim();
  if (!base) return "";
  if (/^https?:\/\/cash\.app\/\$[A-Za-z0-9]+\/?$/i.test(base)) {
    return `${base.replace(/\/+$/, "")}/${Number(amount || 0).toFixed(2)}`;
  }
  return base;
}

export default function CashAppCheckout({ settings, onSubmitted }) {
  const sendRequest = useServerFn(requestCredits);
  const [credits, setCredits] = useState(100);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const rate = Number(settings?.price_per_credit) || 0;
  const minCredits = Number(settings?.min_credits) || 1;
  const count = Number(credits) || 0;
  const amount = Math.round(count * rate * 100) / 100;
  const payLink = cashAppUrl(settings?.cashapp_link, amount);
  const valid = count >= minCredits && amount > 0;

  async function handleSubmit() {
    setBusy(true);
    setError("");
    try {
      await sendRequest({ data: { credits: Math.round(count), reference: reference.trim() } });
      setSent(true);
      setReference("");
      onSubmitted?.();
    } catch (e) {
      setError(e?.message || "Could not submit the payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Buy credits" action={<span className="chip">Cash App</span>}>
      <div className="grid gap-2 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            onClick={() => {
              setCredits(pack.credits);
              setSent(false);
            }}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors",
              count === pack.credits
                ? "border-primary/60 bg-primary/10"
                : "border-border/70 bg-background/40 hover:border-border"
            )}
          >
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {pack.name}
            </div>
            <div className="mt-1 font-mono text-[15px] font-semibold text-foreground">
              {pack.credits.toLocaleString("en-US")} cr
            </div>
            <div className="text-[11px] text-muted-foreground">
              ${(pack.credits * rate).toFixed(2)}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-2">
        <NumberField
          label="Or enter your own amount"
          value={credits}
          min={minCredits}
          max={100000}
          step={1}
          unit="cr"
          onChange={(v) => {
            setCredits(v);
            setSent(false);
          }}
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between rounded-xl border border-border/70 bg-background/40 px-3 py-2">
        <span className="text-[11.5px] text-muted-foreground">
          {count.toLocaleString("en-US")} credits
        </span>
        <span className="font-mono text-[20px] font-semibold text-foreground">
          ${amount.toFixed(2)}
        </span>
      </div>

      {payLink ? (
        <a
          href={payLink}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-[12px] font-semibold transition-colors",
            valid
              ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
              : "pointer-events-none border-border/70 text-muted-foreground opacity-50"
          )}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Pay ${amount.toFixed(2)} on Cash App
        </a>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-[11.5px] text-muted-foreground">
          Cash App payments are not set up yet — the app owner adds their Cash App link here.
        </p>
      )}

      <div className="mt-3 border-t border-border/60 pt-2.5">
        <TextField
          label="After you've sent it"
          value={reference}
          onChange={(v) => {
            setReference(v);
            setSent(false);
          }}
          placeholder="Your Cash App note or confirmation code"
          hint="Credits are added as soon as the payment is confirmed — usually the same day."
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !valid || reference.trim().length < 2}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-secondary/60 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          {busy ? "Sending…" : "I've paid — add my credits"}
        </button>
        {sent && (
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-400">
            Payment submitted. Your credits appear here once it's confirmed.
          </p>
        )}
        {error && <p className="mt-2 text-[11px] leading-relaxed text-destructive">{error}</p>}
      </div>
    </SectionCard>
  );
}