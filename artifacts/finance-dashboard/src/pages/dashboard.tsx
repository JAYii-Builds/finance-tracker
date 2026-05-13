import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser, useClerk } from "@clerk/react";
import {
  useGetTransactions,
  getGetTransactionsQueryKey,
  useCreateTransaction,
  useDeleteTransaction,
  useGetStats,
  getGetStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const CATEGORIES = [
  "Housing", "Food", "Transport", "Health",
  "Shopping", "Utilities", "Salary", "Freelance", "Other",
];

const CATEGORY_COLORS: Record<string, string> = {
  Housing: "#3b82f6",
  Food: "#f97316",
  Transport: "#8b5cf6",
  Health: "#ec4899",
  Shopping: "#14b8a6",
  Utilities: "#94a3b8",
  Salary: "#10b981",
  Freelance: "#f59e0b",
  Other: "#6366f1",
};

function timeSince(date: Date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Housing");
  const [submitting, setSubmitting] = useState(false);
  const [currency, setCurrency] = useState("₱");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  function fmt(n: number) {
    return currency + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  const { data: rawTransactions } = useGetTransactions({
    query: { queryKey: getGetTransactionsQueryKey(), refetchInterval: 5000 },
  });
  const transactions = Array.isArray(rawTransactions) ? rawTransactions : [];
  const { data: stats } = useGetStats({
    query: { queryKey: getGetStatsQueryKey(), refetchInterval: 5000 },
  });

  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();

  async function submit(type: "income" | "expense") {
    const amt = parseFloat(amount);
    if (!desc.trim() || isNaN(amt) || amt <= 0) return;
    setSubmitting(true);
    try {
      await createTx.mutateAsync({ data: { description: desc.trim(), amount: amt, category, type } });
      await qc.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
      await qc.invalidateQueries({ queryKey: getGetStatsQueryKey() });
      setDesc("");
      setAmount("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    await deleteTx.mutateAsync({ id });
    await qc.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
    await qc.invalidateQueries({ queryKey: getGetStatsQueryKey() });
  }

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === "expense") {
        map[t.category] = (map[t.category] ?? 0) + t.amount;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const barChartData = useMemo(() => {
    const incomeMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === "income") incomeMap[t.category] = (incomeMap[t.category] ?? 0) + t.amount;
      else expenseMap[t.category] = (expenseMap[t.category] ?? 0) + t.amount;
    }
    const cats = Array.from(new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)]));
    return {
      labels: cats,
      datasets: [
        { label: "Income", data: cats.map(c => incomeMap[c] ?? 0), backgroundColor: "#10b981", borderRadius: 4 },
        { label: "Expenses", data: cats.map(c => expenseMap[c] ?? 0), backgroundColor: "#f97316", borderRadius: 4 },
      ],
    };
  }, [transactions]);

  const donutData = useMemo(() => ({
    labels: expenseByCategory.map(([c]) => c),
    datasets: [{
      data: expenseByCategory.map(([, v]) => v),
      backgroundColor: expenseByCategory.map(([c]) => CATEGORY_COLORS[c] ?? "#6366f1"),
      borderWidth: 0,
      hoverOffset: 4,
    }],
  }), [expenseByCategory]);

  const totalExpenses = stats?.totalExpenses ?? 0;
  const recent8 = transactions.slice(0, 8);
  const netBalance = stats?.netBalance ?? 0;
  const savingsRate = stats?.savingsRate ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "#0f0f0f", color: "#e5e5e5", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #222", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Finance tracker</h1>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <span style={{ background: "#10b981", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "9999px" }}>Live</span>
          {user && (
            <span style={{ fontSize: "12px", color: "#666", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.primaryEmailAddress?.emailAddress ?? user.fullName}
            </span>
          )}
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            style={{ background: "#111", border: "1px solid #333", borderRadius: "6px", padding: "4px 8px", color: "#e5e5e5", fontSize: "12px", outline: "none" }}
          >
            <option value="₱">₱ PHP</option>
            <option value="$">$ USD</option>
            <option value="€">€ EUR</option>
            <option value="£">£ GBP</option>
            <option value="¥">¥ JPY</option>
            <option value="₩">₩ KRW</option>
            <option value="A$">A$ AUD</option>
            <option value="C$">C$ CAD</option>
          </select>
          <button
            onClick={() => signOut({ redirectUrl: `${window.location.origin}${basePath || "/"}` })}
            style={{ background: "none", border: "1px solid #333", borderRadius: "6px", color: "#888", cursor: "pointer", fontSize: "12px", padding: "5px 12px" }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 20px" }}>
        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          <KpiCard label="TOTAL INCOME" value={fmt(stats?.totalIncome ?? 0)} sub={`${transactions.filter(t => t.type === "income").length} entries`} valueColor="#10b981" />
          <KpiCard label="TOTAL EXPENSES" value={fmt(totalExpenses)} sub={`${transactions.filter(t => t.type === "expense").length} entries`} valueColor="#ef4444" />
          <KpiCard label="NET BALANCE" value={fmt(netBalance)} sub={netBalance >= 0 ? "surplus" : "deficit"} valueColor={netBalance >= 0 ? "#10b981" : "#ef4444"} />
          <KpiCard label="SAVINGS RATE" value={stats ? `${savingsRate.toFixed(1)}%` : "—"} sub="of income saved" valueColor={savingsRate >= 20 ? "#10b981" : savingsRate > 0 ? "#f97316" : "#ef4444"} />
        </div>

        {/* Add Transaction Form */}
        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#888", marginBottom: "12px" }}>+ ADD TRANSACTION</div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (e.g. Rent)" style={{ flex: "1 1 160px", minWidth: "140px", background: "#111", border: "1px solid #333", borderRadius: "6px", padding: "8px 12px", color: "#e5e5e5", fontSize: "14px", outline: "none" }} />
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder={`Amount (${currency})`} style={{ width: "130px", background: "#111", border: "1px solid #333", borderRadius: "6px", padding: "8px 12px", color: "#e5e5e5", fontSize: "14px", outline: "none" }} />
            <select value={category} onChange={e => setCategory(e.target.value)} style={{ background: "#111", border: "1px solid #333", borderRadius: "6px", padding: "8px 12px", color: "#e5e5e5", fontSize: "14px", outline: "none" }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => submit("income")} disabled={submitting} style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>↑ Income</button>
            <button onClick={() => submit("expense")} disabled={submitting} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>↓ Expense</button>
          </div>
        </div>

        {/* Charts Row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#888", marginBottom: "16px" }}>INCOME VS EXPENSES</div>
            {transactions.length === 0 ? <EmptyState /> : (
              <div style={{ height: "200px", position: "relative" }}>
                <Bar data={barChartData} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: {
                    legend: { position: "bottom", labels: { color: "#aaa", font: { size: 11 }, boxWidth: 12, padding: 12 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` }, backgroundColor: "#1a1a1a", borderColor: "#333", borderWidth: 1, titleColor: "#e5e5e5", bodyColor: "#aaa" },
                  },
                  scales: {
                    x: { grid: { color: "#1e1e1e" }, ticks: { color: "#666", font: { size: 11 } } },
                    y: { grid: { color: "#1e1e1e" }, ticks: { color: "#666", font: { size: 11 }, callback: v => `${currency}${Number(v).toLocaleString()}` } },
                  },
                }} />
              </div>
            )}
          </div>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#888", marginBottom: "16px" }}>EXPENSE BREAKDOWN</div>
            {expenseByCategory.length === 0 ? <EmptyState text="No expenses yet" /> : (
              <div style={{ height: "200px", position: "relative" }}>
                <Doughnut data={donutData} options={{
                  responsive: true, maintainAspectRatio: false, cutout: "65%",
                  plugins: {
                    legend: { position: "bottom", labels: { color: "#aaa", font: { size: 11 }, boxWidth: 12, padding: 10 } },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}` }, backgroundColor: "#1a1a1a", borderColor: "#333", borderWidth: 1, titleColor: "#e5e5e5", bodyColor: "#aaa" },
                  },
                }} />
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#888", marginBottom: "16px" }}>RECENT TRANSACTIONS</div>
            {recent8.length === 0 ? (
              <p style={{ color: "#555", fontSize: "14px", textAlign: "center", padding: "24px 0" }}>No transactions yet — add one above</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {recent8.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#111", borderRadius: "6px", border: "1px solid #222" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>{t.description}</span>
                      <span style={{ fontSize: "11px", color: "#555" }}>{t.category} · {timeSince(new Date(t.createdAt))}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: t.type === "income" ? "#10b981" : "#ef4444" }}>
                        {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                      </span>
                      {confirmDelete === t.id ? (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", color: "#888" }}>Delete?</span>
                          <button onClick={() => { handleDelete(t.id); setConfirmDelete(null); }} style={{ background: "#ef4444", border: "none", borderRadius: "4px", color: "#fff", cursor: "pointer", fontSize: "11px", padding: "2px 8px" }}>Yes</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ background: "#333", border: "none", borderRadius: "4px", color: "#ccc", cursor: "pointer", fontSize: "11px", padding: "2px 8px" }}>No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(t.id)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: "14px", lineHeight: 1, padding: "2px 4px" }} title="Delete">×</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "#888", marginBottom: "16px" }}>SPENDING BY CATEGORY</div>
            {expenseByCategory.length === 0 ? (
              <p style={{ color: "#555", fontSize: "14px", textAlign: "center", padding: "24px 0" }}>No expenses yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {expenseByCategory.map(([cat, val]) => {
                  const pct = totalExpenses > 0 ? (val / totalExpenses) * 100 : 0;
                  const color = CATEGORY_COLORS[cat] ?? "#6366f1";
                  return (
                    <div key={cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "12px", color: "#ccc" }}>{cat}</span>
                        <span style={{ fontSize: "12px", color: "#888" }}>{fmt(val)} <span style={{ color: "#555" }}>({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div style={{ height: "6px", background: "#222", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 0.3s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "10px", padding: "16px" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: "#666", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: valueColor, fontVariantNumeric: "tabular-nums", marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "#555" }}>{sub}</div>
    </div>
  );
}

function EmptyState({ text = "No data yet" }: { text?: string }) {
  return (
    <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: "13px" }}>
      {text}
    </div>
  );
}
