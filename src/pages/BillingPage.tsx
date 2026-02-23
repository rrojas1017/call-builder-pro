import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgContext } from "@/hooks/useOrgContext";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, DollarSign, Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import UsageSummary from "@/components/billing/UsageSummary";

interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

const TOPUP_AMOUNTS = [25, 50, 100, 250];

export default function BillingPage() {
  const { user } = useAuth();
  const { activeOrgId } = useOrgContext();
  const { toast } = useToast();
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const loadBilling = async () => {
    if (!user || !activeOrgId) return;

    const { data: org } = await supabase
      .from("organizations")
      .select("credits_balance")
      .eq("id", activeOrgId)
      .single();

    setBalance(org?.credits_balance ?? 0);

    const { data: txns } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("org_id", activeOrgId)
      .order("created_at", { ascending: false })
      .limit(50);

    setTransactions((txns || []) as CreditTransaction[]);
    setLoading(false);
  };

  useEffect(() => {
    loadBilling();
  }, [user, activeOrgId]);

  // Auto-refresh after returning from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("topup") === "success") {
      toast({ title: "Payment received!", description: "Your credits will appear shortly." });
      // Poll for balance update
      const interval = setInterval(loadBilling, 3000);
      setTimeout(() => clearInterval(interval), 30000);
      // Clean URL
      window.history.replaceState({}, "", "/billing");
    }
  }, []);

  const handleTopup = async (amount: number) => {
    setTopupLoading(amount);
    try {
      const { data, error } = await supabase.functions.invoke("create-topup-session", {
        body: { amount },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTopupLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Billing & Credits
        </h1>
        <p className="text-muted-foreground mt-1">Manage your organization's credit balance.</p>
      </div>

      {/* Balance Card */}
      <div className="surface-elevated rounded-xl p-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wide">Current Balance</p>
            <p className="text-4xl font-bold text-foreground mt-1 flex items-center gap-1">
              <DollarSign className="h-8 w-8 text-primary" />
              {balance.toFixed(2)}
            </p>
          </div>
          <Button onClick={() => loadBilling()} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Top-Up Options */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Plus className="h-5 w-5" /> Add Credits
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TOPUP_AMOUNTS.map((amount) => (
            <Button
              key={amount}
              variant="outline"
              className="h-16 text-lg font-semibold"
              onClick={() => handleTopup(amount)}
              disabled={topupLoading !== null}
            >
              {topupLoading === amount ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                `$${amount}`
              )}
            </Button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="5"
            placeholder="Custom amount"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            className="flex h-10 w-40 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            variant="secondary"
            onClick={() => {
              const amt = parseFloat(customAmount);
              if (amt >= 5) handleTopup(amt);
              else toast({ title: "Minimum top-up is $5", variant: "destructive" });
            }}
            disabled={topupLoading !== null || !customAmount}
          >
            Add Custom Amount
          </Button>
        </div>
      </div>

      {/* Usage Summary */}
      <UsageSummary />

      {/* Transaction History */}
      {transactions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Transaction History</h2>
          <div className="surface-elevated rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.type === "topup" ? "default" : "secondary"}>
                        {tx.type === "topup" && <ArrowUpRight className="h-3 w-3 mr-1" />}
                        {tx.type === "call_charge" && <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{tx.description || "—"}</TableCell>
                    <TableCell className={`text-right font-mono font-medium ${tx.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {tx.amount >= 0 ? "+" : ""}${Math.abs(tx.amount).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
