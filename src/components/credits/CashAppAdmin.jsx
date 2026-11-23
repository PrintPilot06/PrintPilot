import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { savePaymentSettings } from "@/lib/server-fns";
import { SectionCard, NumberField, TextField } from "@/components/controls";

export default function CashAppAdmin({ settings, onSaved }) {
  const save = useServerFn(savePaymentSettings);
  const [link, setLink] = useState(settings?.cashapp_link || "");
  const [rate, setRate] = useState(settings?.price_per_credit ?? 0.05);
  const [minCredits, setMinCredits] = useState(settings?.min_credits ?? 50);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!settings) return;
    setLink(settings.cashapp_link || "");
    setRate(settings.price_per_credit ?? 0.05);
    setMinCredits(settings.min_credits ?? 50);
  }, [settings]);

  async function handleSave() {
    setBusy(true);
    setMessage("");
    try {
      await save({
        data: {
          cashapp_link: link.trim(),
          price_per_credit: Number(rate),
          min_credits: Math.round(Number(minCredits)),
        },
      });
      setMessage("Saved.");
      onSaved?.();
    } catch (e) {
      setMessage(e?.message || "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title="Your Cash App settings" action={<span className="chip">Owner only</span>}>
      <div className="space-y-2">
        <TextField
          label="Cash App link"
          value={link}
          onChange={setLink}
          placeholder="https://cash.app/$yourcashtag"
          hint="A cashtag link gets the amount filled in automatically when a buyer taps Pay."
        />
        <NumberField
          label="Price per credit"
          value={rate}
          min={0.001}
          max={100}
          step={0.001}
          unit="$"
          onChange={setRate}
        />
        <NumberField
          label="Smallest purchase"
          value={minCredits}
          min={1}
          max={100000}
          step={1}
          unit="cr"
          onChange={setMinCredits}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={busy || link.trim().length < 4 || !(Number(rate) > 0)}
        className="mt-2 w-full rounded-lg border border-primary/50 bg-primary/15 py-2 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save payment settings"}
      </button>
      {message && <p className="mt-1.5 text-[11px] text-muted-foreground">{message}</p>}
    </SectionCard>
  );
}