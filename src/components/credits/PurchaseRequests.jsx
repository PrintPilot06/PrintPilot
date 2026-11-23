import { Check, X } from "lucide-react";
import { SectionCard, EmptyHint } from "@/components/controls";
import { cn } from "@/lib/utils";

const TONE = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

export default function PurchaseRequests({
  items = [],
  loading,
  canReview,
  busyId,
  onReview,
  title = "Purchase requests",
}) {
  return (
    <SectionCard title={title}>
      {loading ? (
        <div className="py-3 text-[11.5px] text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyHint>
          No purchases yet. Send a payment with your Cash App note and it shows up here.
        </EmptyHint>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((req) => (
            <li key={req.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[12px] font-medium text-foreground">
                    {Number(req.credits || 0).toLocaleString("en-US")} cr
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    ${Number(req.amount_usd || 0).toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.1em]",
                      TONE[req.status] || TONE.pending
                    )}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="truncate text-[10.5px] text-muted-foreground">
                  {canReview && req.email ? `${req.email} · ` : ""}
                  {req.reference}
                </div>
              </div>
              {canReview && req.status === "pending" && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => onReview?.(req.id, "approve")}
                    className="flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                  >
                    <Check className="h-3 w-3" />
                    Add credits
                  </button>
                  <button
                    type="button"
                    disabled={busyId === req.id}
                    onClick={() => onReview?.(req.id, "reject")}
                    className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}