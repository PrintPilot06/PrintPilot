import { Receipt } from "lucide-react";
import { EmptyHint } from "@/components/controls";
import { cn } from "@/lib/utils";

export default function CreditHistory({ items, loading }) {
  return (
    <section className="panel animate-fade-up">
      <div className="panel-head">
        <h3 className="panel-title">Credit history</h3>
        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="px-4 pb-3.5">
        {loading ? (
          <div className="py-2 text-[12px] text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyHint>No credit activity yet.</EmptyHint>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-foreground">
                    {entry.description || entry.kind}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {new Date(entry.created_date).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </div>
                </div>
                <div
                  className={cn(
                    "font-mono text-[12px]",
                    entry.credits >= 0 ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {entry.credits >= 0 ? "+" : ""}
                  {entry.credits}
                </div>
                <div className="w-12 text-right font-mono text-[11px] text-muted-foreground">
                  {entry.balance_after ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}