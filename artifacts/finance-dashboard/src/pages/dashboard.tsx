import { useState, useMemo, useEffect } from "react";
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
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, ArcElement, Tooltip, Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const CATEGORIES = ["Housing","Food","Transport","Health","Shopping","Utilities","Salary","Freelance","Other"];
const CATEGORY_COLORS: Record<string,string> = {
  Housing:"#3b82f6",Food:"#f97316",Transport:"#8b5cf6",Health:"#ec4899",
  Shopping:"#14b8a6",Utilities:"#94a3b8",Salary:"#10b981",Freelance:"#f59e0b",Other:"#6366f1",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const DEFAULT_BUDGETS: Record<string,number> = {
  Housing:0,Food:0,Transport:0,Health:0,Shopping:0,Utilities:0,Salary:0,Freelance:0,Other:0,
};

type Transaction = {
  id: number;
  description: string;
  amount: number;
  category: string;
  type: "income"|"expense";
  createdAt: string;
  notes?: string;
  recurring?: boolean;
};

function timeSince(date: Date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/,"");

  // Theme
  const [dark, setDark] = useState(true);
  const bg = dark ? "#0f0f0f" : "#f5f5f5";
  const surface = dark ? "#1a1a1a" : "#ffffff";
  const border = dark ? "#2a2a2a" : "#e5e5e5";
  const text = dark ? "#e5e5e5" : "#111111";
  const muted = dark ? "#888" : "#666";
  const inputStyle = { background: dark?"#111":"#f9f9f9", border:`1px solid ${dark?"#333":"#ddd"}`, borderRadius:"6px", padding:"8px 12px", color:text, fontSize:"14px", outline:"none" } as const;

  // Form state
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Housing");
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);

  // UI state
  const [currency, setCurrency] = useState("₱");
  const [confirmDelete, setConfirmDelete] = useState<number|null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth()));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [showBudgets, setShowBudgets] = useState(false);
  const [budgets, setBudgets] = useState<Record<string,number>>(() => {
    try { return JSON.parse(localStorage.getItem("budgets") || "{}") || DEFAULT_BUDGETS; }
    catch { return DEFAULT_BUDGETS; }
  });

  // Edit state
  const [editId, setEditId] = useState<number|null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Housing");
  const [editType, setEditType] = useState<"income"|"expense">("expense");
  const [editNotes, setEditNotes] = useState("");
  const [editRecurring, setEditRecurring] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  function fmt(n: number) {
    return currency + new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  }

  const { data: rawTransactions } = useGetTransactions({
    query: { queryKey: getGetTransactionsQueryKey(), refetchInterval: 5000 },
  });
  const transactions = Array.isArray(rawTransactions) ? rawTransactions as Transaction[] : [];
  const { data: stats } = useGetStats({
    query: { queryKey: getGetStatsQueryKey(), refetchInterval: 5000 },
  });

  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map(t => String(new Date(t.createdAt).getFullYear())));
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const date = new Date(t.createdAt);
      const matchMonth = filterMonth === "All" || date.getMonth() === parseInt(filterMonth);
      const matchYear = filterYear === "All" || date.getFullYear() === parseInt(filterYear);
      const matchCat = filterCat === "All" || t.category === filterCat;
      const matchSearch = search === "" ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase()) ||
        (t.notes||"").toLowerCase().includes(search.toLowerCase());
      return matchMonth && matchYear && matchCat && matchSearch;
    });
  }, [transactions, filterMonth, filterYear, filterCat, search]);

  const filteredIncome = useMemo(() => filtered.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[filtered]);
  const filteredExpenses = useMemo(() => filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[filtered]);
  const filteredNet = filteredIncome - filteredExpenses;
  const filteredRate = filteredIncome > 0 ? (filteredNet/filteredIncome)*100 : 0;

  const expenseByCategory = useMemo(() => {
    const map: Record<string,number> = {};
    for (const t of filtered) {
      if (t.type==="expense") map[t.category]=(map[t.category]??0)+t.amount;
    }
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[filtered]);

  const barChartData = useMemo(() => {
    const iMap: Record<string,number>={}, eMap: Record<string,number>={};
    for (const t of filtered) {
      if (t.type==="income") iMap[t.category]=(iMap[t.category]??0)+t.amount;
      else eMap[t.category]=(eMap[t.category]??0)+t.amount;
    }
    const cats = Array.from(new Set([...Object.keys(iMap),...Object.keys(eMap)]));
    return {
      labels: cats,
      datasets: [
        {label:"Income",data:cats.map(c=>iMap[c]??0),backgroundColor:"#10b981",borderRadius:4},
        {label:"Expenses",data:cats.map(c=>eMap[c]??0),backgroundColor:"#f97316",borderRadius:4},
      ],
    };
  },[filtered]);

  const donutData = useMemo(()=>({
    labels: expenseByCategory.map(([c])=>c),
    datasets:[{
      data:expenseByCategory.map(([,v])=>v),
      backgroundColor:expenseByCategory.map(([c])=>CATEGORY_COLORS[c]??"#6366f1"),
      borderWidth:0,hoverOffset:4,
    }],
  }),[expenseByCategory]);

  async function submit(type:"income"|"expense") {
    const amt = parseFloat(amount);
    if (!desc.trim()||isNaN(amt)||amt<=0) return;
    setSubmitting(true);
    try {
      await createTx.mutateAsync({data:{description:desc.trim(),amount:amt,category,type,notes,recurring}});
      await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
      await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
      setDesc(""); setAmount(""); setNotes(""); setRecurring(false);
    } finally { setSubmitting(false); }
  }

  async function handleDelete(id:number) {
    await deleteTx.mutateAsync({id});
    await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
    await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
  }

  function startEdit(t:Transaction) {
    setEditId(t.id); setEditDesc(t.description); setEditAmount(String(t.amount));
    setEditCategory(t.category); setEditType(t.type);
    setEditNotes(t.notes||""); setEditRecurring(t.recurring||false);
  }

  async function saveEdit() {
    const amt = parseFloat(editAmount);
    if (!editDesc.trim()||isNaN(amt)||amt<=0||editId===null) return;
    setEditSubmitting(true);
    try {
      await deleteTx.mutateAsync({id:editId});
      await createTx.mutateAsync({data:{description:editDesc.trim(),amount:amt,category:editCategory,type:editType,notes:editNotes,recurring:editRecurring}});
      await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
      await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
      setEditId(null);
    } finally { setEditSubmitting(false); }
  }

  function saveBudget(cat:string, val:string) {
    const updated = {...budgets,[cat]:parseFloat(val)||0};
    setBudgets(updated);
    localStorage.setItem("budgets", JSON.stringify(updated));
  }

  function exportCSV() {
    const rows = [
      ["ID","Description","Amount","Category","Type","Notes","Recurring","Date"],
      ...filtered.map(t=>[
        t.id,
        `"${t.description.replace(/"/g,'""')}"`,
        t.amount, t.category, t.type,
        `"${(t.notes||"").replace(/"/g,'""')}"`,
        t.recurring?"Yes":"No",
        new Date(t.createdAt).toLocaleDateString(),
      ])
    ];
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`transactions-${filterYear}-${filterMonth==="All"?"all":MONTHS[parseInt(filterMonth)]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Budget warning check
  function getBudgetStatus(cat:string, spent:number) {
    const limit = budgets[cat];
    if (!limit||limit<=0) return null;
    const pct = spent/limit*100;
    if (pct>=100) return "over";
    if (pct>=80) return "warn";
    return "ok";
  }

  return (
    <div style={{minHeight:"100vh",background:bg,color:text,fontFamily:"'Inter',sans-serif",transition:"background 0.2s"}}>
      {/* Header */}
      <div style={{borderBottom:`1px solid ${border}`,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
        <h1 style={{fontSize:"20px",fontWeight:700,margin:0}}>Finance tracker</h1>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <span style={{background:"#10b981",color:"#fff",fontSize:"11px",fontWeight:700,padding:"3px 10px",borderRadius:"9999px"}}>Live</span>
          {user&&<span style={{fontSize:"12px",color:muted,maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.primaryEmailAddress?.emailAddress??user.fullName}</span>}
          <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inputStyle,padding:"4px 8px",fontSize:"12px"}}>
            <option value="₱">₱ PHP</option><option value="$">$ USD</option>
            <option value="€">€ EUR</option><option value="£">£ GBP</option>
            <option value="¥">¥ JPY</option><option value="₩">₩ KRW</option>
            <option value="A$">A$ AUD</option><option value="C$">C$ CAD</option>
          </select>
          <button onClick={()=>setDark(d=>!d)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"16px",padding:"4px 10px"}}>
            {dark?"Light":"Dark"}
          </button>
          <button onClick={()=>setShowBudgets(b=>!b)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"5px 12px"}}>
            Limit Budgets
          </button>
          <button onClick={()=>signOut({redirectUrl:`${window.location.origin}${basePath||"/"}`})} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"5px 12px"}}>
            Sign out
          </button>
        </div>
      </div>

      {/* Budget Panel */}
      {showBudgets && (
        <div style={{background:surface,borderBottom:`1px solid ${border}`,padding:"16px 24px"}}>
          <div style={{maxWidth:"1100px",margin:"0 auto"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>MONTHLY BUDGET LIMITS PER CATEGORY</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:"10px"}}>
              {CATEGORIES.filter(c=>["Housing","Food","Transport","Health","Shopping","Utilities"].includes(c)).map(cat=>{
                const spent = transactions
                  .filter(t=>t.type==="expense"&&t.category===cat&&new Date(t.createdAt).getMonth()===new Date().getMonth()&&new Date(t.createdAt).getFullYear()===new Date().getFullYear())
                  .reduce((s,t)=>s+t.amount,0);
                const limit = budgets[cat]||0;
                const status = getBudgetStatus(cat,spent);
                return (
                  <div key={cat} style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${status==="over"?"#ef4444":status==="warn"?"#f59e0b":border}`,borderRadius:"8px",padding:"10px"}}>
                    <div style={{fontSize:"11px",fontWeight:600,color:muted,marginBottom:"6px"}}>{cat}</div>
                    <input
                      type="number" min="0" step="100"
                      value={limit||""}
                      placeholder="No limit"
                      onChange={e=>saveBudget(cat,e.target.value)}
                      style={{...inputStyle,width:"100%",padding:"5px 8px",fontSize:"13px",marginBottom:"6px"}}
                    />
                    {limit>0&&(
                      <>
                        <div style={{height:"4px",background:dark?"#222":"#eee",borderRadius:"2px",overflow:"hidden",marginBottom:"4px"}}>
                          <div style={{width:`${Math.min(spent/limit*100,100)}%`,height:"100%",background:status==="over"?"#ef4444":status==="warn"?"#f59e0b":"#10b981",borderRadius:"2px",transition:"width 0.3s"}}/>
                        </div>
                        <div style={{fontSize:"11px",color:status==="over"?"#ef4444":status==="warn"?"#f59e0b":muted}}>
                          {fmt(spent)} / {fmt(limit)} {status==="over"?"⚠️ Over!":status==="warn"?"⚠️ Near limit":""}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"1100px",margin:"0 auto",padding:"24px 20px"}}>

        {/* Budget Warnings Banner */}
        {CATEGORIES.filter(cat=>{
          const spent = transactions
            .filter(t=>t.type==="expense"&&t.category===cat&&new Date(t.createdAt).getMonth()===new Date().getMonth()&&new Date(t.createdAt).getFullYear()===new Date().getFullYear())
            .reduce((s,t)=>s+t.amount,0);
          return getBudgetStatus(cat,spent)==="over"||getBudgetStatus(cat,spent)==="warn";
        }).length>0&&(
          <div style={{background:dark?"#2a1a00":"#fff8e6",border:"1px solid #f59e0b",borderRadius:"8px",padding:"10px 16px",marginBottom:"16px",fontSize:"13px",color:"#f59e0b"}}>
            ⚠️ Budget alert: {CATEGORIES.filter(cat=>{
              const spent=transactions.filter(t=>t.type==="expense"&&t.category===cat&&new Date(t.createdAt).getMonth()===new Date().getMonth()&&new Date(t.createdAt).getFullYear()===new Date().getFullYear()).reduce((s,t)=>s+t.amount,0);
              const st=getBudgetStatus(cat,spent);
              return st==="over"||st==="warn";
            }).map(cat=>{
              const spent=transactions.filter(t=>t.type==="expense"&&t.category===cat&&new Date(t.createdAt).getMonth()===new Date().getMonth()&&new Date(t.createdAt).getFullYear()===new Date().getFullYear()).reduce((s,t)=>s+t.amount,0);
              const st=getBudgetStatus(cat,spent);
              return `${cat} ${st==="over"?"is over budget":"is near limit"}`;
            }).join(", ")}
          </div>
        )}

        {/* Filters Row */}
        <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"14px 20px",marginBottom:"16px",display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...inputStyle,flex:"1 1 140px",minWidth:"120px"}}/>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={inputStyle}>
            <option value="All">All categories</option>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={inputStyle}>
            <option value="All">All months</option>
            {MONTHS.map((m,i)=><option key={m} value={String(i)}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={inputStyle}>
            <option value="All">All years</option>
            {availableYears.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportCSV} style={{background:surface,border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px 14px",whiteSpace:"nowrap"}}>⬇ CSV</button>
          {(search||filterCat!=="All"||filterMonth!=="All")&&(
            <button onClick={()=>{setSearch("");setFilterCat("All");setFilterMonth(String(new Date().getMonth()));}} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px 10px"}}>✕</button>
          )}
        </div>

        {/* KPI Cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"20px"}}>
          <KpiCard label="TOTAL INCOME" value={fmt(filteredIncome)} sub={`${filtered.filter(t=>t.type==="income").length} entries`} valueColor="#10b981" surface={surface} border={border} muted={muted}/>
          <KpiCard label="TOTAL EXPENSES" value={fmt(filteredExpenses)} sub={`${filtered.filter(t=>t.type==="expense").length} entries`} valueColor="#ef4444" surface={surface} border={border} muted={muted}/>
          <KpiCard label="NET BALANCE" value={fmt(filteredNet)} sub={filteredNet>=0?"surplus":"deficit"} valueColor={filteredNet>=0?"#10b981":"#ef4444"} surface={surface} border={border} muted={muted}/>
          <KpiCard label="SAVINGS RATE" value={filteredIncome>0?`${filteredRate.toFixed(1)}%`:"—"} sub="of income saved" valueColor={filteredRate>=20?"#10b981":filteredRate>0?"#f97316":"#ef4444"} surface={surface} border={border} muted={muted}/>
        </div>

        {/* Add Transaction Form */}
        <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px 20px",marginBottom:"20px"}}>
          <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ ADD TRANSACTION</div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center",marginBottom:"10px"}}>
            <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description" style={{...inputStyle,flex:"1 1 140px",minWidth:"120px"}}/>
            <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder={`Amount (${currency})`} style={{...inputStyle,width:"120px"}}/>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={()=>submit("income")} disabled={submitting} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"8px 16px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>↑ Income</button>
            <button onClick={()=>submit("expense")} disabled={submitting} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"8px 16px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>↓ Expense</button>
          </div>
          <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
            <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="📝 Notes (optional)" style={{...inputStyle,flex:"1 1 200px"}}/>
            <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:muted,cursor:"pointer"}}>
              <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} style={{accentColor:"#10b981"}}/>
              🔁 Recurring monthly
            </label>
          </div>
        </div>

        {/* Charts Row */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>INCOME VS EXPENSES</div>
            {filtered.length===0?<EmptyState dark={dark}/>:(
              <div style={{height:"200px",position:"relative"}}>
                <Bar data={barChartData} options={{
                  responsive:true,maintainAspectRatio:false,
                  plugins:{
                    legend:{position:"bottom",labels:{color:dark?"#aaa":"#555",font:{size:11},boxWidth:12,padding:12}},
                    tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`},backgroundColor:surface,borderColor:border,borderWidth:1,titleColor:text,bodyColor:muted},
                  },
                  scales:{
                    x:{grid:{color:dark?"#1e1e1e":"#eee"},ticks:{color:dark?"#666":"#999",font:{size:11}}},
                    y:{grid:{color:dark?"#1e1e1e":"#eee"},ticks:{color:dark?"#666":"#999",font:{size:11},callback:v=>`${currency}${Number(v).toLocaleString()}`}},
                  },
                }}/>
              </div>
            )}
          </div>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>EXPENSE BREAKDOWN</div>
            {expenseByCategory.length===0?<EmptyState text="No expenses yet" dark={dark}/>:(
              <div style={{height:"200px",position:"relative"}}>
                <Doughnut data={donutData} options={{
                  responsive:true,maintainAspectRatio:false,cutout:"65%",
                  plugins:{
                    legend:{position:"bottom",labels:{color:dark?"#aaa":"#555",font:{size:11},boxWidth:12,padding:10}},
                    tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${fmt(ctx.parsed)}`},backgroundColor:surface,borderColor:border,borderWidth:1,titleColor:text,bodyColor:muted},
                  },
                }}/>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
          {/* Transactions */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>
              RECENT TRANSACTIONS {filtered.length>0&&<span style={{color:muted,fontWeight:400}}>({filtered.length})</span>}
            </div>
            {filtered.length===0?(
              <p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"24px 0"}}>No transactions found</p>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:"8px",maxHeight:"420px",overflowY:"auto"}}>
                {filtered.slice(0,20).map(t=>(
                  <div key={t.id}>
                    {editId===t.id?(
                      <div style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"6px",padding:"10px"}}>
                        <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
                          <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} style={{...inputStyle,flex:"1 1 100px",fontSize:"13px",padding:"6px 10px"}}/>
                          <input value={editAmount} onChange={e=>setEditAmount(e.target.value)} type="number" min="0" step="0.01" style={{...inputStyle,width:"90px",fontSize:"13px",padding:"6px 10px"}}/>
                          <select value={editCategory} onChange={e=>setEditCategory(e.target.value)} style={{...inputStyle,fontSize:"13px",padding:"6px 10px"}}>
                            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={editType} onChange={e=>setEditType(e.target.value as "income"|"expense")} style={{...inputStyle,fontSize:"13px",padding:"6px 10px"}}>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                          </select>
                        </div>
                        <input value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="📝 Notes" style={{...inputStyle,width:"100%",fontSize:"13px",padding:"6px 10px",marginBottom:"8px"}}/>
                        <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                          <label style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",color:muted,cursor:"pointer"}}>
                            <input type="checkbox" checked={editRecurring} onChange={e=>setEditRecurring(e.target.checked)} style={{accentColor:"#10b981"}}/>
                            🔁 Recurring
                          </label>
                          <button onClick={saveEdit} disabled={editSubmitting} style={{background:"#10b981",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"12px",padding:"4px 12px"}}>Save</button>
                          <button onClick={()=>setEditId(null)} style={{background:dark?"#333":"#eee",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"12px",padding:"4px 12px"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"8px 10px",background:dark?"#111":"#f9f9f9",borderRadius:"6px",border:`1px solid ${t.recurring?`#10b981`:border}`,gap:"8px"}}>
                        <div style={{display:"flex",flexDirection:"column",gap:"2px",flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                            <span style={{fontSize:"13px",fontWeight:500,color:text}}>{t.description}</span>
                            {t.recurring&&<span style={{fontSize:"10px",background:"rgba(16,185,129,0.15)",color:"#10b981",padding:"1px 6px",borderRadius:"9999px"}}>🔁</span>}
                          </div>
                          <span style={{fontSize:"11px",color:muted}}>{t.category} · {timeSince(new Date(t.createdAt))}</span>
                          {t.notes&&<span style={{fontSize:"11px",color:muted,fontStyle:"italic"}}>📝 {t.notes}</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:"6px",flexShrink:0}}>
                          <span style={{fontSize:"13px",fontWeight:600,color:t.type==="income"?"#10b981":"#ef4444"}}>
                            {t.type==="income"?"+":"-"}{fmt(t.amount)}
                          </span>
                          <button onClick={()=>startEdit(t)} style={{background:"none",border:"none",color:muted,cursor:"pointer",fontSize:"13px",padding:"2px 4px"}} title="Edit">✎</button>
                          {confirmDelete===t.id?(
                            <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                              <span style={{fontSize:"11px",color:muted}}>Delete?</span>
                              <button onClick={()=>{handleDelete(t.id);setConfirmDelete(null);}} style={{background:"#ef4444",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"11px",padding:"2px 8px"}}>Yes</button>
                              <button onClick={()=>setConfirmDelete(null)} style={{background:dark?"#333":"#ddd",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"11px",padding:"2px 8px"}}>No</button>
                            </div>
                          ):(
                            <button onClick={()=>setConfirmDelete(t.id)} style={{background:"none",border:"none",color:muted,cursor:"pointer",fontSize:"14px",padding:"2px 4px"}} title="Delete">×</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spending by Category */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>SPENDING BY CATEGORY</div>
            {expenseByCategory.length===0?(
              <p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"24px 0"}}>No expenses yet</p>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                {expenseByCategory.map(([cat,val])=>{
                  const pct = filteredExpenses>0?(val/filteredExpenses)*100:0;
                  const color = CATEGORY_COLORS[cat]??"#6366f1";
                  const limit = budgets[cat];
                  const status = getBudgetStatus(cat,val);
                  return (
                    <div key={cat}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                        <span style={{fontSize:"12px",color:text}}>{cat} {status==="over"?"⚠️":status==="warn"?"⚡":""}</span>
                        <span style={{fontSize:"12px",color:muted}}>
                          {fmt(val)}{limit?` / ${fmt(limit)}`:""} <span style={{color:dark?"#555":"#bbb"}}>({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div style={{height:"6px",background:dark?"#222":"#eee",borderRadius:"3px",overflow:"hidden"}}>
                        <div style={{width:`${pct}%`,height:"100%",background:status==="over"?"#ef4444":status==="warn"?"#f59e0b":color,borderRadius:"3px",transition:"width 0.3s ease"}}/>
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

function KpiCard({label,value,sub,valueColor,surface,border,muted}:{label:string;value:string;sub:string;valueColor:string;surface:string;border:string;muted:string}) {
  return (
    <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
      <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",color:muted,marginBottom:"8px"}}>{label}</div>
      <div style={{fontSize:"22px",fontWeight:700,color:valueColor,fontVariantNumeric:"tabular-nums",marginBottom:"4px"}}>{value}</div>
      <div style={{fontSize:"11px",color:muted}}>{sub}</div>
    </div>
  );
}

function EmptyState({text="No data yet",dark}:{text?:string;dark:boolean}) {
  return (
    <div style={{height:"160px",display:"flex",alignItems:"center",justifyContent:"center",color:dark?"#444":"#bbb",fontSize:"13px"}}>
      {text}
    </div>
  );
}
