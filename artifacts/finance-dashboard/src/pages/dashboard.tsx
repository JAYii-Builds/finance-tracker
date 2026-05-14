import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser, useClerk } from "@clerk/react";
import {
  useGetTransactions, getGetTransactionsQueryKey,
  useCreateTransaction, useDeleteTransaction,
  useGetStats, getGetStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, ArcElement, Tooltip, Legend, LineElement, PointElement,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, LineElement, PointElement);

const CATEGORIES = ["Housing","Food","Transport","Health","Shopping","Utilities","Salary","Freelance","Other"];
const CATEGORY_COLORS: Record<string,string> = {
  Housing:"#3b82f6",Food:"#f97316",Transport:"#8b5cf6",Health:"#ec4899",
  Shopping:"#14b8a6",Utilities:"#94a3b8",Salary:"#10b981",Freelance:"#f59e0b",Other:"#6366f1",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENCY_SYMBOLS: Record<string,string> = {
  PHP:"₱",USD:"$",EUR:"€",GBP:"£",JPY:"¥",KRW:"₩",AUD:"A$",CAD:"C$",SGD:"S$",HKD:"HK$",CNY:"¥",INR:"₹",
};
const ALL_CURRENCIES = ["PHP","USD","EUR","GBP","JPY","KRW","AUD","CAD","SGD","HKD","CNY","INR"];
const DATE_FORMATS = ["MM/DD/YYYY","DD/MM/YYYY","YYYY-MM-DD"] as const;
type DateFormat = typeof DATE_FORMATS[number];

type Transaction = {
  id:number; description:string; amount:number; category:string;
  type:"income"|"expense"; createdAt:string; notes?:string; recurring?:boolean;
};
type Goal = { id:string; name:string; target:number; saved:number; color:string; };

function timeSince(date:Date) {
  const diff=(Date.now()-date.getTime())/1000;
  if(diff<60) return `${Math.floor(diff)}s ago`;
  if(diff<3600) return `${Math.floor(diff/60)}m ago`;
  if(diff<86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function formatDate(date:Date, fmt:DateFormat):string {
  const mm = String(date.getMonth()+1).padStart(2,"0");
  const dd = String(date.getDate()).padStart(2,"0");
  const yyyy = date.getFullYear();
  if(fmt==="MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
  if(fmt==="DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

const GOAL_COLORS = ["#10b981","#3b82f6","#f97316","#8b5cf6","#ec4899","#f59e0b","#14b8a6","#6366f1"];

// Load a setting from localStorage with a fallback
function loadSetting<T>(key:string, fallback:T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveSetting(key:string, value:unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/,"");

  // ── Persisted preferences ──
  const [dark, setDark] = useState<boolean>(() => loadSetting("pref_dark", true));
  const [currency, setCurrency] = useState<string>(() => loadSetting("pref_currency", "₱"));
  const [budgetAlertThreshold, setBudgetAlertThreshold] = useState<number>(() => loadSetting("pref_budget_threshold", 80));
  const [defaultTab, setDefaultTab] = useState<string>(() => loadSetting("pref_default_tab", "dashboard"));
  const [dateFormat, setDateFormat] = useState<DateFormat>(() => loadSetting("pref_date_format", "MM/DD/YYYY"));

  // Persist whenever they change
  useEffect(() => saveSetting("pref_dark", dark), [dark]);
  useEffect(() => saveSetting("pref_currency", currency), [currency]);
  useEffect(() => saveSetting("pref_budget_threshold", budgetAlertThreshold), [budgetAlertThreshold]);
  useEffect(() => saveSetting("pref_default_tab", defaultTab), [defaultTab]);
  useEffect(() => saveSetting("pref_date_format", dateFormat), [dateFormat]);

  const bg = dark?"#0f0f0f":"#f5f5f5";
  const surface = dark?"#1a1a1a":"#ffffff";
  const border = dark?"#2a2a2a":"#e5e5e5";
  const text = dark?"#e5e5e5":"#111111";
  const muted = dark?"#888":"#666";
  const inp = {background:dark?"#111":"#f9f9f9",border:`1px solid ${dark?"#333":"#ddd"}`,borderRadius:"6px",padding:"8px 12px",color:text,fontSize:"14px",outline:"none"} as const;

  // Welcome toast
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  useEffect(()=>{
    if(!user) return;
    const key = `welcomed_${user.id}`;
    if(!localStorage.getItem(key)){
      localStorage.setItem(key,"true");
      setShowWelcome(true);
      setTimeout(()=>setWelcomeVisible(true),100);
      setTimeout(()=>setWelcomeVisible(false),4000);
      setTimeout(()=>setShowWelcome(false),4800);
    }
  },[user]);

  const [activeTab, setActiveTab] = useState<"dashboard"|"monthly"|"goals"|"converter"|"settings">(
    () => loadSetting("pref_default_tab","dashboard") as any
  );
  const [desc, setDesc] = useState(""); const [amount, setAmount] = useState(""); const [category, setCategory] = useState("Housing");
  const [submitting, setSubmitting] = useState(false); const [notes, setNotes] = useState(""); const [recurring, setRecurring] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number|null>(null);
  const [search, setSearch] = useState(""); const [filterCat, setFilterCat] = useState("All");
  const [filterMonth, setFilterMonth] = useState(String(new Date().getMonth()));
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [showBudgets, setShowBudgets] = useState(false);
  const [budgets, setBudgets] = useState<Record<string,number>>(()=>{
    try{return JSON.parse(localStorage.getItem("budgets")||"{}")||{};}catch{return {};}
  });
  const [editId, setEditId] = useState<number|null>(null); const [editDesc, setEditDesc] = useState("");
  const [editAmount, setEditAmount] = useState(""); const [editCategory, setEditCategory] = useState("Housing");
  const [editType, setEditType] = useState<"income"|"expense">("expense");
  const [editNotes, setEditNotes] = useState(""); const [editRecurring, setEditRecurring] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [goals, setGoals] = useState<Goal[]>(()=>{
    try{return JSON.parse(localStorage.getItem("goals")||"[]");}catch{return [];}
  });
  const [goalName, setGoalName] = useState(""); const [goalTarget, setGoalTarget] = useState("");
  const [goalSaved, setGoalSaved] = useState(""); const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);
  const [addGoalSavedId, setAddGoalSavedId] = useState<string|null>(null);
  const [addSavedAmt, setAddSavedAmt] = useState("");
  const [rates, setRates] = useState<Record<string,number>>({});
  const [convertFrom, setConvertFrom] = useState("PHP"); const [convertTo, setConvertTo] = useState("USD");
  const [convertAmt, setConvertAmt] = useState("");
  const [ratesLoading, setRatesLoading] = useState(false);

  // Settings tab local state (for staged edits before save)
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState<"transactions"|"goals"|null>(null);
  const [exportFormat, setExportFormat] = useState<"csv"|"json">("csv");

  useEffect(()=>{
    setRatesLoading(true);
    fetch("https://open.er-api.com/v6/latest/USD")
      .then(r=>r.json()).then(d=>setRates(d.rates||{})).catch(()=>{}).finally(()=>setRatesLoading(false));
  },[]);

  function fmt(n:number){return currency+new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
  function fmtSym(n:number,sym:string){return sym+new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}

  const {data:rawTransactions}=useGetTransactions({query:{queryKey:getGetTransactionsQueryKey(),refetchInterval:5000}});
  const transactions=Array.isArray(rawTransactions)?rawTransactions as Transaction[]:[];
  const {data:stats}=useGetStats({query:{queryKey:getGetStatsQueryKey(),refetchInterval:5000}});
  const createTx=useCreateTransaction(); const deleteTx=useDeleteTransaction();

  const availableYears=useMemo(()=>{
    const y=new Set(transactions.map(t=>String(new Date(t.createdAt).getFullYear())));
    y.add(String(new Date().getFullYear())); return Array.from(y).sort().reverse();
  },[transactions]);

  const filtered=useMemo(()=>transactions.filter(t=>{
    const d=new Date(t.createdAt);
    return (filterMonth==="All"||d.getMonth()===parseInt(filterMonth))
      &&(filterYear==="All"||d.getFullYear()===parseInt(filterYear))
      &&(filterCat==="All"||t.category===filterCat)
      &&(search===""||t.description.toLowerCase().includes(search.toLowerCase())||t.category.toLowerCase().includes(search.toLowerCase())||(t.notes||"").toLowerCase().includes(search.toLowerCase()));
  }),[transactions,filterMonth,filterYear,filterCat,search]);

  const filteredIncome=useMemo(()=>filtered.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[filtered]);
  const filteredExpenses=useMemo(()=>filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[filtered]);
  const filteredNet=filteredIncome-filteredExpenses;
  const filteredRate=filteredIncome>0?(filteredNet/filteredIncome)*100:0;

  const expenseByCategory=useMemo(()=>{
    const map:Record<string,number>={};
    for(const t of filtered) if(t.type==="expense") map[t.category]=(map[t.category]??0)+t.amount;
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[filtered]);

  const barChartData=useMemo(()=>{
    const iMap:Record<string,number>={},eMap:Record<string,number>={};
    for(const t of filtered){if(t.type==="income")iMap[t.category]=(iMap[t.category]??0)+t.amount;else eMap[t.category]=(eMap[t.category]??0)+t.amount;}
    const cats=Array.from(new Set([...Object.keys(iMap),...Object.keys(eMap)]));
    return{labels:cats,datasets:[{label:"Income",data:cats.map(c=>iMap[c]??0),backgroundColor:"#10b981",borderRadius:4},{label:"Expenses",data:cats.map(c=>eMap[c]??0),backgroundColor:"#f97316",borderRadius:4}]};
  },[filtered]);

  const donutData=useMemo(()=>({
    labels:expenseByCategory.map(([c])=>c),
    datasets:[{data:expenseByCategory.map(([,v])=>v),backgroundColor:expenseByCategory.map(([c])=>CATEGORY_COLORS[c]??"#6366f1"),borderWidth:0,hoverOffset:4}],
  }),[expenseByCategory]);

  const monthlyChartData=useMemo(()=>{
    const map:Record<string,{income:number;expenses:number}>={};
    for(const t of transactions){
      const d=new Date(t.createdAt);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if(!map[key])map[key]={income:0,expenses:0};
      if(t.type==="income")map[key].income+=t.amount; else map[key].expenses+=t.amount;
    }
    const entries=Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).slice(-12);
    const labels=entries.map(([k])=>{const[y,m]=k.split("-");return`${MONTHS[parseInt(m)-1]} ${y}`;});
    const income=entries.map(([,v])=>v.income);
    const expenses=entries.map(([,v])=>v.expenses);
    const net=entries.map(([,v])=>v.income-v.expenses);
    return{labels,income,expenses,net,entries};
  },[transactions]);

  const monthlyBarData={
    labels:monthlyChartData.labels,
    datasets:[
      {label:"Income",data:monthlyChartData.income,backgroundColor:"#10b981",borderRadius:4},
      {label:"Expenses",data:monthlyChartData.expenses,backgroundColor:"#f97316",borderRadius:4},
    ],
  };
  const monthlyLineData={
    labels:monthlyChartData.labels,
    datasets:[{label:"Net balance",data:monthlyChartData.net,borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,0.1)",fill:true,tension:0.4,pointBackgroundColor:"#3b82f6",pointRadius:4}],
  };

  async function submit(type:"income"|"expense"){
    const amt=parseFloat(amount);
    if(!desc.trim()||isNaN(amt)||amt<=0)return;
    setSubmitting(true);
    try{
      await createTx.mutateAsync({data:{description:desc.trim(),amount:amt,category,type,notes,recurring}});
      await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
      await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
      setDesc("");setAmount("");setNotes("");setRecurring(false);
    }finally{setSubmitting(false);}
  }

  async function handleDelete(id:number){
    await deleteTx.mutateAsync({id});
    await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
    await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
  }

  function startEdit(t:Transaction){setEditId(t.id);setEditDesc(t.description);setEditAmount(String(t.amount));setEditCategory(t.category);setEditType(t.type);setEditNotes(t.notes||"");setEditRecurring(t.recurring||false);}
  async function saveEdit(){
    const amt=parseFloat(editAmount);
    if(!editDesc.trim()||isNaN(amt)||amt<=0||editId===null)return;
    setEditSubmitting(true);
    try{
      await deleteTx.mutateAsync({id:editId});
      await createTx.mutateAsync({data:{description:editDesc.trim(),amount:amt,category:editCategory,type:editType,notes:editNotes,recurring:editRecurring}});
      await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
      await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
      setEditId(null);
    }finally{setEditSubmitting(false);}
  }

  function saveBudget(cat:string,val:string){const u={...budgets,[cat]:parseFloat(val)||0};setBudgets(u);localStorage.setItem("budgets",JSON.stringify(u));}
  function getBudgetStatus(cat:string,spent:number){
    const l=budgets[cat];
    if(!l||l<=0)return null;
    const p=spent/l*100;
    if(p>=100)return"over";
    if(p>=budgetAlertThreshold)return"warn";
    return"ok";
  }

  function saveGoals(g:Goal[]){setGoals(g);localStorage.setItem("goals",JSON.stringify(g));}
  function addGoal(){
    const t=parseFloat(goalTarget),s=parseFloat(goalSaved)||0;
    if(!goalName.trim()||isNaN(t)||t<=0)return;
    saveGoals([...goals,{id:Date.now().toString(),name:goalName.trim(),target:t,saved:s,color:goalColor}]);
    setGoalName("");setGoalTarget("");setGoalSaved("");setGoalColor(GOAL_COLORS[goals.length%GOAL_COLORS.length]);
  }
  function deleteGoal(id:string){saveGoals(goals.filter(g=>g.id!==id));}
  function addToSaved(id:string){
    const amt=parseFloat(addSavedAmt);
    if(isNaN(amt)||amt===0)return;
    saveGoals(goals.map(g=>g.id===id?{...g,saved:Math.max(0,g.saved+amt)}:g));
    setAddGoalSavedId(null);setAddSavedAmt("");
  }

  // ── Export functions ──
  function exportCSV(all=false){
    const source = all ? transactions : filtered;
    const rows=[["ID","Description","Amount","Category","Type","Notes","Recurring","Date"],...source.map(t=>[
      t.id,`"${t.description.replace(/"/g,'""')}"`,t.amount,t.category,t.type,
      `"${(t.notes||"").replace(/"/g,'""')}"`,t.recurring?"Yes":"No",
      formatDate(new Date(t.createdAt), dateFormat)
    ])];
    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download=all?`all-transactions.csv`:`transactions-${filterYear}-${filterMonth==="All"?"all":MONTHS[parseInt(filterMonth)]}.csv`;
    a.click();URL.revokeObjectURL(url);
  }

  function exportJSON(){
    const blob=new Blob([JSON.stringify(transactions,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="all-transactions.json";a.click();URL.revokeObjectURL(url);
  }

  async function clearAllTransactions(){
    for(const t of transactions){ try{ await deleteTx.mutateAsync({id:t.id}); }catch{} }
    await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});
    await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});
    setDangerConfirm(null);
  }

  function clearAllGoals(){
    saveGoals([]);
    setDangerConfirm(null);
  }

  const chartOpts=(yPrefix:string)=>({
    responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:"bottom" as const,labels:{color:dark?"#aaa":"#555",font:{size:11},boxWidth:12,padding:12}},tooltip:{backgroundColor:surface,borderColor:border,borderWidth:1,titleColor:text,bodyColor:muted,callbacks:{label:(ctx:any)=>` ${ctx.dataset.label}: ${yPrefix}${Number(ctx.parsed.y).toLocaleString()}`}}},
    scales:{x:{grid:{color:dark?"#1e1e1e":"#eee"},ticks:{color:dark?"#666":"#999",font:{size:11}}},y:{grid:{color:dark?"#1e1e1e":"#eee"},ticks:{color:dark?"#666":"#999",font:{size:11},callback:(v:any)=>`${yPrefix}${Number(v).toLocaleString()}`}}},
  });

  const tabs=[
    {id:"dashboard",label:"📊 Dashboard"},
    {id:"monthly",label:"📅 Monthly"},
    {id:"goals",label:"🎯 Goals"},
    {id:"converter",label:"💱 Converter"},
    {id:"settings",label:"⚙️ Settings"},
  ] as const;

  const thisMonthSpent=(cat:string)=>transactions.filter(t=>t.type==="expense"&&t.category===cat&&new Date(t.createdAt).getMonth()===new Date().getMonth()&&new Date(t.createdAt).getFullYear()===new Date().getFullYear()).reduce((s,t)=>s+t.amount,0);
  const userName = user?.firstName || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || "there";

  return(
    <div style={{minHeight:"100vh",background:bg,color:text,fontFamily:"'Inter',sans-serif",transition:"background 0.2s"}}>
      {/* Welcome Toast */}
      {showWelcome&&(
        <div style={{
          position:"fixed",top:"24px",left:"50%",
          transform:welcomeVisible?"translateX(-50%) translateY(0)":"translateX(-50%) translateY(-16px)",
          zIndex:9999,pointerEvents:"none",
          transition:"opacity 0.7s ease, transform 0.7s ease",
          opacity:welcomeVisible?1:0,
        }}>
          <div style={{
            background:"linear-gradient(135deg,#10b981,#059669)",
            color:"#fff",borderRadius:"16px",padding:"18px 32px",
            boxShadow:"0 8px 40px rgba(16,185,129,0.4)",
            textAlign:"center",minWidth:"300px",
          }}>
            <div style={{fontSize:"26px",marginBottom:"6px"}}>👋</div>
            <div style={{fontSize:"17px",fontWeight:700,marginBottom:"4px"}}>Hello, {userName}!</div>
            <div style={{fontSize:"13px",opacity:0.9}}>Welcome to Trackify — let's get your finances sorted 💸</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{borderBottom:`1px solid ${border}`,padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
        <h1 style={{fontSize:"20px",fontWeight:700,margin:0}}>Finance tracker</h1>
        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
          <span style={{background:"#10b981",color:"#fff",fontSize:"11px",fontWeight:700,padding:"3px 10px",borderRadius:"9999px"}}>JAYii's Build</span>
          {user&&<span style={{fontSize:"12px",color:muted,maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.primaryEmailAddress?.emailAddress??user.fullName}</span>}
          <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,padding:"4px 8px",fontSize:"12px"}}>
            <option value="₱">₱ PHP</option><option value="$">$ USD</option><option value="€">€ EUR</option>
            <option value="£">£ GBP</option><option value="¥">¥ JPY</option><option value="₩">₩ KRW</option>
            <option value="A$">A$ AUD</option><option value="C$">C$ CAD</option>
          </select>
          <button onClick={()=>setDark(d=>!d)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"14px",padding:"4px 10px"}}>{dark?"☀️ Light":"🌙 Dark"}</button>
          <button onClick={()=>setShowBudgets(b=>!b)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"5px 12px"}}>Limit Budgets</button>
          <button onClick={()=>signOut({redirectUrl:`${window.location.origin}${basePath||"/"}`})} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"5px 12px"}}>Sign out</button>
        </div>
      </div>

      {/* Nav Tabs */}
      <div style={{borderBottom:`1px solid ${border}`,padding:"0 24px",display:"flex",gap:"0"}}>
        {tabs.map(tab=>(
          <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{background:"none",border:"none",borderBottom:`2px solid ${activeTab===tab.id?"#10b981":"transparent"}`,color:activeTab===tab.id?"#10b981":muted,cursor:"pointer",fontSize:"13px",fontWeight:activeTab===tab.id?600:400,padding:"12px 18px",transition:"all 0.15s"}}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Budget Panel */}
      {showBudgets&&(
        <div style={{background:surface,borderBottom:`1px solid ${border}`,padding:"16px 24px"}}>
          <div style={{maxWidth:"1100px",margin:"0 auto"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>MONTHLY BUDGET LIMITS</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:"10px"}}>
              {CATEGORIES.filter(c=>["Housing","Food","Transport","Health","Shopping","Utilities"].includes(c)).map(cat=>{
                const spent=thisMonthSpent(cat); const limit=budgets[cat]||0; const status=getBudgetStatus(cat,spent);
                return(
                  <div key={cat} style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${status==="over"?"#ef4444":status==="warn"?"#f59e0b":border}`,borderRadius:"8px",padding:"10px"}}>
                    <div style={{fontSize:"11px",fontWeight:600,color:muted,marginBottom:"6px"}}>{cat}</div>
                    <input type="number" min="0" step="100" value={limit||""} placeholder="No limit" onChange={e=>saveBudget(cat,e.target.value)} style={{...inp,width:"100%",padding:"5px 8px",fontSize:"13px",marginBottom:"6px"}}/>
                    {limit>0&&(<>
                      <div style={{height:"4px",background:dark?"#222":"#eee",borderRadius:"2px",overflow:"hidden",marginBottom:"4px"}}>
                        <div style={{width:`${Math.min(spent/limit*100,100)}%`,height:"100%",background:status==="over"?"#ef4444":status==="warn"?"#f59e0b":"#10b981",borderRadius:"2px"}}/>
                      </div>
                      <div style={{fontSize:"11px",color:status==="over"?"#ef4444":status==="warn"?"#f59e0b":muted}}>{fmt(spent)}/{fmt(limit)} {status==="over"?"⚠️ Over!":status==="warn"?"⚡ Near":""}</div>
                    </>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"1100px",margin:"0 auto",padding:"24px 20px"}}>

        {/* ── DASHBOARD TAB ── */}
        {activeTab==="dashboard"&&(<>
          {CATEGORIES.some(cat=>{const s=thisMonthSpent(cat);const st=getBudgetStatus(cat,s);return st==="over"||st==="warn";})&&(
            <div style={{background:dark?"#2a1a00":"#fff8e6",border:"1px solid #f59e0b",borderRadius:"8px",padding:"10px 16px",marginBottom:"16px",fontSize:"13px",color:"#f59e0b"}}>
              ⚠️ Budget alert: {CATEGORIES.filter(cat=>{const s=thisMonthSpent(cat);const st=getBudgetStatus(cat,s);return st==="over"||st==="warn";}).map(cat=>{const s=thisMonthSpent(cat);const st=getBudgetStatus(cat,s);return`${cat} ${st==="over"?"over budget":"near limit"}`;}).join(", ")}
            </div>
          )}

          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"14px 20px",marginBottom:"16px",display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...inp,flex:"1 1 140px",minWidth:"120px"}}/>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={inp}>
              <option value="All">All categories</option>
              {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={inp}>
              <option value="All">All months</option>
              {MONTHS.map((m,i)=><option key={m} value={String(i)}>{m}</option>)}
            </select>
            <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={inp}>
              <option value="All">All years</option>
              {availableYears.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={()=>exportCSV(false)} style={{background:surface,border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px 14px",whiteSpace:"nowrap"}}>⬇ CSV</button>
            {(search||filterCat!=="All"||filterMonth!=="All")&&<button onClick={()=>{setSearch("");setFilterCat("All");setFilterMonth(String(new Date().getMonth()));}} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px 10px"}}>✕</button>}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"20px"}}>
            <KpiCard label="TOTAL INCOME" value={fmt(filteredIncome)} sub={`${filtered.filter(t=>t.type==="income").length} entries`} valueColor="#10b981" surface={surface} border={border} muted={muted}/>
            <KpiCard label="TOTAL EXPENSES" value={fmt(filteredExpenses)} sub={`${filtered.filter(t=>t.type==="expense").length} entries`} valueColor="#ef4444" surface={surface} border={border} muted={muted}/>
            <KpiCard label="NET BALANCE" value={fmt(filteredNet)} sub={filteredNet>=0?"surplus":"deficit"} valueColor={filteredNet>=0?"#10b981":"#ef4444"} surface={surface} border={border} muted={muted}/>
            <KpiCard label="SAVINGS RATE" value={filteredIncome>0?`${filteredRate.toFixed(1)}%`:"—"} sub="of income saved" valueColor={filteredRate>=20?"#10b981":filteredRate>0?"#f97316":"#ef4444"} surface={surface} border={border} muted={muted}/>
          </div>

          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px 20px",marginBottom:"20px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ ADD TRANSACTION</div>
            <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center",marginBottom:"10px"}}>
              <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description" style={{...inp,flex:"1 1 140px",minWidth:"120px"}}/>
              <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder={`Amount (${currency})`} style={{...inp,width:"120px"}}/>
              <select value={category} onChange={e=>setCategory(e.target.value)} style={inp}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
              <button onClick={()=>submit("income")} disabled={submitting} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"8px 16px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>↑ Income</button>
              <button onClick={()=>submit("expense")} disabled={submitting} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"8px 16px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>↓ Expense</button>
            </div>
            <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="📝 Notes (optional)" style={{...inp,flex:"1 1 200px"}}/>
              <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:muted,cursor:"pointer"}}>
                <input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} style={{accentColor:"#10b981"}}/>🔁 Recurring
              </label>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>INCOME VS EXPENSES</div>
              {filtered.length===0?<EmptyState dark={dark}/>:<div style={{height:"200px",position:"relative"}}><Bar data={barChartData} options={chartOpts(currency)}/></div>}
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>EXPENSE BREAKDOWN</div>
              {expenseByCategory.length===0?<EmptyState text="No expenses yet" dark={dark}/>:<div style={{height:"200px",position:"relative"}}><Doughnut data={donutData} options={{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:dark?"#aaa":"#555",font:{size:11},boxWidth:12,padding:10}},tooltip:{callbacks:{label:(ctx:any)=>` ${ctx.label}: ${fmt(ctx.parsed)}`},backgroundColor:surface,borderColor:border,borderWidth:1,titleColor:text,bodyColor:muted}}}}/></div>}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>RECENT TRANSACTIONS {filtered.length>0&&<span style={{fontWeight:400}}>({filtered.length})</span>}</div>
              {filtered.length===0?<p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"24px 0"}}>No transactions found</p>:(
                <div style={{display:"flex",flexDirection:"column",gap:"8px",maxHeight:"420px",overflowY:"auto"}}>
                  {filtered.slice(0,20).map(t=>(
                    <div key={t.id}>
                      {editId===t.id?(
                        <div style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"6px",padding:"10px"}}>
                          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"8px"}}>
                            <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} style={{...inp,flex:"1 1 100px",fontSize:"13px",padding:"6px 10px"}}/>
                            <input value={editAmount} onChange={e=>setEditAmount(e.target.value)} type="number" min="0" step="0.01" style={{...inp,width:"90px",fontSize:"13px",padding:"6px 10px"}}/>
                            <select value={editCategory} onChange={e=>setEditCategory(e.target.value)} style={{...inp,fontSize:"13px",padding:"6px 10px"}}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
                            <select value={editType} onChange={e=>setEditType(e.target.value as "income"|"expense")} style={{...inp,fontSize:"13px",padding:"6px 10px"}}><option value="income">Income</option><option value="expense">Expense</option></select>
                          </div>
                          <input value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="📝 Notes" style={{...inp,width:"100%",fontSize:"13px",padding:"6px 10px",marginBottom:"8px"}}/>
                          <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                            <label style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",color:muted,cursor:"pointer"}}><input type="checkbox" checked={editRecurring} onChange={e=>setEditRecurring(e.target.checked)} style={{accentColor:"#10b981"}}/>🔁 Recurring</label>
                            <button onClick={saveEdit} disabled={editSubmitting} style={{background:"#10b981",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"12px",padding:"4px 12px"}}>Save</button>
                            <button onClick={()=>setEditId(null)} style={{background:dark?"#333":"#eee",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"12px",padding:"4px 12px"}}>Cancel</button>
                          </div>
                        </div>
                      ):(
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"8px 10px",background:dark?"#111":"#f9f9f9",borderRadius:"6px",border:`1px solid ${t.recurring?"#10b981":border}`,gap:"8px"}}>
                          <div style={{display:"flex",flexDirection:"column",gap:"2px",flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                              <span style={{fontSize:"13px",fontWeight:500,color:text}}>{t.description}</span>
                              {t.recurring&&<span style={{fontSize:"10px",background:"rgba(16,185,129,0.15)",color:"#10b981",padding:"1px 6px",borderRadius:"9999px"}}>🔁</span>}
                            </div>
                            <span style={{fontSize:"11px",color:muted}}>{t.category} · {timeSince(new Date(t.createdAt))}</span>
                            {t.notes&&<span style={{fontSize:"11px",color:muted,fontStyle:"italic"}}>📝 {t.notes}</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:"6px",flexShrink:0}}>
                            <span style={{fontSize:"13px",fontWeight:600,color:t.type==="income"?"#10b981":"#ef4444"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span>
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

            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>SPENDING BY CATEGORY</div>
              {expenseByCategory.length===0?<p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"24px 0"}}>No expenses yet</p>:(
                <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                  {expenseByCategory.map(([cat,val])=>{
                    const pct=filteredExpenses>0?(val/filteredExpenses)*100:0;
                    const color=CATEGORY_COLORS[cat]??"#6366f1";
                    const limit=budgets[cat]; const status=getBudgetStatus(cat,val);
                    return(
                      <div key={cat}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}>
                          <span style={{fontSize:"12px",color:text}}>{cat} {status==="over"?"⚠️":status==="warn"?"⚡":""}</span>
                          <span style={{fontSize:"12px",color:muted}}>{fmt(val)}{limit?` / ${fmt(limit)}`:""} <span style={{color:dark?"#555":"#bbb"}}>({pct.toFixed(0)}%)</span></span>
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
        </>)}

        {/* ── MONTHLY TAB ── */}
        {activeTab==="monthly"&&(<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"12px",marginBottom:"20px"}}>
            {monthlyChartData.entries.length>0&&(()=>{
              const last=monthlyChartData.entries[monthlyChartData.entries.length-1][1];
              const prev=monthlyChartData.entries.length>1?monthlyChartData.entries[monthlyChartData.entries.length-2][1]:null;
              const net=last.income-last.expenses;
              const rate=last.income>0?(net/last.income)*100:0;
              const incDiff=prev&&prev.income>0?((last.income-prev.income)/prev.income)*100:null;
              const expDiff=prev&&prev.expenses>0?((last.expenses-prev.expenses)/prev.expenses)*100:null;
              return(<>
                <KpiCard label="THIS MONTH INCOME" value={fmt(last.income)} sub={incDiff!==null?`${incDiff>=0?"▲":"▼"} ${Math.abs(incDiff).toFixed(1)}% vs last month`:"First month"} valueColor="#10b981" surface={surface} border={border} muted={muted}/>
                <KpiCard label="THIS MONTH EXPENSES" value={fmt(last.expenses)} sub={expDiff!==null?`${expDiff>=0?"▲":"▼"} ${Math.abs(expDiff).toFixed(1)}% vs last month`:"First month"} valueColor="#ef4444" surface={surface} border={border} muted={muted}/>
                <KpiCard label="THIS MONTH NET" value={fmt(net)} sub={net>=0?"surplus":"deficit"} valueColor={net>=0?"#10b981":"#ef4444"} surface={surface} border={border} muted={muted}/>
                <KpiCard label="SAVINGS RATE" value={last.income>0?`${rate.toFixed(1)}%`:"—"} sub="this month" valueColor={rate>=20?"#10b981":rate>0?"#f97316":"#ef4444"} surface={surface} border={border} muted={muted}/>
              </>);
            })()}
          </div>
          {monthlyChartData.labels.length===0?(
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"60px 20px",textAlign:"center",color:muted}}>No transaction history yet — add some transactions first.</div>
          ):(<>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px",marginBottom:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>INCOME VS EXPENSES — LAST 12 MONTHS</div>
              <div style={{height:"260px",position:"relative"}}><Bar data={monthlyBarData} options={chartOpts(currency)}/></div>
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px",marginBottom:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>NET BALANCE TREND</div>
              <div style={{height:"220px",position:"relative"}}><Line data={monthlyLineData} options={chartOpts(currency)}/></div>
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>MONTHLY BREAKDOWN TABLE</div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"13px"}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${border}`}}>
                      {["Month","Income","Expenses","Net","Rate"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",color:muted,fontWeight:600,fontSize:"11px"}}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...monthlyChartData.entries].reverse().map(([key,v],i)=>{
                      const [yr,mo]=key.split("-");
                      const net=v.income-v.expenses;
                      const rate=v.income>0?(net/v.income)*100:0;
                      return(
                        <tr key={key} style={{borderBottom:`1px solid ${border}`,background:i%2===0?"transparent":dark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)"}}>
                          <td style={{padding:"8px 12px",color:text}}>{MONTHS[parseInt(mo)-1]} {yr}</td>
                          <td style={{padding:"8px 12px",color:"#10b981",fontVariantNumeric:"tabular-nums"}}>{fmt(v.income)}</td>
                          <td style={{padding:"8px 12px",color:"#ef4444",fontVariantNumeric:"tabular-nums"}}>{fmt(v.expenses)}</td>
                          <td style={{padding:"8px 12px",color:net>=0?"#10b981":"#ef4444",fontVariantNumeric:"tabular-nums"}}>{fmt(net)}</td>
                          <td style={{padding:"8px 12px",color:rate>=20?"#10b981":rate>0?"#f97316":"#ef4444"}}>{v.income>0?`${rate.toFixed(1)}%`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>)}
        </>)}

        {/* ── GOALS TAB ── */}
        {activeTab==="goals"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px 20px",marginBottom:"20px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ NEW SAVINGS GOAL</div>
            <div style={{display:"flex",gap:"10px",flexWrap:"wrap",alignItems:"center"}}>
              <input value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="Goal name (e.g. Emergency fund)" style={{...inp,flex:"1 1 160px",minWidth:"140px"}}/>
              <input value={goalTarget} onChange={e=>setGoalTarget(e.target.value)} type="number" min="0" step="100" placeholder={`Target (${currency})`} style={{...inp,width:"140px"}}/>
              <input value={goalSaved} onChange={e=>setGoalSaved(e.target.value)} type="number" min="0" step="100" placeholder="Already saved" style={{...inp,width:"140px"}}/>
              <div style={{display:"flex",gap:"6px"}}>
                {GOAL_COLORS.map(c=><button key={c} onClick={()=>setGoalColor(c)} style={{width:"22px",height:"22px",borderRadius:"50%",background:c,border:goalColor===c?"3px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}
              </div>
              <button onClick={addGoal} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"8px 20px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Add goal</button>
            </div>
          </div>
          {goals.length===0?(
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"60px 20px",textAlign:"center",color:muted}}>No goals yet — add your first savings goal above!</div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:"16px"}}>
              {goals.map(g=>{
                const pct=g.target>0?Math.min(g.saved/g.target*100,100):0;
                const remaining=Math.max(g.target-g.saved,0);
                const done=g.saved>=g.target;
                return(
                  <div key={g.id} style={{background:surface,border:`1px solid ${done?"#10b981":border}`,borderRadius:"10px",padding:"20px",position:"relative"}}>
                    {done&&<div style={{position:"absolute",top:"12px",right:"12px",background:"rgba(16,185,129,0.15)",color:"#10b981",fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"9999px"}}>✓ Complete!</div>}
                    <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"12px"}}>
                      <div style={{width:"14px",height:"14px",borderRadius:"50%",background:g.color,flexShrink:0}}/>
                      <span style={{fontSize:"15px",fontWeight:600,color:text}}>{g.name}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
                      <span style={{fontSize:"13px",color:muted}}>Saved</span>
                      <span style={{fontSize:"13px",fontWeight:600,color:g.color}}>{fmt(g.saved)} <span style={{color:muted,fontWeight:400}}>/ {fmt(g.target)}</span></span>
                    </div>
                    <div style={{height:"10px",background:dark?"#222":"#eee",borderRadius:"5px",overflow:"hidden",marginBottom:"8px"}}>
                      <div style={{width:`${pct}%`,height:"100%",background:g.color,borderRadius:"5px",transition:"width 0.4s ease"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"14px"}}>
                      <span style={{fontSize:"12px",color:muted}}>{pct.toFixed(1)}% complete</span>
                      <span style={{fontSize:"12px",color:muted}}>{remaining>0?`${fmt(remaining)} to go`:"Goal reached! 🎉"}</span>
                    </div>
                    {addGoalSavedId===g.id?(
                      <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"10px"}}>
                        <input value={addSavedAmt} onChange={e=>setAddSavedAmt(e.target.value)} type="number" step="any" placeholder="Amount (+/-)" style={{...inp,flex:1,fontSize:"13px",padding:"6px 10px"}}/>
                        <button onClick={()=>addToSaved(g.id)} style={{background:"#10b981",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"12px",padding:"4px 12px"}}>Add</button>
                        <button onClick={()=>{setAddGoalSavedId(null);setAddSavedAmt("");}} style={{background:dark?"#333":"#eee",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"12px",padding:"4px 10px"}}>✕</button>
                      </div>
                    ):(
                      <button onClick={()=>{setAddGoalSavedId(g.id);setAddSavedAmt("");}} style={{background:"none",border:`1px solid ${g.color}`,borderRadius:"6px",color:g.color,cursor:"pointer",fontSize:"12px",padding:"6px 14px",width:"100%",marginBottom:"8px"}}>+ Update saved amount</button>
                    )}
                    <button onClick={()=>deleteGoal(g.id)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"11px",padding:"4px 12px",width:"100%"}}>Delete goal</button>
                  </div>
                );
              })}
            </div>
          )}
          {goals.length>0&&(
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px",marginTop:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>GOALS OVERVIEW</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
                <KpiCard label="TOTAL GOALS" value={String(goals.length)} sub={`${goals.filter(g=>g.saved>=g.target).length} completed`} valueColor="#10b981" surface={dark?"#111":"#f9f9f9"} border={border} muted={muted}/>
                <KpiCard label="TOTAL TARGET" value={fmt(goals.reduce((s,g)=>s+g.target,0))} sub="across all goals" valueColor="#3b82f6" surface={dark?"#111":"#f9f9f9"} border={border} muted={muted}/>
                <KpiCard label="TOTAL SAVED" value={fmt(goals.reduce((s,g)=>s+g.saved,0))} sub={`${((goals.reduce((s,g)=>s+g.saved,0)/Math.max(goals.reduce((s,g)=>s+g.target,0),1))*100).toFixed(1)}% of all targets`} valueColor="#f59e0b" surface={dark?"#111":"#f9f9f9"} border={border} muted={muted}/>
              </div>
            </div>
          )}
        </>)}

        {/* ── CONVERTER TAB ── */}
        {activeTab==="converter"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"24px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>
              LIVE CURRENCY CONVERTER {ratesLoading&&<span style={{color:"#f59e0b",fontWeight:400}}>— fetching rates...</span>}
              {!ratesLoading&&Object.keys(rates).length>0&&<span style={{color:"#10b981",fontWeight:400}}>— rates updated</span>}
            </div>
            <div style={{display:"flex",gap:"16px",flexWrap:"wrap",alignItems:"center",marginBottom:"24px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:"6px",flex:"1 1 120px"}}>
                <label style={{fontSize:"11px",color:muted}}>Amount</label>
                <input value={convertAmt} onChange={e=>setConvertAmt(e.target.value)} type="number" min="0" placeholder="Enter amount" style={{...inp,fontSize:"18px",padding:"12px 16px",fontWeight:500}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px",flex:"1 1 100px"}}>
                <label style={{fontSize:"11px",color:muted}}>From</label>
                <select value={convertFrom} onChange={e=>setConvertFrom(e.target.value)} style={{...inp,fontSize:"16px",padding:"12px 16px"}}>
                  {ALL_CURRENCIES.map(c=><option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}
                </select>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",paddingBottom:"4px"}}>
                <button onClick={()=>{const t=convertFrom;setConvertFrom(convertTo);setConvertTo(t);}} style={{background:"none",border:`1px solid ${border}`,borderRadius:"50%",width:"36px",height:"36px",color:muted,cursor:"pointer",fontSize:"18px",display:"flex",alignItems:"center",justifyContent:"center"}}>⇄</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px",flex:"1 1 100px"}}>
                <label style={{fontSize:"11px",color:muted}}>To</label>
                <select value={convertTo} onChange={e=>setConvertTo(e.target.value)} style={{...inp,fontSize:"16px",padding:"12px 16px"}}>
                  {ALL_CURRENCIES.map(c=><option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}
                </select>
              </div>
            </div>
            {convertAmt&&rates[convertFrom]&&rates[convertTo]?(
              <div style={{background:dark?"#0a0a0a":"#f0fdf4",border:"1px solid #10b981",borderRadius:"12px",padding:"20px 24px",textAlign:"center"}}>
                <div style={{fontSize:"14px",color:muted,marginBottom:"8px"}}>{convertAmt} {convertFrom} =</div>
                <div style={{fontSize:"36px",fontWeight:700,color:"#10b981",fontVariantNumeric:"tabular-nums"}}>
                  {fmtSym(parseFloat(convertAmt)/rates[convertFrom]*rates[convertTo],CURRENCY_SYMBOLS[convertTo]||"")} {convertTo}
                </div>
                <div style={{fontSize:"12px",color:muted,marginTop:"8px"}}>1 {convertFrom} = {(rates[convertTo]/rates[convertFrom]).toFixed(6)} {convertTo}</div>
              </div>
            ):(
              <div style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"12px",padding:"32px",textAlign:"center",color:muted,fontSize:"14px"}}>
                {Object.keys(rates).length===0?"Loading exchange rates...":"Enter an amount above to convert"}
              </div>
            )}
          </div>
          {Object.keys(rates).length>0&&(
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"20px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>QUICK REFERENCE — 1 {convertFrom} IN OTHER CURRENCIES</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:"10px"}}>
                {ALL_CURRENCIES.filter(c=>c!==convertFrom).map(c=>(
                  <div key={c} style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"8px",padding:"12px",cursor:"pointer"}} onClick={()=>setConvertTo(c)}>
                    <div style={{fontSize:"11px",color:muted,marginBottom:"4px"}}>{CURRENCY_SYMBOLS[c]} {c}</div>
                    <div style={{fontSize:"16px",fontWeight:600,color:text,fontVariantNumeric:"tabular-nums"}}>{(rates[c]/rates[convertFrom]).toFixed(4)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>)}

        {/* ── SETTINGS TAB ── */}
        {activeTab==="settings"&&(<>

          {/* Preferences */}
          <SettingsSection title="PREFERENCES" surface={surface} border={border} muted={muted}>
            <SettingsRow label="Default currency" desc="Currency shown across the app" dark={dark} border={border} muted={muted} text={text}>
              <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,fontSize:"13px",padding:"6px 10px"}}>
                <option value="₱">₱ PHP</option><option value="$">$ USD</option><option value="€">€ EUR</option>
                <option value="£">£ GBP</option><option value="¥">¥ JPY</option><option value="₩">₩ KRW</option>
                <option value="A$">A$ AUD</option><option value="C$">C$ CAD</option>
              </select>
            </SettingsRow>

            <SettingsRow label="Theme" desc="Light or dark mode" dark={dark} border={border} muted={muted} text={text}>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={()=>setDark(false)} style={{background:!dark?"#10b981":"none",color:!dark?"#fff":muted,border:`1px solid ${!dark?"#10b981":border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"13px",cursor:"pointer",fontWeight:!dark?600:400}}>☀️ Light</button>
                <button onClick={()=>setDark(true)} style={{background:dark?"#10b981":"none",color:dark?"#fff":muted,border:`1px solid ${dark?"#10b981":border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"13px",cursor:"pointer",fontWeight:dark?600:400}}>🌙 Dark</button>
              </div>
            </SettingsRow>

            <SettingsRow label="Default tab on login" desc="Which tab opens when you sign in" dark={dark} border={border} muted={muted} text={text}>
              <select
                value={defaultTab}
                onChange={e=>{ setDefaultTab(e.target.value); saveSetting("pref_default_tab", e.target.value); }}
                style={{...inp,fontSize:"13px",padding:"6px 10px"}}
              >
                <option value="dashboard">📊 Dashboard</option>
                <option value="monthly">📅 Monthly</option>
                <option value="goals">🎯 Goals</option>
                <option value="converter">💱 Converter</option>
              </select>
            </SettingsRow>

            <SettingsRow label="Date format" desc="How dates appear in exports and lists" dark={dark} border={border} muted={muted} text={text}>
              <select value={dateFormat} onChange={e=>setDateFormat(e.target.value as DateFormat)} style={{...inp,fontSize:"13px",padding:"6px 10px"}}>
                {DATE_FORMATS.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </SettingsRow>

            <SettingsRow label="Budget alert threshold" desc={`Warn when spending reaches this % of your limit (currently ${budgetAlertThreshold}%)`} dark={dark} border={border} muted={muted} text={text}>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <input
                  type="range" min="50" max="95" step="5"
                  value={budgetAlertThreshold}
                  onChange={e=>setBudgetAlertThreshold(Number(e.target.value))}
                  style={{accentColor:"#10b981",width:"140px",cursor:"pointer"}}
                />
                <span style={{fontSize:"14px",fontWeight:600,color:"#10b981",minWidth:"40px"}}>{budgetAlertThreshold}%</span>
              </div>
            </SettingsRow>
          </SettingsSection>

          {/* Account info */}
          <SettingsSection title="ACCOUNT" surface={surface} border={border} muted={muted}>
            <SettingsRow label="Email" desc="Your sign-in email address" dark={dark} border={border} muted={muted} text={text}>
              <span style={{fontSize:"13px",color:muted}}>{user?.primaryEmailAddress?.emailAddress ?? "—"}</span>
            </SettingsRow>
            <SettingsRow label="Name" desc="Your display name from Clerk" dark={dark} border={border} muted={muted} text={text}>
              <span style={{fontSize:"13px",color:muted}}>{user?.fullName ?? user?.firstName ?? "—"}</span>
            </SettingsRow>
            <SettingsRow label="User ID" desc="Your unique account identifier" dark={dark} border={border} muted={muted} text={text}>
              <span style={{fontSize:"12px",color:muted,fontFamily:"monospace"}}>{user?.id ?? "—"}</span>
            </SettingsRow>
          </SettingsSection>

          {/* Data export */}
          <SettingsSection title="DATA EXPORT" surface={surface} border={border} muted={muted}>
            <SettingsRow label="Export format" desc="Choose CSV for spreadsheets, JSON for raw data" dark={dark} border={border} muted={muted} text={text}>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={()=>setExportFormat("csv")} style={{background:exportFormat==="csv"?"#10b981":"none",color:exportFormat==="csv"?"#fff":muted,border:`1px solid ${exportFormat==="csv"?"#10b981":border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"13px",cursor:"pointer",fontWeight:exportFormat==="csv"?600:400}}>CSV</button>
                <button onClick={()=>setExportFormat("json")} style={{background:exportFormat==="json"?"#10b981":"none",color:exportFormat==="json"?"#fff":muted,border:`1px solid ${exportFormat==="json"?"#10b981":border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"13px",cursor:"pointer",fontWeight:exportFormat==="json"?600:400}}>JSON</button>
              </div>
            </SettingsRow>
            <SettingsRow label="Export all transactions" desc={`Download all ${transactions.length} transaction${transactions.length!==1?"s":""} as ${exportFormat.toUpperCase()}`} dark={dark} border={border} muted={muted} text={text}>
              <button
                onClick={()=>exportFormat==="csv"?exportCSV(true):exportJSON()}
                disabled={transactions.length===0}
                style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"7px 16px",fontSize:"13px",fontWeight:600,cursor:transactions.length===0?"not-allowed":"pointer",opacity:transactions.length===0?0.5:1}}
              >
                ⬇ Export {exportFormat.toUpperCase()}
              </button>
            </SettingsRow>
          </SettingsSection>

          {/* Danger zone */}
          <SettingsSection title="DANGER ZONE" surface={surface} border={`1px solid #ef4444`} muted={muted} titleColor="#ef4444">
            <SettingsRow label="Clear all transactions" desc="Permanently delete every transaction from the database. This cannot be undone." dark={dark} border={border} muted={muted} text={text}>
              {dangerConfirm==="transactions"?(
                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                  <span style={{fontSize:"12px",color:"#ef4444"}}>Are you sure?</span>
                  <button onClick={clearAllTransactions} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"6px 14px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Yes, delete all</button>
                  <button onClick={()=>setDangerConfirm(null)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,padding:"6px 12px",fontSize:"13px",cursor:"pointer"}}>Cancel</button>
                </div>
              ):(
                <button onClick={()=>setDangerConfirm("transactions")} style={{background:"none",border:"1px solid #ef4444",borderRadius:"6px",color:"#ef4444",padding:"7px 16px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>
                  🗑 Clear transactions
                </button>
              )}
            </SettingsRow>
            <SettingsRow label="Clear all goals" desc="Permanently delete all savings goals stored locally." dark={dark} border={border} muted={muted} text={text}>
              {dangerConfirm==="goals"?(
                <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                  <span style={{fontSize:"12px",color:"#ef4444"}}>Are you sure?</span>
                  <button onClick={clearAllGoals} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"6px 14px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Yes, delete all</button>
                  <button onClick={()=>setDangerConfirm(null)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,padding:"6px 12px",fontSize:"13px",cursor:"pointer"}}>Cancel</button>
                </div>
              ):(
                <button onClick={()=>setDangerConfirm("goals")} style={{background:"none",border:"1px solid #ef4444",borderRadius:"6px",color:"#ef4444",padding:"7px 16px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>
                  🗑 Clear goals
                </button>
              )}
            </SettingsRow>
          </SettingsSection>

          {settingsSaved&&(
            <div style={{position:"fixed",bottom:"24px",right:"24px",background:"#10b981",color:"#fff",borderRadius:"10px",padding:"12px 20px",fontSize:"13px",fontWeight:600,boxShadow:"0 4px 20px rgba(16,185,129,0.4)",zIndex:9999}}>
              ✓ Settings saved
            </div>
          )}
        </>)}

      </div>
    </div>
  );
}

// ── Settings helper components ──

function SettingsSection({title,children,surface,border,muted,titleColor}:{title:string;children:React.ReactNode;surface:string;border:string;muted:string;titleColor?:string}) {
  return(
    <div style={{background:surface,border,borderRadius:"10px",overflow:"hidden",marginBottom:"16px"}}>
      <div style={{padding:"12px 20px",borderBottom:`1px solid ${border}`}}>
        <span style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:titleColor||muted}}>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingsRow({label,desc,children,dark,border,muted,text}:{label:string;desc:string;children:React.ReactNode;dark:boolean;border:string;muted:string;text:string}) {
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${border}`,gap:"16px",flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:"13px",fontWeight:500,color:text,marginBottom:"2px"}}>{label}</div>
        <div style={{fontSize:"12px",color:muted}}>{desc}</div>
      </div>
      <div style={{flexShrink:0}}>{children}</div>
    </div>
  );
}

function KpiCard({label,value,sub,valueColor,surface,border,muted}:{label:string;value:string;sub:string;valueColor:string;surface:string;border:string;muted:string}) {
  return(
    <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
      <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",color:muted,marginBottom:"8px"}}>{label}</div>
      <div style={{fontSize:"22px",fontWeight:700,color:valueColor,fontVariantNumeric:"tabular-nums",marginBottom:"4px"}}>{value}</div>
      <div style={{fontSize:"11px",color:muted}}>{sub}</div>
    </div>
  );
}

function EmptyState({text="No data yet",dark}:{text?:string;dark:boolean}) {
  return(
    <div style={{height:"160px",display:"flex",alignItems:"center",justifyContent:"center",color:dark?"#444":"#bbb",fontSize:"13px"}}>
      {text}
    </div>
  );
}
