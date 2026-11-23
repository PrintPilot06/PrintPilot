import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Coins, Sparkles } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import CashAppCheckout from "@/components/credits/CashAppCheckout";
import CashAppAdmin from "@/components/credits/CashAppAdmin";
import PurchaseRequests from "@/components/credits/PurchaseRequests";
import CreditHistory from "@/components/credits/CreditHistory";
import { SectionCard } from "@/components/controls";
import {
  getCreditAccount,
  getPaymentSettings,
  approveCreditRequest,
  rejectCreditRequest,
} from "@/lib/server-fns";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { CREDITS_PER_STEP } from "@/lib/credits";

export const Route = createFileRoute("/_authed/credits")({
  component: CreditsPage,
});

function CreditsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const fetchAccount = useServerFn(getCreditAccount);
  const fetchSettings = useServerFn(getPaymentSettings);
  const approve = useServerFn(approveCreditRequest);
  const reject = useServerFn(rejectCreditRequest);

  const [account, setAccount] = useState(null);
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [acc, pay, reqs] = await Promise.all([
          fetchAccount(),
          fetchSettings(),
          base44.entities.CreditRequest.filter({}, { sort: "-created_date", limit: 50 }),
        ]);
        if (cancelled) return;
        setAccount(acc);
        setSettings(pay);
        setRequests(Array.isArray(reqs) ? reqs : reqs?.items || []);
        const res = await base44.entities.CreditTransaction.filter(
          {},
          { sort: "-created_date", limit: 50 }
        );
        const items = Array.isArray(res) ? res : res?.items || [];
        if (!cancelled) setHistory(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchAccount, fetchSettings, refreshKey]);

  async function review(id, action) {
    setBusyId(id);
    try {
      if (action === "approve") await approve({ data: { id } });
      else await reject({ data: { id } });
      reload();
    } catch (e) {
      toast.error(e?.message || "Could not update that request.");
    } finally {
      setBusyId("");
    }
  }

  const mine = requests.filter((r) => r.user_id === user?.id);

  return (
    <AppShell
      title="AI Credits"
      subtitle={account ? `${account.balance} credits available` : "Loading balance…"}
      actions={{ onImport: () => navigate({ to: "/" }), onSlice: () => navigate({ to: "/" }) }}
      status={{ plateLabel: "Credit wallet" }}
      right={
        <div className="space-y-3">
          <SectionCard title="How credits work" action={<Sparkles className="h-3.5 w-3.5 text-primary" />}>
            <ul className="space-y-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>· {CREDITS_PER_STEP} credit per AI step.</li>
              <li>· A question that inspects the model and applies a change is usually 2–3 steps.</li>
              <li>· Slicing, mesh tools and printing never use credits.</li>
              <li>· Your own API key in Settings is free to use and uses no credits.</li>
            </ul>
          </SectionCard>
        </div>
      }
    >
      <div className="h-full overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-3xl space-y-3">
          <section className="panel animate-fade-up p-5">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <h2 className="panel-title">Balance</h2>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[34px] font-semibold leading-none text-foreground">
                {loading ? "…" : account?.balance ?? 0}
              </span>
              <span className="text-[12px] text-muted-foreground">credits</span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
              PrintPilot AI runs on these credits — no API key needed. New accounts start with free
              credits to try it.
            </p>
          </section>

          {isAdmin && <CashAppAdmin settings={settings} onSaved={reload} />}
          <CashAppCheckout settings={settings} onSubmitted={reload} />
          <PurchaseRequests
            items={isAdmin ? requests : mine}
            loading={loading}
            canReview={isAdmin}
            busyId={busyId}
            onReview={review}
            title={isAdmin ? "Credit requests" : "Your purchases"}
          />
          <CreditHistory items={history} loading={loading} />
        </div>
      </div>
    </AppShell>
  );
}