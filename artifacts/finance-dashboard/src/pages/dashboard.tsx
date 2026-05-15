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

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const CATEGORIES = ["Housing","Food","Transport","Health","Shopping","Utilities","Salary","Freelance","Other"];
const CATEGORY_COLORS: Record<string,string> = {
  Housing:"#3b82f6",Food:"#f97316",Transport:"#8b5cf6",Health:"#ec4899",
  Shopping:"#14b8a6",Utilities:"#94a3b8",Salary:"#10b981",Freelance:"#f59e0b",Other:"#6366f1",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENCY_SYMBOLS: Record<string,string> = {
  PHP:"₱",USD:"$",EUR:"€",GBP:"£",JPY:"¥",KRW:"₩",AUD:"A$",CAD:"C$",SGD:"S$",HKD:"HK$",CNY:"¥",INR:"₹",
};
const ALL_CURRENCIES = ["PHP","USD","EUR","GBP","JPY","KRW","AUD","CAD","SGD","HKD","CNY","INR"];
const DATE_FORMATS = ["MM/DD/YYYY","DD/MM/YYYY","YYYY-MM-DD"] as const;
type DateFormat = typeof DATE_FORMATS[number];
const GOAL_COLORS = ["#10b981","#3b82f6","#f97316","#8b5cf6","#ec4899","#f59e0b","#14b8a6","#6366f1"];

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type Transaction = {
  id:number; description:string; amount:number; category:string;
  type:"income"|"expense"; createdAt:string; notes?:string; recurring?:boolean;
};
type Goal = { id:string; name:string; target:number; saved:number; color:string; };
type Debt = {
  id:string; name:string; type:"loan"|"credit_card"|"other";
  totalAmount:number; remaining:number; interestRate:number;
  dueDate:string; color:string; payments:{date:string;amount:number}[];
};
type Bill = {
  id:string; name:string; amount:number; dueDay:number;
  category:string; recurrence:"monthly"|"weekly"|"yearly"; color:string; paid:boolean;
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function useIsMobile(bp=640){
  const [m,setM]=useState(()=>typeof window!=="undefined"?window.innerWidth<bp:false);
  useEffect(()=>{const h=()=>setM(window.innerWidth<bp);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[bp]);
  return m;
}
function timeSince(date:Date){
  const d=(Date.now()-date.getTime())/1000;
  if(d<60)return`${Math.floor(d)}s ago`;if(d<3600)return`${Math.floor(d/60)}m ago`;
  if(d<86400)return`${Math.floor(d/3600)}h ago`;return`${Math.floor(d/86400)}d ago`;
}
function formatDate(date:Date,fmt:DateFormat):string{
  const mm=String(date.getMonth()+1).padStart(2,"0"),dd=String(date.getDate()).padStart(2,"0"),yyyy=date.getFullYear();
  if(fmt==="MM/DD/YYYY")return`${mm}/${dd}/${yyyy}`;if(fmt==="DD/MM/YYYY")return`${dd}/${mm}/${yyyy}`;return`${yyyy}-${mm}-${dd}`;
}
function loadSetting<T>(key:string,fallback:T):T{
  try{const v=localStorage.getItem(key);return v!==null?JSON.parse(v):fallback;}catch{return fallback;}
}
function saveSetting(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function isoDay(d:Date){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export default function Dashboard(){
  const qc=useQueryClient();
  const {user}=useUser();
  const {signOut}=useClerk();
  const basePath=import.meta.env.BASE_URL.replace(/\/$/,"");
  const isMobile=useIsMobile();

  // Preferences
  const [dark,setDark]=useState<boolean>(()=>loadSetting("pref_dark",true));
  const [currency,setCurrency]=useState<string>(()=>loadSetting("pref_currency","₱"));
  const [budgetAlertThreshold,setBudgetAlertThreshold]=useState<number>(()=>loadSetting("pref_budget_threshold",80));
  const [defaultTab,setDefaultTab]=useState<string>(()=>loadSetting("pref_default_tab","dashboard"));
  const [dateFormat,setDateFormat]=useState<DateFormat>(()=>loadSetting("pref_date_format","MM/DD/YYYY"));
  useEffect(()=>saveSetting("pref_dark",dark),[dark]);
  useEffect(()=>saveSetting("pref_currency",currency),[currency]);
  useEffect(()=>saveSetting("pref_budget_threshold",budgetAlertThreshold),[budgetAlertThreshold]);
  useEffect(()=>saveSetting("pref_default_tab",defaultTab),[defaultTab]);
  useEffect(()=>saveSetting("pref_date_format",dateFormat),[dateFormat]);

  // Theme
  const bg=dark?"#0f0f0f":"#f5f5f5";
  const surface=dark?"#1a1a1a":"#ffffff";
  const border=dark?"#2a2a2a":"#e5e5e5";
  const text=dark?"#e5e5e5":"#111111";
  const muted=dark?"#888":"#666";
  const inp={background:dark?"#111":"#f9f9f9",border:`1px solid ${dark?"#333":"#ddd"}`,borderRadius:"6px",padding:"8px 12px",color:text,fontSize:"14px",outline:"none"} as const;

  // Welcome
  const [showWelcome,setShowWelcome]=useState(false);
  const [welcomeVisible,setWelcomeVisible]=useState(false);
  useEffect(()=>{
    if(!user)return;const key=`welcomed_${user.id}`;
    if(!localStorage.getItem(key)){
      localStorage.setItem(key,"true");setShowWelcome(true);
      setTimeout(()=>setWelcomeVisible(true),100);setTimeout(()=>setWelcomeVisible(false),4000);setTimeout(()=>setShowWelcome(false),4800);
    }
  },[user]);

  // Nav
  type TabId="dashboard"|"monthly"|"goals"|"converter"|"debts"|"bills"|"streak"|"heatmap"|"settings";
  const [activeTab,setActiveTab]=useState<TabId>(()=>loadSetting("pref_default_tab","dashboard") as TabId);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);

  // Transactions
  const [desc,setDesc]=useState("");const [amount,setAmount]=useState("");const [category,setCategory]=useState("Housing");
  const [submitting,setSubmitting]=useState(false);const [notes,setNotes]=useState("");const [recurring,setRecurring]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<number|null>(null);
  const [search,setSearch]=useState("");const [filterCat,setFilterCat]=useState("All");
  const [filterMonth,setFilterMonth]=useState(String(new Date().getMonth()));
  const [filterYear,setFilterYear]=useState(String(new Date().getFullYear()));
  const [showBudgets,setShowBudgets]=useState(false);
  const [budgets,setBudgets]=useState<Record<string,number>>(()=>{try{return JSON.parse(localStorage.getItem("budgets")||"{}")||{};}catch{return {};}});
  const [editId,setEditId]=useState<number|null>(null);const [editDesc,setEditDesc]=useState("");
  const [editAmount,setEditAmount]=useState("");const [editCategory,setEditCategory]=useState("Housing");
  const [editType,setEditType]=useState<"income"|"expense">("expense");
  const [editNotes,setEditNotes]=useState("");const [editRecurring,setEditRecurring]=useState(false);
  const [editSubmitting,setEditSubmitting]=useState(false);

  // Goals
  const [goals,setGoals]=useState<Goal[]>(()=>{try{return JSON.parse(localStorage.getItem("goals")||"[]");}catch{return[];}});
  const [goalName,setGoalName]=useState("");const [goalTarget,setGoalTarget]=useState("");
  const [goalSaved,setGoalSaved]=useState("");const [goalColor,setGoalColor]=useState(GOAL_COLORS[0]);
  const [addGoalSavedId,setAddGoalSavedId]=useState<string|null>(null);const [addSavedAmt,setAddSavedAmt]=useState("");

  // Converter
  const [rates,setRates]=useState<Record<string,number>>({});
  const [convertFrom,setConvertFrom]=useState("PHP");const [convertTo,setConvertTo]=useState("USD");const [convertAmt,setConvertAmt]=useState("");
  const [ratesLoading,setRatesLoading]=useState(false);
  useEffect(()=>{setRatesLoading(true);fetch("https://open.er-api.com/v6/latest/USD").then(r=>r.json()).then(d=>setRates(d.rates||{})).catch(()=>{}).finally(()=>setRatesLoading(false));},[]);

  // Debts
  const [debts,setDebts]=useState<Debt[]>(()=>{try{return JSON.parse(localStorage.getItem("debts")||"[]");}catch{return[];}});
  const [debtName,setDebtName]=useState("");const [debtType,setDebtType]=useState<Debt["type"]>("loan");
  const [debtTotal,setDebtTotal]=useState("");const [debtRemaining,setDebtRemaining]=useState("");
  const [debtRate,setDebtRate]=useState("");const [debtDue,setDebtDue]=useState("");const [debtColor,setDebtColor]=useState(GOAL_COLORS[0]);
  const [payDebtId,setPayDebtId]=useState<string|null>(null);const [payAmt,setPayAmt]=useState("");

  function saveDebts(d:Debt[]){setDebts(d);localStorage.setItem("debts",JSON.stringify(d));}
  function addDebt(){
    const tot=parseFloat(debtTotal),rem=parseFloat(debtRemaining)||parseFloat(debtTotal);
    if(!debtName.trim()||isNaN(tot)||tot<=0)return;
    saveDebts([...debts,{id:Date.now().toString(),name:debtName.trim(),type:debtType,totalAmount:tot,remaining:rem,interestRate:parseFloat(debtRate)||0,dueDate:debtDue,color:debtColor,payments:[]}]);
    setDebtName("");setDebtTotal("");setDebtRemaining("");setDebtRate("");setDebtDue("");
  }
  function payDebt(id:string){
    const amt=parseFloat(payAmt);if(isNaN(amt)||amt<=0)return;
    saveDebts(debts.map(d=>d.id===id?{...d,remaining:Math.max(0,d.remaining-amt),payments:[...d.payments,{date:isoDay(new Date()),amount:amt}]}:d));
    setPayDebtId(null);setPayAmt("");
  }
  function deleteDebt(id:string){saveDebts(debts.filter(d=>d.id!==id));}

  // Bills
  const [bills,setBills]=useState<Bill[]>(()=>{try{return JSON.parse(localStorage.getItem("bills")||"[]");}catch{return[];}});
  const [billName,setBillName]=useState("");const [billAmount,setBillAmount]=useState("");
  const [billDay,setBillDay]=useState("1");const [billCat,setBillCat]=useState("Utilities");
  const [billRec,setBillRec]=useState<Bill["recurrence"]>("monthly");const [billColor,setBillColor]=useState(GOAL_COLORS[2]);
  const [calMonth,setCalMonth]=useState(new Date().getMonth());const [calYear,setCalYear]=useState(new Date().getFullYear());

  function saveBills(b:Bill[]){setBills(b);localStorage.setItem("bills",JSON.stringify(b));}
  function addBill(){
    const amt=parseFloat(billAmount),day=parseInt(billDay);
    if(!billName.trim()||isNaN(amt)||amt<=0||isNaN(day)||day<1||day>31)return;
    saveBills([...bills,{id:Date.now().toString(),name:billName.trim(),amount:amt,dueDay:day,category:billCat,recurrence:billRec,color:billColor,paid:false}]);
    setBillName("");setBillAmount("");setBillDay("1");
  }
  function toggleBillPaid(id:string){saveBills(bills.map(b=>b.id===id?{...b,paid:!b.paid}:b));}
  function deleteBill(id:string){saveBills(bills.filter(b=>b.id!==id));}

  // Calendar helpers
  const calDays=useMemo(()=>{
    const first=new Date(calYear,calMonth,1).getDay();
    const total=new Date(calYear,calMonth+1,0).getDate();
    return{first,total};
  },[calMonth,calYear]);

  function billsOnDay(day:number){return bills.filter(b=>b.recurrence==="monthly"&&b.dueDay===day);}
  function dayStatus(day:number,bills:Bill[]):{type:"over"|"soon"|"ok"|"none"}{
    if(bills.length===0)return{type:"none"};
    const today=new Date();const thisDay=new Date(calYear,calMonth,day);
    if(thisDay<today&&!bills.every(b=>b.paid))return{type:"over"};
    const diff=(thisDay.getTime()-today.getTime())/86400000;
    if(diff<=7)return{type:"soon"};return{type:"ok"};
  }

  // Settings
  const [settingsSaved,setSettingsSaved]=useState(false);
  const [dangerConfirm,setDangerConfirm]=useState<"transactions"|"goals"|null>(null);
  const [exportFormat,setExportFormat]=useState<"csv"|"json">("csv");

  // API data
  const {data:rawTransactions}=useGetTransactions({query:{queryKey:getGetTransactionsQueryKey(),refetchInterval:5000}});
  const transactions=Array.isArray(rawTransactions)?rawTransactions as Transaction[]:[];
  const {data:stats}=useGetStats({query:{queryKey:getGetStatsQueryKey(),refetchInterval:5000}});
  const createTx=useCreateTransaction();const deleteTx=useDeleteTransaction();

  // Derived
  const availableYears=useMemo(()=>{const y=new Set(transactions.map(t=>String(new Date(t.createdAt).getFullYear())));y.add(String(new Date().getFullYear()));return Array.from(y).sort().reverse();},[transactions]);
  const filtered=useMemo(()=>transactions.filter(t=>{
    const d=new Date(t.createdAt);
    return(filterMonth==="All"||d.getMonth()===parseInt(filterMonth))&&(filterYear==="All"||d.getFullYear()===parseInt(filterYear))&&(filterCat==="All"||t.category===filterCat)&&(search===""||t.description.toLowerCase().includes(search.toLowerCase())||t.category.toLowerCase().includes(search.toLowerCase())||(t.notes||"").toLowerCase().includes(search.toLowerCase()));
  }),[transactions,filterMonth,filterYear,filterCat,search]);
  const filteredIncome=useMemo(()=>filtered.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[filtered]);
  const filteredExpenses=useMemo(()=>filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[filtered]);
  const filteredNet=filteredIncome-filteredExpenses;
  const filteredRate=filteredIncome>0?(filteredNet/filteredIncome)*100:0;
  const expenseByCategory=useMemo(()=>{const map:Record<string,number>={};for(const t of filtered)if(t.type==="expense")map[t.category]=(map[t.category]??0)+t.amount;return Object.entries(map).sort((a,b)=>b[1]-a[1]);},[filtered]);
  const barChartData=useMemo(()=>{const iMap:Record<string,number>={},eMap:Record<string,number>={};for(const t of filtered){if(t.type==="income")iMap[t.category]=(iMap[t.category]??0)+t.amount;else eMap[t.category]=(eMap[t.category]??0)+t.amount;}const cats=Array.from(new Set([...Object.keys(iMap),...Object.keys(eMap)]));return{labels:cats,datasets:[{label:"Income",data:cats.map(c=>iMap[c]??0),backgroundColor:"#10b981",borderRadius:4},{label:"Expenses",data:cats.map(c=>eMap[c]??0),backgroundColor:"#f97316",borderRadius:4}]};},[filtered]);
  const donutData=useMemo(()=>({labels:expenseByCategory.map(([c])=>c),datasets:[{data:expenseByCategory.map(([,v])=>v),backgroundColor:expenseByCategory.map(([c])=>CATEGORY_COLORS[c]??"#6366f1"),borderWidth:0,hoverOffset:4}]}),[expenseByCategory]);
  const monthlyChartData=useMemo(()=>{
    const map:Record<string,{income:number;expenses:number}>={};
    for(const t of transactions){const d=new Date(t.createdAt);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;if(!map[key])map[key]={income:0,expenses:0};if(t.type==="income")map[key].income+=t.amount;else map[key].expenses+=t.amount;}
    const entries=Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).slice(-12);
    return{labels:entries.map(([k])=>{const[y,m]=k.split("-");return`${MONTHS[parseInt(m)-1]} ${y}`;}),income:entries.map(([,v])=>v.income),expenses:entries.map(([,v])=>v.expenses),net:entries.map(([,v])=>v.income-v.expenses),entries};
  },[transactions]);

  // No-spend streak
  const streakData=useMemo(()=>{
    const expenseDays=new Set(transactions.filter(t=>t.type==="expense").map(t=>isoDay(new Date(t.createdAt))));
    const today=new Date();let current=0,longest=0,temp=0;
    // Last 90 days
    const days90:Array<{day:string;hasSpend:boolean}>=[];
    for(let i=89;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const s=isoDay(d);days90.push({day:s,hasSpend:expenseDays.has(s)});}
    // Current streak (going backwards from today)
    for(let i=days90.length-1;i>=0;i--){if(!days90[i].hasSpend)current++;else break;}
    // Longest streak
    for(const {hasSpend} of days90){if(!hasSpend){temp++;longest=Math.max(longest,temp);}else temp=0;}
    return{days90,current,longest,expenseDays};
  },[transactions]);

  // Heatmap (90 days spend by day)
  const heatmapData=useMemo(()=>{
    const map:Record<string,number>={};
    for(const t of transactions)if(t.type==="expense"){const k=isoDay(new Date(t.createdAt));map[k]=(map[k]??0)+t.amount;}
    const max=Math.max(1,...Object.values(map));
    const today=new Date();const days:Array<{day:string;amount:number;intensity:number}>=[];
    for(let i=89;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const k=isoDay(d);const amt=map[k]??0;days.push({day:k,amount:amt,intensity:amt/max});}
    return{days,max};
  },[transactions]);

  function fmt(n:number){return currency+new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
  function fmtSym(n:number,sym:string){return sym+new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
  const thisMonthSpent=(cat:string)=>transactions.filter(t=>t.type==="expense"&&t.category===cat&&new Date(t.createdAt).getMonth()===new Date().getMonth()&&new Date(t.createdAt).getFullYear()===new Date().getFullYear()).reduce((s,t)=>s+t.amount,0);

  async function submit(type:"income"|"expense"){
    const amt=parseFloat(amount);if(!desc.trim()||isNaN(amt)||amt<=0)return;setSubmitting(true);
    try{await createTx.mutateAsync({data:{description:desc.trim(),amount:amt,category,type,notes,recurring}});await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});setDesc("");setAmount("");setNotes("");setRecurring(false);}finally{setSubmitting(false);}
  }
  async function handleDelete(id:number){await deleteTx.mutateAsync({id});await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});}
  function startEdit(t:Transaction){setEditId(t.id);setEditDesc(t.description);setEditAmount(String(t.amount));setEditCategory(t.category);setEditType(t.type);setEditNotes(t.notes||"");setEditRecurring(t.recurring||false);}
  async function saveEdit(){
    const amt=parseFloat(editAmount);if(!editDesc.trim()||isNaN(amt)||amt<=0||editId===null)return;setEditSubmitting(true);
    try{await deleteTx.mutateAsync({id:editId});await createTx.mutateAsync({data:{description:editDesc.trim(),amount:amt,category:editCategory,type:editType,notes:editNotes,recurring:editRecurring}});await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});setEditId(null);}finally{setEditSubmitting(false);}
  }
  function saveBudget(cat:string,val:string){const u={...budgets,[cat]:parseFloat(val)||0};setBudgets(u);localStorage.setItem("budgets",JSON.stringify(u));}
  function getBudgetStatus(cat:string,spent:number){const l=budgets[cat];if(!l||l<=0)return null;const p=spent/l*100;if(p>=100)return"over";if(p>=budgetAlertThreshold)return"warn";return"ok";}
  function saveGoals(g:Goal[]){setGoals(g);localStorage.setItem("goals",JSON.stringify(g));}
  function addGoal(){const t=parseFloat(goalTarget),s=parseFloat(goalSaved)||0;if(!goalName.trim()||isNaN(t)||t<=0)return;saveGoals([...goals,{id:Date.now().toString(),name:goalName.trim(),target:t,saved:s,color:goalColor}]);setGoalName("");setGoalTarget("");setGoalSaved("");setGoalColor(GOAL_COLORS[goals.length%GOAL_COLORS.length]);}
  function deleteGoal(id:string){saveGoals(goals.filter(g=>g.id!==id));}
  function addToSaved(id:string){const amt=parseFloat(addSavedAmt);if(isNaN(amt)||amt===0)return;saveGoals(goals.map(g=>g.id===id?{...g,saved:Math.max(0,g.saved+amt)}:g));setAddGoalSavedId(null);setAddSavedAmt("");}
  function exportCSV(all=false){const source=all?transactions:filtered;const rows=[["ID","Description","Amount","Category","Type","Notes","Recurring","Date"],...source.map(t=>[t.id,`"${t.description.replace(/"/g,'""')}"`,t.amount,t.category,t.type,`"${(t.notes||"").replace(/"/g,'""')}"`,t.recurring?"Yes":"No",formatDate(new Date(t.createdAt),dateFormat)])];const csv=rows.map(r=>r.join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=all?`all-transactions.csv`:`transactions-${filterYear}-${filterMonth==="All"?"all":MONTHS[parseInt(filterMonth)]}.csv`;a.click();URL.revokeObjectURL(url);}
  function exportJSON(){const blob=new Blob([JSON.stringify(transactions,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="all-transactions.json";a.click();URL.revokeObjectURL(url);}
  async function clearAllTransactions(){for(const t of transactions){try{await deleteTx.mutateAsync({id:t.id});}catch{}}await qc.invalidateQueries({queryKey:getGetTransactionsQueryKey()});await qc.invalidateQueries({queryKey:getGetStatsQueryKey()});setDangerConfirm(null);}
  function clearAllGoals(){saveGoals([]);setDangerConfirm(null);}

  const chartOpts=(yPrefix:string)=>({responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom" as const,labels:{color:dark?"#aaa":"#555",font:{size:10},boxWidth:10,padding:8}},tooltip:{backgroundColor:surface,borderColor:border,borderWidth:1,titleColor:text,bodyColor:muted,callbacks:{label:(ctx:any)=>` ${ctx.dataset.label}: ${yPrefix}${Number(ctx.parsed.y).toLocaleString()}`}}},scales:{x:{grid:{color:dark?"#1e1e1e":"#eee"},ticks:{color:dark?"#666":"#999",font:{size:10},maxRotation:isMobile?45:0}},y:{grid:{color:dark?"#1e1e1e":"#eee"},ticks:{color:dark?"#666":"#999",font:{size:10},callback:(v:any)=>`${yPrefix}${Number(v).toLocaleString()}`}}}});

  const mainTabs=[
    {id:"dashboard",label:"📊 Dashboard",short:"📊",shortLabel:"Home"},
    {id:"monthly",label:"📅 Monthly",short:"📅",shortLabel:"Monthly"},
    {id:"goals",label:"🎯 Goals",short:"🎯",shortLabel:"Goals"},
    {id:"converter",label:"💱 Converter",short:"💱",shortLabel:"Converter"},
    {id:"settings",label:"⚙️ Settings",short:"⚙️",shortLabel:"Settings"},
  ] as const;

  const extraTabs=[
    {id:"debts",label:"💳 Debt Tracker",short:"💳",shortLabel:"Debts"},
    {id:"bills",label:"🗓 Bill Calendar",short:"🗓",shortLabel:"Bills"},
    {id:"streak",label:"🔥 No-Spend Streak",short:"🔥",shortLabel:"Streak"},
    {id:"heatmap",label:"🌡 Heatmap",short:"🌡",shortLabel:"Heatmap"},
  ] as const;

  const allTabs=[...mainTabs,...extraTabs];
  const userName=user?.firstName||user?.primaryEmailAddress?.emailAddress?.split("@")[0]||"there";

  // Heatmap tooltip
  const [hoverDay,setHoverDay]=useState<string|null>(null);

  return(
    <div style={{minHeight:"100vh",background:bg,color:text,fontFamily:"'Inter',sans-serif",transition:"background 0.2s"}}>

      {/* Welcome Toast */}
      {showWelcome&&(
        <div style={{position:"fixed",top:"24px",left:"50%",transform:welcomeVisible?"translateX(-50%) translateY(0)":"translateX(-50%) translateY(-16px)",zIndex:9999,pointerEvents:"none",transition:"opacity 0.7s,transform 0.7s",opacity:welcomeVisible?1:0,width:"calc(100% - 48px)",maxWidth:"380px"}}>
          <div style={{background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",borderRadius:"16px",padding:"18px 24px",boxShadow:"0 8px 40px rgba(16,185,129,0.4)",textAlign:"center"}}>
            <div style={{fontSize:"26px",marginBottom:"6px"}}>👋</div>
            <div style={{fontSize:"17px",fontWeight:700,marginBottom:"4px"}}>Hello, {userName}!</div>
            <div style={{fontSize:"13px",opacity:0.9}}>Welcome to Trackify 💸</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{borderBottom:`1px solid ${border}`,padding:isMobile?"10px 16px":"14px 24px"}}>
        {isMobile?(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              <h1 style={{fontSize:"17px",fontWeight:700,margin:0}}>Finance tracker</h1>
              <span style={{background:"#10b981",color:"#fff",fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:"9999px"}}>JAYii's</span>
            </div>
            <button onClick={()=>setMobileMenuOpen(o=>!o)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"8px",color:text,cursor:"pointer",fontSize:"18px",padding:"6px 10px",lineHeight:1}}>{mobileMenuOpen?"✕":"☰"}</button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
            <h1 style={{fontSize:"20px",fontWeight:700,margin:0}}>Finance tracker</h1>
            <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
              <span style={{background:"#10b981",color:"#fff",fontSize:"11px",fontWeight:700,padding:"3px 10px",borderRadius:"9999px"}}>JAYii's Build</span>
              {user&&<span style={{fontSize:"12px",color:muted,maxWidth:"160px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.primaryEmailAddress?.emailAddress??user.fullName}</span>}
              <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,padding:"4px 8px",fontSize:"12px"}}>
                <option value="₱">₱ PHP</option><option value="$">$ USD</option><option value="€">€ EUR</option><option value="£">£ GBP</option><option value="¥">¥ JPY</option><option value="₩">₩ KRW</option><option value="A$">A$ AUD</option><option value="C$">C$ CAD</option>
              </select>
              <button onClick={()=>setDark(d=>!d)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"14px",padding:"4px 10px"}}>{dark?"☀️ Light":"🌙 Dark"}</button>
              <button onClick={()=>setShowBudgets(b=>!b)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"5px 12px"}}>Limit Budgets</button>
              <button onClick={()=>signOut({redirectUrl:`${window.location.origin}${basePath||"/"}`})} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"5px 12px"}}>Sign out</button>
            </div>
          </div>
        )}
        {isMobile&&mobileMenuOpen&&(
          <div style={{marginTop:"12px",display:"flex",flexDirection:"column",gap:"8px"}}>
            {user&&<div style={{fontSize:"12px",color:muted}}>{user.primaryEmailAddress?.emailAddress??user.fullName}</div>}
            <div style={{display:"flex",gap:"8px"}}>
              <select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,padding:"6px 10px",fontSize:"13px",flex:1}}>
                <option value="₱">₱ PHP</option><option value="$">$ USD</option><option value="€">€ EUR</option><option value="£">£ GBP</option><option value="¥">¥ JPY</option><option value="₩">₩ KRW</option><option value="A$">A$ AUD</option><option value="C$">C$ CAD</option>
              </select>
              <button onClick={()=>setDark(d=>!d)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"13px",padding:"6px 12px"}}>{dark?"☀️":"🌙"}</button>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={()=>{setShowBudgets(b=>!b);setMobileMenuOpen(false);}} style={{flex:1,background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px"}}>Limit Budgets</button>
              <button onClick={()=>signOut({redirectUrl:`${window.location.origin}${basePath||"/"}`})} style={{flex:1,background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px"}}>Sign out</button>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Nav */}
      {!isMobile&&(
        <div style={{borderBottom:`1px solid ${border}`,overflowX:"auto"}}>
          <div style={{display:"flex",padding:"0 24px",minWidth:"max-content"}}>
            {allTabs.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id as TabId)} style={{background:"none",border:"none",borderBottom:`2px solid ${activeTab===tab.id?"#10b981":"transparent"}`,color:activeTab===tab.id?"#10b981":muted,cursor:"pointer",fontSize:"13px",fontWeight:activeTab===tab.id?600:400,padding:"12px 16px",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Budget Panel */}
      {showBudgets&&(
        <div style={{background:surface,borderBottom:`1px solid ${border}`,padding:isMobile?"12px 16px":"16px 24px"}}>
          <div style={{maxWidth:"1100px",margin:"0 auto"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>MONTHLY BUDGET LIMITS</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(auto-fill,minmax(160px,1fr))",gap:"10px"}}>
              {CATEGORIES.filter(c=>["Housing","Food","Transport","Health","Shopping","Utilities"].includes(c)).map(cat=>{
                const spent=thisMonthSpent(cat);const limit=budgets[cat]||0;const status=getBudgetStatus(cat,spent);
                return(
                  <div key={cat} style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${status==="over"?"#ef4444":status==="warn"?"#f59e0b":border}`,borderRadius:"8px",padding:"10px"}}>
                    <div style={{fontSize:"11px",fontWeight:600,color:muted,marginBottom:"6px"}}>{cat}</div>
                    <input type="number" min="0" step="100" value={limit||""} placeholder="No limit" onChange={e=>saveBudget(cat,e.target.value)} style={{...inp,width:"100%",padding:"5px 8px",fontSize:"13px",marginBottom:"6px",boxSizing:"border-box"}}/>
                    {limit>0&&(<><div style={{height:"4px",background:dark?"#222":"#eee",borderRadius:"2px",overflow:"hidden",marginBottom:"4px"}}><div style={{width:`${Math.min(spent/limit*100,100)}%`,height:"100%",background:status==="over"?"#ef4444":status==="warn"?"#f59e0b":"#10b981",borderRadius:"2px"}}/></div><div style={{fontSize:"10px",color:status==="over"?"#ef4444":status==="warn"?"#f59e0b":muted}}>{fmt(spent)}/{fmt(limit)} {status==="over"?"⚠️":status==="warn"?"⚡":""}</div></>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"1100px",margin:"0 auto",padding:isMobile?"16px 12px 80px":"24px 20px"}}>

        {/* ── DASHBOARD TAB ── */}
        {activeTab==="dashboard"&&(<>
          {CATEGORIES.some(cat=>{const s=thisMonthSpent(cat);const st=getBudgetStatus(cat,s);return st==="over"||st==="warn";})&&(
            <div style={{background:dark?"#2a1a00":"#fff8e6",border:"1px solid #f59e0b",borderRadius:"8px",padding:"10px 14px",marginBottom:"14px",fontSize:"12px",color:"#f59e0b"}}>
              ⚠️ {CATEGORIES.filter(cat=>{const s=thisMonthSpent(cat);const st=getBudgetStatus(cat,s);return st==="over"||st==="warn";}).map(cat=>{const s=thisMonthSpent(cat);const st=getBudgetStatus(cat,s);return`${cat} ${st==="over"?"over budget":"near limit"}`;}).join(", ")}
            </div>
          )}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:isMobile?"12px":"14px 20px",marginBottom:"14px"}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr auto auto auto auto auto",gap:"8px",alignItems:"center"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{...inp,gridColumn:isMobile?"1/-1":"auto"}}/>
              <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={inp}><option value="All">All categories</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
              <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={inp}><option value="All">All months</option>{MONTHS.map((m,i)=><option key={m} value={String(i)}>{m}</option>)}</select>
              <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={inp}><option value="All">All years</option>{availableYears.map(y=><option key={y} value={y}>{y}</option>)}</select>
              <button onClick={()=>exportCSV(false)} style={{background:surface,border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px 12px",whiteSpace:"nowrap"}}>⬇ CSV</button>
              {(search||filterCat!=="All"||filterMonth!=="All")&&<button onClick={()=>{setSearch("");setFilterCat("All");setFilterMonth(String(new Date().getMonth()));}} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"12px",padding:"8px 10px"}}>✕</button>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:"10px",marginBottom:"16px"}}>
            <KpiCard label="TOTAL INCOME" value={fmt(filteredIncome)} sub={`${filtered.filter(t=>t.type==="income").length} entries`} valueColor="#10b981" surface={surface} border={border} muted={muted} compact={isMobile}/>
            <KpiCard label="TOTAL EXPENSES" value={fmt(filteredExpenses)} sub={`${filtered.filter(t=>t.type==="expense").length} entries`} valueColor="#ef4444" surface={surface} border={border} muted={muted} compact={isMobile}/>
            <KpiCard label="NET BALANCE" value={fmt(filteredNet)} sub={filteredNet>=0?"surplus":"deficit"} valueColor={filteredNet>=0?"#10b981":"#ef4444"} surface={surface} border={border} muted={muted} compact={isMobile}/>
            <KpiCard label="SAVINGS RATE" value={filteredIncome>0?`${filteredRate.toFixed(1)}%`:"—"} sub="of income saved" valueColor={filteredRate>=20?"#10b981":filteredRate>0?"#f97316":"#ef4444"} surface={surface} border={border} muted={muted} compact={isMobile}/>
          </div>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:isMobile?"14px":"16px 20px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ ADD TRANSACTION</div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Description" style={{...inp,width:"100%",boxSizing:"border-box"}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder={`Amount (${currency})`} style={inp}/>
                <select value={category} onChange={e=>setCategory(e.target.value)} style={inp}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <button onClick={()=>submit("income")} disabled={submitting} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"10px",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>↑ Income</button>
                <button onClick={()=>submit("expense")} disabled={submitting} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"10px",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>↓ Expense</button>
              </div>
              <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="📝 Notes (optional)" style={{...inp,width:"100%",boxSizing:"border-box"}}/>
              <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:muted,cursor:"pointer"}}><input type="checkbox" checked={recurring} onChange={e=>setRecurring(e.target.checked)} style={{accentColor:"#10b981"}}/>🔁 Recurring</label>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"14px",marginBottom:"14px"}}>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>INCOME VS EXPENSES</div>
              {filtered.length===0?<EmptyState dark={dark}/>:<div style={{height:isMobile?"180px":"200px",position:"relative"}}><Bar data={barChartData} options={chartOpts(currency)}/></div>}
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>EXPENSE BREAKDOWN</div>
              {expenseByCategory.length===0?<EmptyState text="No expenses yet" dark={dark}/>:<div style={{height:isMobile?"180px":"200px",position:"relative"}}><Doughnut data={donutData} options={{responsive:true,maintainAspectRatio:false,cutout:"65%",plugins:{legend:{position:"bottom",labels:{color:dark?"#aaa":"#555",font:{size:10},boxWidth:10,padding:8}},tooltip:{callbacks:{label:(ctx:any)=>` ${ctx.label}: ${fmt(ctx.parsed)}`},backgroundColor:surface,borderColor:border,borderWidth:1,titleColor:text,bodyColor:muted}}}}/></div>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"14px"}}>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>RECENT TRANSACTIONS {filtered.length>0&&<span style={{fontWeight:400}}>({filtered.length})</span>}</div>
              {filtered.length===0?<p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"24px 0"}}>No transactions found</p>:(
                <div style={{display:"flex",flexDirection:"column",gap:"8px",maxHeight:"420px",overflowY:"auto"}}>
                  {filtered.slice(0,20).map(t=>(
                    <div key={t.id}>
                      {editId===t.id?(
                        <div style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"6px",padding:"10px"}}>
                          <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"8px"}}>
                            <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} style={{...inp,fontSize:"13px",padding:"6px 10px",width:"100%",boxSizing:"border-box"}}/>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px"}}>
                              <input value={editAmount} onChange={e=>setEditAmount(e.target.value)} type="number" min="0" step="0.01" style={{...inp,fontSize:"13px",padding:"6px 10px"}}/>
                              <select value={editType} onChange={e=>setEditType(e.target.value as "income"|"expense")} style={{...inp,fontSize:"13px",padding:"6px 10px"}}><option value="income">Income</option><option value="expense">Expense</option></select>
                            </div>
                            <select value={editCategory} onChange={e=>setEditCategory(e.target.value)} style={{...inp,fontSize:"13px",padding:"6px 10px",width:"100%"}}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
                          </div>
                          <input value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="📝 Notes" style={{...inp,width:"100%",fontSize:"13px",padding:"6px 10px",marginBottom:"8px",boxSizing:"border-box"}}/>
                          <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                            <label style={{display:"flex",alignItems:"center",gap:"4px",fontSize:"12px",color:muted,cursor:"pointer"}}><input type="checkbox" checked={editRecurring} onChange={e=>setEditRecurring(e.target.checked)} style={{accentColor:"#10b981"}}/>🔁</label>
                            <button onClick={saveEdit} disabled={editSubmitting} style={{background:"#10b981",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"12px",padding:"6px 14px"}}>Save</button>
                            <button onClick={()=>setEditId(null)} style={{background:dark?"#333":"#eee",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"12px",padding:"6px 12px"}}>Cancel</button>
                          </div>
                        </div>
                      ):(
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"8px 10px",background:dark?"#111":"#f9f9f9",borderRadius:"6px",border:`1px solid ${t.recurring?"#10b981":border}`,gap:"8px"}}>
                          <div style={{display:"flex",flexDirection:"column",gap:"2px",flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:"6px"}}><span style={{fontSize:"13px",fontWeight:500,color:text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.description}</span>{t.recurring&&<span style={{fontSize:"10px",background:"rgba(16,185,129,0.15)",color:"#10b981",padding:"1px 5px",borderRadius:"9999px",flexShrink:0}}>🔁</span>}</div>
                            <span style={{fontSize:"11px",color:muted}}>{t.category} · {timeSince(new Date(t.createdAt))}</span>
                            {t.notes&&<span style={{fontSize:"11px",color:muted,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📝 {t.notes}</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:"4px",flexShrink:0}}>
                            <span style={{fontSize:"13px",fontWeight:600,color:t.type==="income"?"#10b981":"#ef4444"}}>{t.type==="income"?"+":"-"}{fmt(t.amount)}</span>
                            <button onClick={()=>startEdit(t)} style={{background:"none",border:"none",color:muted,cursor:"pointer",fontSize:"13px",padding:"2px 4px"}}>✎</button>
                            {confirmDelete===t.id?(
                              <div style={{display:"flex",gap:"4px"}}>
                                <button onClick={()=>{handleDelete(t.id);setConfirmDelete(null);}} style={{background:"#ef4444",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"11px",padding:"2px 8px"}}>✓</button>
                                <button onClick={()=>setConfirmDelete(null)} style={{background:dark?"#333":"#ddd",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"11px",padding:"2px 8px"}}>✕</button>
                              </div>
                            ):(
                              <button onClick={()=>setConfirmDelete(t.id)} style={{background:"none",border:"none",color:muted,cursor:"pointer",fontSize:"16px",padding:"2px 4px",lineHeight:1}}>×</button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>SPENDING BY CATEGORY</div>
              {expenseByCategory.length===0?<p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"24px 0"}}>No expenses yet</p>:(
                <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                  {expenseByCategory.map(([cat,val])=>{
                    const pct=filteredExpenses>0?(val/filteredExpenses)*100:0;const color=CATEGORY_COLORS[cat]??"#6366f1";const limit=budgets[cat];const status=getBudgetStatus(cat,val);
                    return(<div key={cat}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontSize:"12px",color:text}}>{cat} {status==="over"?"⚠️":status==="warn"?"⚡":""}</span><span style={{fontSize:"12px",color:muted}}>{fmt(val)}{limit?` / ${fmt(limit)}`:""} ({pct.toFixed(0)}%)</span></div><div style={{height:"6px",background:dark?"#222":"#eee",borderRadius:"3px",overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:status==="over"?"#ef4444":status==="warn"?"#f59e0b":color,borderRadius:"3px",transition:"width 0.3s"}}/></div></div>);
                  })}
                </div>
              )}
            </div>
          </div>
        </>)}

        {/* ── MONTHLY TAB ── */}
        {activeTab==="monthly"&&(<>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:"10px",marginBottom:"16px"}}>
            {monthlyChartData.entries.length>0&&(()=>{
              const last=monthlyChartData.entries[monthlyChartData.entries.length-1][1];const prev=monthlyChartData.entries.length>1?monthlyChartData.entries[monthlyChartData.entries.length-2][1]:null;
              const net=last.income-last.expenses;const rate=last.income>0?(net/last.income)*100:0;
              const incDiff=prev&&prev.income>0?((last.income-prev.income)/prev.income)*100:null;const expDiff=prev&&prev.expenses>0?((last.expenses-prev.expenses)/prev.expenses)*100:null;
              return(<><KpiCard label="THIS MONTH INCOME" value={fmt(last.income)} sub={incDiff!==null?`${incDiff>=0?"▲":"▼"} ${Math.abs(incDiff).toFixed(1)}% vs last`:"First month"} valueColor="#10b981" surface={surface} border={border} muted={muted} compact={isMobile}/><KpiCard label="THIS MONTH EXPENSES" value={fmt(last.expenses)} sub={expDiff!==null?`${expDiff>=0?"▲":"▼"} ${Math.abs(expDiff).toFixed(1)}% vs last`:"First month"} valueColor="#ef4444" surface={surface} border={border} muted={muted} compact={isMobile}/><KpiCard label="THIS MONTH NET" value={fmt(net)} sub={net>=0?"surplus":"deficit"} valueColor={net>=0?"#10b981":"#ef4444"} surface={surface} border={border} muted={muted} compact={isMobile}/><KpiCard label="SAVINGS RATE" value={last.income>0?`${rate.toFixed(1)}%`:"—"} sub="this month" valueColor={rate>=20?"#10b981":rate>0?"#f97316":"#ef4444"} surface={surface} border={border} muted={muted} compact={isMobile}/></>);
            })()}
          </div>
          {monthlyChartData.labels.length===0?<div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"60px 20px",textAlign:"center",color:muted}}>No transaction history yet.</div>:(<>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"14px"}}><div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>INCOME VS EXPENSES — LAST 12 MONTHS</div><div style={{height:isMobile?"200px":"260px",position:"relative"}}><Bar data={{labels:monthlyChartData.labels,datasets:[{label:"Income",data:monthlyChartData.income,backgroundColor:"#10b981",borderRadius:4},{label:"Expenses",data:monthlyChartData.expenses,backgroundColor:"#f97316",borderRadius:4}]}} options={chartOpts(currency)}/></div></div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"14px"}}><div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>NET BALANCE TREND</div><div style={{height:isMobile?"180px":"220px",position:"relative"}}><Line data={{labels:monthlyChartData.labels,datasets:[{label:"Net balance",data:monthlyChartData.net,borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,0.1)",fill:true,tension:0.4,pointBackgroundColor:"#3b82f6",pointRadius:4}]}} options={chartOpts(currency)}/></div></div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}><div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>MONTHLY BREAKDOWN</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:isMobile?"12px":"13px",minWidth:"400px"}}><thead><tr style={{borderBottom:`1px solid ${border}`}}>{["Month","Income","Expenses","Net","Rate"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",color:muted,fontWeight:600,fontSize:"11px"}}>{h}</th>)}</tr></thead><tbody>{[...monthlyChartData.entries].reverse().map(([key,v],i)=>{const[yr,mo]=key.split("-");const net=v.income-v.expenses;const rate=v.income>0?(net/v.income)*100:0;return(<tr key={key} style={{borderBottom:`1px solid ${border}`,background:i%2===0?"transparent":dark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)"}}><td style={{padding:"8px 10px",color:text,whiteSpace:"nowrap"}}>{MONTHS[parseInt(mo)-1]} {yr}</td><td style={{padding:"8px 10px",color:"#10b981",whiteSpace:"nowrap"}}>{fmt(v.income)}</td><td style={{padding:"8px 10px",color:"#ef4444",whiteSpace:"nowrap"}}>{fmt(v.expenses)}</td><td style={{padding:"8px 10px",color:net>=0?"#10b981":"#ef4444",whiteSpace:"nowrap"}}>{fmt(net)}</td><td style={{padding:"8px 10px",color:rate>=20?"#10b981":rate>0?"#f97316":"#ef4444",whiteSpace:"nowrap"}}>{v.income>0?`${rate.toFixed(1)}%`:"—"}</td></tr>);})}</tbody></table></div></div>
          </>)}
        </>)}

        {/* ── GOALS TAB ── */}
        {activeTab==="goals"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ NEW SAVINGS GOAL</div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              <input value={goalName} onChange={e=>setGoalName(e.target.value)} placeholder="Goal name" style={{...inp,width:"100%",boxSizing:"border-box"}}/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                <input value={goalTarget} onChange={e=>setGoalTarget(e.target.value)} type="number" min="0" step="100" placeholder={`Target (${currency})`} style={inp}/>
                <input value={goalSaved} onChange={e=>setGoalSaved(e.target.value)} type="number" min="0" step="100" placeholder="Already saved" style={inp}/>
              </div>
              <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:"12px",color:muted}}>Color:</span>{GOAL_COLORS.map(c=><button key={c} onClick={()=>setGoalColor(c)} style={{width:"22px",height:"22px",borderRadius:"50%",background:c,border:goalColor===c?"3px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}</div>
              <button onClick={addGoal} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"10px",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>Add goal</button>
            </div>
          </div>
          {goals.length===0?<div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"60px 20px",textAlign:"center",color:muted}}>No goals yet!</div>:(
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(300px,1fr))",gap:"14px"}}>
              {goals.map(g=>{const pct=g.target>0?Math.min(g.saved/g.target*100,100):0;const remaining=Math.max(g.target-g.saved,0);const done=g.saved>=g.target;return(
                <div key={g.id} style={{background:surface,border:`1px solid ${done?"#10b981":border}`,borderRadius:"10px",padding:"18px",position:"relative"}}>
                  {done&&<div style={{position:"absolute",top:"12px",right:"12px",background:"rgba(16,185,129,0.15)",color:"#10b981",fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"9999px"}}>✓ Done!</div>}
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"12px"}}><div style={{width:"12px",height:"12px",borderRadius:"50%",background:g.color}}/><span style={{fontSize:"15px",fontWeight:600,color:text}}>{g.name}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}><span style={{fontSize:"13px",color:muted}}>Saved</span><span style={{fontSize:"13px",fontWeight:600,color:g.color}}>{fmt(g.saved)} <span style={{color:muted,fontWeight:400}}>/ {fmt(g.target)}</span></span></div>
                  <div style={{height:"10px",background:dark?"#222":"#eee",borderRadius:"5px",overflow:"hidden",marginBottom:"8px"}}><div style={{width:`${pct}%`,height:"100%",background:g.color,borderRadius:"5px",transition:"width 0.4s"}}/></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"14px"}}><span style={{fontSize:"12px",color:muted}}>{pct.toFixed(1)}%</span><span style={{fontSize:"12px",color:muted}}>{remaining>0?`${fmt(remaining)} to go`:"🎉 Reached!"}</span></div>
                  {addGoalSavedId===g.id?(<div style={{display:"flex",gap:"6px",marginBottom:"10px"}}><input value={addSavedAmt} onChange={e=>setAddSavedAmt(e.target.value)} type="number" step="any" placeholder="Amount (+/-)" style={{...inp,flex:1,fontSize:"13px",padding:"6px 10px"}}/><button onClick={()=>addToSaved(g.id)} style={{background:"#10b981",border:"none",borderRadius:"4px",color:"#fff",cursor:"pointer",fontSize:"12px",padding:"6px 12px"}}>Add</button><button onClick={()=>{setAddGoalSavedId(null);setAddSavedAmt("");}} style={{background:dark?"#333":"#eee",border:"none",borderRadius:"4px",color:muted,cursor:"pointer",fontSize:"12px",padding:"6px 10px"}}>✕</button></div>):(<button onClick={()=>{setAddGoalSavedId(g.id);setAddSavedAmt("");}} style={{background:"none",border:`1px solid ${g.color}`,borderRadius:"6px",color:g.color,cursor:"pointer",fontSize:"12px",padding:"8px",width:"100%",marginBottom:"8px"}}>+ Update saved amount</button>)}
                  <button onClick={()=>deleteGoal(g.id)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"11px",padding:"6px",width:"100%"}}>Delete</button>
                </div>
              );})}
            </div>
          )}
        </>)}

        {/* ── CONVERTER TAB ── */}
        {activeTab==="converter"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"14px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>LIVE CURRENCY CONVERTER {ratesLoading&&<span style={{color:"#f59e0b",fontWeight:400}}>— loading...</span>}{!ratesLoading&&Object.keys(rates).length>0&&<span style={{color:"#10b981",fontWeight:400}}>— updated</span>}</div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"20px"}}>
              <div><label style={{fontSize:"11px",color:muted,display:"block",marginBottom:"4px"}}>Amount</label><input value={convertAmt} onChange={e=>setConvertAmt(e.target.value)} type="number" min="0" placeholder="Enter amount" style={{...inp,fontSize:"18px",padding:"12px 16px",fontWeight:500,width:"100%",boxSizing:"border-box"}}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"8px",alignItems:"end"}}>
                <div><label style={{fontSize:"11px",color:muted,display:"block",marginBottom:"4px"}}>From</label><select value={convertFrom} onChange={e=>setConvertFrom(e.target.value)} style={{...inp,width:"100%"}}>{ALL_CURRENCIES.map(c=><option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}</select></div>
                <button onClick={()=>{const t=convertFrom;setConvertFrom(convertTo);setConvertTo(t);}} style={{background:"none",border:`1px solid ${border}`,borderRadius:"50%",width:"36px",height:"36px",color:muted,cursor:"pointer",fontSize:"18px",display:"flex",alignItems:"center",justifyContent:"center"}}>⇄</button>
                <div><label style={{fontSize:"11px",color:muted,display:"block",marginBottom:"4px"}}>To</label><select value={convertTo} onChange={e=>setConvertTo(e.target.value)} style={{...inp,width:"100%"}}>{ALL_CURRENCIES.map(c=><option key={c} value={c}>{CURRENCY_SYMBOLS[c]} {c}</option>)}</select></div>
              </div>
            </div>
            {convertAmt&&rates[convertFrom]&&rates[convertTo]?(<div style={{background:dark?"#0a0a0a":"#f0fdf4",border:"1px solid #10b981",borderRadius:"12px",padding:"20px",textAlign:"center"}}><div style={{fontSize:"13px",color:muted,marginBottom:"8px"}}>{convertAmt} {convertFrom} =</div><div style={{fontSize:isMobile?"28px":"36px",fontWeight:700,color:"#10b981"}}>{fmtSym(parseFloat(convertAmt)/rates[convertFrom]*rates[convertTo],CURRENCY_SYMBOLS[convertTo]||"")} {convertTo}</div><div style={{fontSize:"12px",color:muted,marginTop:"8px"}}>1 {convertFrom} = {(rates[convertTo]/rates[convertFrom]).toFixed(6)} {convertTo}</div></div>):(<div style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"12px",padding:"28px",textAlign:"center",color:muted}}>{Object.keys(rates).length===0?"Loading exchange rates...":"Enter an amount to convert"}</div>)}
          </div>
          {Object.keys(rates).length>0&&(<div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}><div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>QUICK REFERENCE — 1 {convertFrom}</div><div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(auto-fill,minmax(140px,1fr))",gap:"8px"}}>{ALL_CURRENCIES.filter(c=>c!==convertFrom).map(c=>(<div key={c} style={{background:dark?"#111":"#f9f9f9",border:`1px solid ${border}`,borderRadius:"8px",padding:"10px",cursor:"pointer"}} onClick={()=>setConvertTo(c)}><div style={{fontSize:"11px",color:muted,marginBottom:"4px"}}>{CURRENCY_SYMBOLS[c]} {c}</div><div style={{fontSize:"15px",fontWeight:600,color:text}}>{(rates[c]/rates[convertFrom]).toFixed(4)}</div></div>))}</div></div>)}
        </>)}

        {/* ── DEBT TRACKER TAB ── */}
        {activeTab==="debts"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ ADD DEBT</div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"8px"}}>
                <input value={debtName} onChange={e=>setDebtName(e.target.value)} placeholder="Debt name (e.g. Car loan)" style={{...inp,boxSizing:"border-box"}}/>
                <select value={debtType} onChange={e=>setDebtType(e.target.value as Debt["type"])} style={inp}><option value="loan">🏦 Loan</option><option value="credit_card">💳 Credit Card</option><option value="other">📋 Other</option></select>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:"8px"}}>
                <input value={debtTotal} onChange={e=>setDebtTotal(e.target.value)} type="number" min="0" step="100" placeholder={`Total (${currency})`} style={inp}/>
                <input value={debtRemaining} onChange={e=>setDebtRemaining(e.target.value)} type="number" min="0" step="100" placeholder="Remaining" style={inp}/>
                <input value={debtRate} onChange={e=>setDebtRate(e.target.value)} type="number" min="0" step="0.1" placeholder="Interest % p.a." style={inp}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"8px"}}>
                <div><label style={{fontSize:"11px",color:muted,display:"block",marginBottom:"4px"}}>Due date (optional)</label><input value={debtDue} onChange={e=>setDebtDue(e.target.value)} type="date" style={{...inp,width:"100%",boxSizing:"border-box"}}/></div>
                <div><label style={{fontSize:"11px",color:muted,display:"block",marginBottom:"4px"}}>Color</label><div style={{display:"flex",gap:"6px",flexWrap:"wrap",paddingTop:"6px"}}>{GOAL_COLORS.map(c=><button key={c} onClick={()=>setDebtColor(c)} style={{width:"22px",height:"22px",borderRadius:"50%",background:c,border:debtColor===c?"3px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}</div></div>
              </div>
              <button onClick={addDebt} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"10px",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>Add debt</button>
            </div>
          </div>

          {debts.length===0?<div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"60px 20px",textAlign:"center",color:muted}}>No debts tracked — great! Add one above if you have loans or credit cards.</div>:(
            <>
              {/* Summary KPIs */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:"10px",marginBottom:"16px"}}>
                <KpiCard label="TOTAL OWED" value={fmt(debts.reduce((s,d)=>s+d.remaining,0))} sub={`${debts.length} debt${debts.length!==1?"s":""}`} valueColor="#ef4444" surface={surface} border={border} muted={muted} compact={isMobile}/>
                <KpiCard label="ORIGINAL TOTAL" value={fmt(debts.reduce((s,d)=>s+d.totalAmount,0))} sub="combined" valueColor="#f97316" surface={surface} border={border} muted={muted} compact={isMobile}/>
                <KpiCard label="PAID OFF" value={fmt(debts.reduce((s,d)=>s+(d.totalAmount-d.remaining),0))} sub={`${((debts.reduce((s,d)=>s+(d.totalAmount-d.remaining),0)/Math.max(debts.reduce((s,d)=>s+d.totalAmount,0),1))*100).toFixed(1)}% of total`} valueColor="#10b981" surface={surface} border={border} muted={muted} compact={isMobile}/>
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                {debts.map(d=>{
                  const pct=d.totalAmount>0?Math.max(0,Math.min(100,(1-d.remaining/d.totalAmount)*100)):0;
                  const paid=d.remaining<=0;
                  const typeLabel=d.type==="credit_card"?"💳 Credit Card":d.type==="loan"?"🏦 Loan":"📋 Other";
                  const dueDate=d.dueDate?new Date(d.dueDate):null;
                  const daysLeft=dueDate?Math.ceil((dueDate.getTime()-Date.now())/86400000):null;
                  return(
                    <div key={d.id} style={{background:surface,border:`1px solid ${paid?"#10b981":daysLeft!==null&&daysLeft<30?"#ef4444":border}`,borderRadius:"10px",padding:"18px"}}>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                          <div style={{width:"12px",height:"12px",borderRadius:"50%",background:d.color,flexShrink:0}}/>
                          <div>
                            <div style={{fontSize:"15px",fontWeight:600,color:text}}>{d.name}</div>
                            <div style={{fontSize:"11px",color:muted}}>{typeLabel}{d.interestRate>0?` · ${d.interestRate}% p.a.`:""}</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:"16px",fontWeight:700,color:paid?"#10b981":"#ef4444"}}>{fmt(d.remaining)}<span style={{fontSize:"12px",fontWeight:400,color:muted}}> / {fmt(d.totalAmount)}</span></div>
                          {dueDate&&<div style={{fontSize:"11px",color:daysLeft!==null&&daysLeft<30?"#ef4444":muted}}>{daysLeft!==null&&daysLeft<0?"Overdue":daysLeft===0?"Due today":`Due in ${daysLeft}d`} · {dueDate.toLocaleDateString()}</div>}
                        </div>
                      </div>
                      <div style={{height:"10px",background:dark?"#222":"#eee",borderRadius:"5px",overflow:"hidden",marginBottom:"8px"}}><div style={{width:`${pct}%`,height:"100%",background:paid?"#10b981":d.color,borderRadius:"5px",transition:"width 0.4s"}}/></div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"14px"}}><span style={{fontSize:"12px",color:muted}}>{pct.toFixed(1)}% paid off</span><span style={{fontSize:"12px",color:muted}}>{paid?"🎉 Fully paid!":`${fmt(d.totalAmount-d.remaining)} paid`}</span></div>
                      {d.payments.length>0&&<div style={{fontSize:"11px",color:muted,marginBottom:"10px"}}>Last payment: {fmt(d.payments[d.payments.length-1].amount)} on {d.payments[d.payments.length-1].date}</div>}
                      {!paid&&(payDebtId===d.id?(
                        <div style={{display:"flex",gap:"6px",alignItems:"center",marginBottom:"10px"}}>
                          <input value={payAmt} onChange={e=>setPayAmt(e.target.value)} type="number" min="0" step="100" placeholder={`Payment (${currency})`} style={{...inp,flex:1,fontSize:"13px",padding:"6px 10px"}}/>
                          <button onClick={()=>payDebt(d.id)} style={{background:"#10b981",border:"none",borderRadius:"6px",color:"#fff",cursor:"pointer",fontSize:"13px",padding:"6px 14px",fontWeight:600}}>Log</button>
                          <button onClick={()=>{setPayDebtId(null);setPayAmt("");}} style={{background:dark?"#333":"#eee",border:"none",borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"13px",padding:"6px 12px"}}>✕</button>
                        </div>
                      ):(
                        <button onClick={()=>{setPayDebtId(d.id);setPayAmt("");}} style={{background:"none",border:`1px solid ${d.color}`,borderRadius:"6px",color:d.color,cursor:"pointer",fontSize:"12px",padding:"8px",width:"100%",marginBottom:"8px",fontWeight:600}}>💸 Log a payment</button>
                      ))}
                      <button onClick={()=>deleteDebt(d.id)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,cursor:"pointer",fontSize:"11px",padding:"6px",width:"100%"}}>Delete</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>)}

        {/* ── BILL CALENDAR TAB ── */}
        {activeTab==="bills"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>+ ADD BILL</div>
            <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"8px"}}>
                <input value={billName} onChange={e=>setBillName(e.target.value)} placeholder="Bill name (e.g. Netflix)" style={{...inp,boxSizing:"border-box"}}/>
                <input value={billAmount} onChange={e=>setBillAmount(e.target.value)} type="number" min="0" step="0.01" placeholder={`Amount (${currency})`} style={inp}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:"8px"}}>
                <div><label style={{fontSize:"11px",color:muted,display:"block",marginBottom:"4px"}}>Due day of month</label><input value={billDay} onChange={e=>setBillDay(e.target.value)} type="number" min="1" max="31" style={inp}/></div>
                <select value={billCat} onChange={e=>setBillCat(e.target.value)} style={{...inp,alignSelf:"end"}}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select>
                <select value={billRec} onChange={e=>setBillRec(e.target.value as Bill["recurrence"])} style={{...inp,alignSelf:"end"}}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select>
              </div>
              <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:"12px",color:muted}}>Color:</span>{GOAL_COLORS.map(c=><button key={c} onClick={()=>setBillColor(c)} style={{width:"22px",height:"22px",borderRadius:"50%",background:c,border:billColor===c?"3px solid #fff":"2px solid transparent",cursor:"pointer"}}/>)}</div>
              <button onClick={addBill} style={{background:"#3b82f6",color:"#fff",border:"none",borderRadius:"6px",padding:"10px",fontSize:"14px",fontWeight:600,cursor:"pointer"}}>Add bill</button>
            </div>
          </div>

          {bills.length===0?<div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"60px 20px",textAlign:"center",color:muted}}>No bills yet — add recurring bills to track them on the calendar.</div>:(<>
            {/* Month nav */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
              <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{background:surface,border:`1px solid ${border}`,borderRadius:"8px",color:text,cursor:"pointer",padding:"8px 14px",fontSize:"16px"}}>‹</button>
              <div style={{fontSize:"16px",fontWeight:700,color:text}}>{MONTHS_FULL[calMonth]} {calYear}</div>
              <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{background:surface,border:`1px solid ${border}`,borderRadius:"8px",color:text,cursor:"pointer",padding:"8px 14px",fontSize:"16px"}}>›</button>
            </div>

            {/* Calendar grid */}
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",overflow:"hidden",marginBottom:"16px"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:`1px solid ${border}`}}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{padding:"8px 4px",textAlign:"center",fontSize:"11px",fontWeight:700,color:muted}}>{isMobile?d.slice(0,1):d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                {Array.from({length:calDays.first}).map((_,i)=><div key={`e${i}`} style={{borderRight:`1px solid ${border}`,borderBottom:`1px solid ${border}`,minHeight:isMobile?"50px":"70px"}}/>)}
                {Array.from({length:calDays.total}).map((_,i)=>{
                  const day=i+1;const dayBills=billsOnDay(day);const status=dayStatus(day,dayBills);const isToday=new Date().getDate()===day&&new Date().getMonth()===calMonth&&new Date().getFullYear()===calYear;
                  return(
                    <div key={day} style={{borderRight:`1px solid ${border}`,borderBottom:`1px solid ${border}`,minHeight:isMobile?"50px":"70px",padding:"4px",background:isToday?dark?"rgba(16,185,129,0.08)":"rgba(16,185,129,0.05)":"transparent",position:"relative"}}>
                      <div style={{fontSize:"11px",fontWeight:isToday?700:400,color:isToday?"#10b981":text,marginBottom:"4px"}}>{day}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                        {dayBills.slice(0,isMobile?1:3).map(b=>(
                          <div key={b.id} onClick={()=>toggleBillPaid(b.id)} title={`${b.name} — ${fmt(b.amount)}`} style={{background:b.paid?"rgba(16,185,129,0.15)":status.type==="over"?"rgba(239,68,68,0.15)":status.type==="soon"?"rgba(245,158,11,0.15)":`${b.color}22`,borderLeft:`2px solid ${b.paid?"#10b981":status.type==="over"?"#ef4444":status.type==="soon"?"#f59e0b":b.color}`,borderRadius:"2px",padding:"1px 4px",fontSize:"9px",color:text,cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:b.paid?"line-through":"none"}}>
                            {b.name}
                          </div>
                        ))}
                        {dayBills.length>3&&!isMobile&&<div style={{fontSize:"9px",color:muted}}>+{dayBills.length-3} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bills list */}
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
              <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>ALL BILLS · {fmt(bills.reduce((s,b)=>s+b.amount,0))}/mo total</div>
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {bills.sort((a,b)=>a.dueDay-b.dueDay).map(b=>(
                  <div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:dark?"#111":"#f9f9f9",borderRadius:"8px",border:`1px solid ${b.paid?"#10b981":border}`,gap:"8px",flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",flex:1,minWidth:0}}>
                      <div style={{width:"10px",height:"10px",borderRadius:"50%",background:b.color,flexShrink:0}}/>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:"13px",fontWeight:500,color:text,textDecoration:b.paid?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</div>
                        <div style={{fontSize:"11px",color:muted}}>Day {b.dueDay} · {b.category} · {b.recurrence}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"8px",flexShrink:0}}>
                      <span style={{fontSize:"13px",fontWeight:600,color:text}}>{fmt(b.amount)}</span>
                      <button onClick={()=>toggleBillPaid(b.id)} style={{background:b.paid?"#10b981":"none",border:`1px solid ${b.paid?"#10b981":border}`,borderRadius:"6px",color:b.paid?"#fff":muted,cursor:"pointer",fontSize:"11px",padding:"4px 10px"}}>{b.paid?"✓ Paid":"Mark paid"}</button>
                      <button onClick={()=>deleteBill(b.id)} style={{background:"none",border:"none",color:muted,cursor:"pointer",fontSize:"16px",lineHeight:1}}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>)}
        </>)}

        {/* ── NO-SPEND STREAK TAB ── */}
        {activeTab==="streak"&&(<>
          {/* Hero stats */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(3,1fr)",gap:"12px",marginBottom:"20px"}}>
            <div style={{background:surface,border:`2px solid ${streakData.current>0?"#10b981":border}`,borderRadius:"14px",padding:"20px",textAlign:"center"}}>
              <div style={{fontSize:"40px",marginBottom:"6px"}}>{streakData.current>0?"🔥":"💤"}</div>
              <div style={{fontSize:isMobile?"28px":"36px",fontWeight:800,color:streakData.current>0?"#10b981":muted}}>{streakData.current}</div>
              <div style={{fontSize:"12px",color:muted,fontWeight:600,letterSpacing:"0.05em"}}>CURRENT STREAK</div>
              <div style={{fontSize:"11px",color:muted,marginTop:"4px"}}>no-spend days</div>
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"14px",padding:"20px",textAlign:"center"}}>
              <div style={{fontSize:"40px",marginBottom:"6px"}}>🏆</div>
              <div style={{fontSize:isMobile?"28px":"36px",fontWeight:800,color:"#f59e0b"}}>{streakData.longest}</div>
              <div style={{fontSize:"12px",color:muted,fontWeight:600,letterSpacing:"0.05em"}}>LONGEST STREAK</div>
              <div style={{fontSize:"11px",color:muted,marginTop:"4px"}}>last 90 days</div>
            </div>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"14px",padding:"20px",textAlign:"center",gridColumn:isMobile?"1/-1":"auto"}}>
              <div style={{fontSize:"40px",marginBottom:"6px"}}>📅</div>
              <div style={{fontSize:isMobile?"28px":"36px",fontWeight:800,color:"#3b82f6"}}>{streakData.days90.filter(d=>!d.hasSpend).length}</div>
              <div style={{fontSize:"12px",color:muted,fontWeight:600,letterSpacing:"0.05em"}}>NO-SPEND DAYS</div>
              <div style={{fontSize:"11px",color:muted,marginTop:"4px"}}>out of last 90</div>
            </div>
          </div>

          {/* 90-day mini calendar */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"16px"}}>LAST 90 DAYS</div>
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {streakData.days90.map(({day,hasSpend},i)=>{
                const d=new Date(day);const isToday=isoDay(new Date())===day;
                return(
                  <div key={day} title={`${d.toLocaleDateString()}: ${hasSpend?"Spent":"No spend"}`} style={{width:isMobile?"10px":"14px",height:isMobile?"10px":"14px",borderRadius:"3px",background:hasSpend?dark?"#7f1d1d":"#fee2e2":dark?"#064e3b":"#d1fae5",border:isToday?"2px solid #10b981":"none",boxSizing:"border-box",flexShrink:0}}/>
                );
              })}
            </div>
            <div style={{display:"flex",gap:"16px",marginTop:"12px",flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"12px",height:"12px",borderRadius:"3px",background:dark?"#064e3b":"#d1fae5"}}/><span style={{fontSize:"11px",color:muted}}>No-spend day</span></div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"12px",height:"12px",borderRadius:"3px",background:dark?"#7f1d1d":"#fee2e2"}}/><span style={{fontSize:"11px",color:muted}}>Spent</span></div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}><div style={{width:"12px",height:"12px",borderRadius:"3px",border:"2px solid #10b981",boxSizing:"border-box"}}/><span style={{fontSize:"11px",color:muted}}>Today</span></div>
            </div>
          </div>

          {/* Streak messages */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"12px"}}>INSIGHTS</div>
            {streakData.current===0&&<div style={{fontSize:"14px",color:text,lineHeight:1.6}}>You spent money today. Start a no-spend streak tomorrow! 💪</div>}
            {streakData.current===1&&<div style={{fontSize:"14px",color:text,lineHeight:1.6}}>1 day strong! Keep it going — tomorrow you'll have a 2-day streak. 🌱</div>}
            {streakData.current>=2&&streakData.current<7&&<div style={{fontSize:"14px",color:text,lineHeight:1.6}}>You're on a {streakData.current}-day streak! Just {7-streakData.current} more days to hit a week. 🔥</div>}
            {streakData.current>=7&&streakData.current<14&&<div style={{fontSize:"14px",color:text,lineHeight:1.6}}>A full week of no-spend days! You're building great habits. 🏆</div>}
            {streakData.current>=14&&<div style={{fontSize:"14px",color:text,lineHeight:1.6}}>{streakData.current} days without unnecessary spending — that's impressive discipline! 🌟</div>}
            {transactions.length===0&&<div style={{fontSize:"13px",color:muted,marginTop:"8px"}}>Add transactions to start tracking your streaks.</div>}
          </div>
        </>)}

        {/* ── SPENDING HEATMAP TAB ── */}
        {activeTab==="heatmap"&&(<>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"16px"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"16px",flexWrap:"wrap",gap:"8px"}}>
              <div>
                <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"4px"}}>SPENDING HEATMAP — LAST 90 DAYS</div>
                <div style={{fontSize:"12px",color:muted}}>Darker = more spending that day</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                <span style={{fontSize:"11px",color:muted}}>Low</span>
                {[0.1,0.3,0.5,0.7,0.9].map(v=><div key={v} style={{width:"14px",height:"14px",borderRadius:"3px",background:`rgba(239,68,68,${v})`}}/>)}
                <span style={{fontSize:"11px",color:muted}}>High</span>
              </div>
            </div>

            {/* Week labels + grid */}
            <div style={{overflowX:"auto"}}>
              <div style={{display:"flex",gap:"3px",minWidth:isMobile?"500px":"auto"}}>
                {/* Day-of-week labels */}
                <div style={{display:"flex",flexDirection:"column",gap:"3px",marginRight:"4px"}}>
                  {["","Mon","","Wed","","Fri",""].map((l,i)=><div key={i} style={{height:"16px",fontSize:"9px",color:muted,lineHeight:"16px",width:"24px",textAlign:"right"}}>{l}</div>)}
                </div>
                {/* Weekly columns */}
                {Array.from({length:Math.ceil(heatmapData.days.length/7)}).map((_,wi)=>(
                  <div key={wi} style={{display:"flex",flexDirection:"column",gap:"3px"}}>
                    {Array.from({length:7}).map((_,di)=>{
                      const idx=wi*7+di;if(idx>=heatmapData.days.length)return<div key={di} style={{width:"16px",height:"16px"}}/>;
                      const {day,amount,intensity}=heatmapData.days[idx];const isToday=isoDay(new Date())===day;
                      return(
                        <div key={di} onMouseEnter={()=>setHoverDay(day)} onMouseLeave={()=>setHoverDay(null)}
                          style={{width:"16px",height:"16px",borderRadius:"3px",background:amount===0?dark?"#1e1e1e":"#f1f5f9":`rgba(239,68,68,${Math.max(0.15,intensity)})`,border:isToday?"1px solid #10b981":hoverDay===day?"1px solid #f59e0b":"none",boxSizing:"border-box",cursor:"default",position:"relative"}}
                          title={`${new Date(day).toLocaleDateString()}: ${amount>0?fmt(amount):"No spending"}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Hover info */}
            {hoverDay&&(()=>{const d=heatmapData.days.find(d=>d.day===hoverDay);if(!d)return null;return(<div style={{marginTop:"12px",padding:"10px 14px",background:dark?"#111":"#f9f9f9",borderRadius:"8px",border:`1px solid ${border}`,fontSize:"13px",color:text}}><strong>{new Date(hoverDay).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</strong>: {d.amount>0?fmt(d.amount):"No spending ✓"}</div>)})()}
          </div>

          {/* Top spend days */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:"16px",marginBottom:"16px"}}>
            <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:muted,marginBottom:"14px"}}>TOP 5 SPENDING DAYS</div>
            {heatmapData.days.filter(d=>d.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,5).length===0?<p style={{color:muted,fontSize:"14px",textAlign:"center",padding:"16px 0"}}>No spending data yet</p>:(
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                {heatmapData.days.filter(d=>d.amount>0).sort((a,b)=>b.amount-a.amount).slice(0,5).map((d,i)=>{
                  const pct=d.amount/heatmapData.max*100;
                  return(
                    <div key={d.day}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px"}}><span style={{fontSize:"12px",color:text}}>{i+1}. {new Date(d.day).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</span><span style={{fontSize:"12px",fontWeight:600,color:"#ef4444"}}>{fmt(d.amount)}</span></div>
                      <div style={{height:"6px",background:dark?"#222":"#eee",borderRadius:"3px",overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:`rgba(239,68,68,${0.5+pct/200})`,borderRadius:"3px"}}/></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:"10px"}}>
            <KpiCard label="AVG DAILY SPEND" value={fmt(heatmapData.days.filter(d=>d.amount>0).reduce((s,d)=>s+d.amount,0)/Math.max(heatmapData.days.filter(d=>d.amount>0).length,1))} sub="on spend days" valueColor="#ef4444" surface={surface} border={border} muted={muted} compact={isMobile}/>
            <KpiCard label="HIGHEST DAY" value={fmt(heatmapData.max)} sub="single day" valueColor="#f97316" surface={surface} border={border} muted={muted} compact={isMobile}/>
            <KpiCard label="SPEND DAYS" value={String(heatmapData.days.filter(d=>d.amount>0).length)} sub="out of 90" valueColor="#8b5cf6" surface={surface} border={border} muted={muted} compact={isMobile}/>
            <KpiCard label="FREE DAYS" value={String(heatmapData.days.filter(d=>d.amount===0).length)} sub="out of 90" valueColor="#10b981" surface={surface} border={border} muted={muted} compact={isMobile}/>
          </div>
        </>)}

        {/* ── SETTINGS TAB ── */}
        {activeTab==="settings"&&(<>
          <SettingsSection title="PREFERENCES" surface={surface} border={border} muted={muted}>
            <SettingsRow label="Default currency" desc="Currency shown across the app" border={border} muted={muted} text={text} isMobile={isMobile}><select value={currency} onChange={e=>setCurrency(e.target.value)} style={{...inp,fontSize:"13px",padding:"6px 10px"}}><option value="₱">₱ PHP</option><option value="$">$ USD</option><option value="€">€ EUR</option><option value="£">£ GBP</option><option value="¥">¥ JPY</option><option value="₩">₩ KRW</option><option value="A$">A$ AUD</option><option value="C$">C$ CAD</option></select></SettingsRow>
            <SettingsRow label="Theme" desc="Light or dark mode" border={border} muted={muted} text={text} isMobile={isMobile}><div style={{display:"flex",gap:"8px"}}><button onClick={()=>setDark(false)} style={{background:!dark?"#10b981":"none",color:!dark?"#fff":muted,border:`1px solid ${!dark?"#10b981":border}`,borderRadius:"6px",padding:"6px 12px",fontSize:"13px",cursor:"pointer"}}>☀️ Light</button><button onClick={()=>setDark(true)} style={{background:dark?"#10b981":"none",color:dark?"#fff":muted,border:`1px solid ${dark?"#10b981":border}`,borderRadius:"6px",padding:"6px 12px",fontSize:"13px",cursor:"pointer"}}>🌙 Dark</button></div></SettingsRow>
            <SettingsRow label="Default tab" desc="Tab that opens on sign in" border={border} muted={muted} text={text} isMobile={isMobile}><select value={defaultTab} onChange={e=>{setDefaultTab(e.target.value);saveSetting("pref_default_tab",e.target.value);}} style={{...inp,fontSize:"13px",padding:"6px 10px"}}><option value="dashboard">📊 Dashboard</option><option value="monthly">📅 Monthly</option><option value="goals">🎯 Goals</option><option value="converter">💱 Converter</option><option value="debts">💳 Debts</option><option value="bills">🗓 Bills</option><option value="streak">🔥 Streak</option><option value="heatmap">🌡 Heatmap</option></select></SettingsRow>
            <SettingsRow label="Date format" desc="Used in exports" border={border} muted={muted} text={text} isMobile={isMobile}><select value={dateFormat} onChange={e=>setDateFormat(e.target.value as DateFormat)} style={{...inp,fontSize:"13px",padding:"6px 10px"}}>{DATE_FORMATS.map(f=><option key={f} value={f}>{f}</option>)}</select></SettingsRow>
            <SettingsRow label="Budget alert threshold" desc={`Warn at ${budgetAlertThreshold}% of limit`} border={border} muted={muted} text={text} isMobile={isMobile}><div style={{display:"flex",alignItems:"center",gap:"10px"}}><input type="range" min="50" max="95" step="5" value={budgetAlertThreshold} onChange={e=>setBudgetAlertThreshold(Number(e.target.value))} style={{accentColor:"#10b981",width:isMobile?"100px":"140px",cursor:"pointer"}}/><span style={{fontSize:"14px",fontWeight:600,color:"#10b981",minWidth:"36px"}}>{budgetAlertThreshold}%</span></div></SettingsRow>
          </SettingsSection>
          <SettingsSection title="ACCOUNT" surface={surface} border={border} muted={muted}>
            <SettingsRow label="Email" desc="Your sign-in email" border={border} muted={muted} text={text} isMobile={isMobile}><span style={{fontSize:"13px",color:muted,wordBreak:"break-all"}}>{user?.primaryEmailAddress?.emailAddress??"—"}</span></SettingsRow>
            <SettingsRow label="Name" desc="Display name from Clerk" border={border} muted={muted} text={text} isMobile={isMobile}><span style={{fontSize:"13px",color:muted}}>{user?.fullName??user?.firstName??"—"}</span></SettingsRow>
            <SettingsRow label="User ID" desc="Unique identifier" border={border} muted={muted} text={text} isMobile={isMobile}><span style={{fontSize:"11px",color:muted,fontFamily:"monospace",wordBreak:"break-all"}}>{user?.id??"—"}</span></SettingsRow>
          </SettingsSection>
          <SettingsSection title="DATA EXPORT" surface={surface} border={border} muted={muted}>
            <SettingsRow label="Format" desc="CSV for spreadsheets, JSON for raw data" border={border} muted={muted} text={text} isMobile={isMobile}><div style={{display:"flex",gap:"8px"}}><button onClick={()=>setExportFormat("csv")} style={{background:exportFormat==="csv"?"#10b981":"none",color:exportFormat==="csv"?"#fff":muted,border:`1px solid ${exportFormat==="csv"?"#10b981":border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"13px",cursor:"pointer"}}>CSV</button><button onClick={()=>setExportFormat("json")} style={{background:exportFormat==="json"?"#10b981":"none",color:exportFormat==="json"?"#fff":muted,border:`1px solid ${exportFormat==="json"?"#10b981":border}`,borderRadius:"6px",padding:"6px 14px",fontSize:"13px",cursor:"pointer"}}>JSON</button></div></SettingsRow>
            <SettingsRow label="Export all transactions" desc={`${transactions.length} transactions`} border={border} muted={muted} text={text} isMobile={isMobile}><button onClick={()=>exportFormat==="csv"?exportCSV(true):exportJSON()} disabled={transactions.length===0} style={{background:"#10b981",color:"#fff",border:"none",borderRadius:"6px",padding:"7px 16px",fontSize:"13px",fontWeight:600,cursor:transactions.length===0?"not-allowed":"pointer",opacity:transactions.length===0?0.5:1}}>⬇ Export {exportFormat.toUpperCase()}</button></SettingsRow>
          </SettingsSection>
          <SettingsSection title="DANGER ZONE" surface={surface} border="1px solid #ef4444" muted={muted} titleColor="#ef4444">
            <SettingsRow label="Clear all transactions" desc="Permanently deletes every transaction." border={border} muted={muted} text={text} isMobile={isMobile}>{dangerConfirm==="transactions"?(<div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}><span style={{fontSize:"12px",color:"#ef4444"}}>Sure?</span><button onClick={clearAllTransactions} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"6px 12px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Yes, delete</button><button onClick={()=>setDangerConfirm(null)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,padding:"6px 10px",fontSize:"13px",cursor:"pointer"}}>Cancel</button></div>):(<button onClick={()=>setDangerConfirm("transactions")} style={{background:"none",border:"1px solid #ef4444",borderRadius:"6px",color:"#ef4444",padding:"7px 14px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>🗑 Clear transactions</button>)}</SettingsRow>
            <SettingsRow label="Clear all goals" desc="Permanently deletes all savings goals." border={border} muted={muted} text={text} isMobile={isMobile}>{dangerConfirm==="goals"?(<div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}><span style={{fontSize:"12px",color:"#ef4444"}}>Sure?</span><button onClick={clearAllGoals} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:"6px",padding:"6px 12px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Yes, delete</button><button onClick={()=>setDangerConfirm(null)} style={{background:"none",border:`1px solid ${border}`,borderRadius:"6px",color:muted,padding:"6px 10px",fontSize:"13px",cursor:"pointer"}}>Cancel</button></div>):(<button onClick={()=>setDangerConfirm("goals")} style={{background:"none",border:"1px solid #ef4444",borderRadius:"6px",color:"#ef4444",padding:"7px 14px",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>🗑 Clear goals</button>)}</SettingsRow>
          </SettingsSection>
          {settingsSaved&&<div style={{position:"fixed",bottom:"24px",right:"24px",background:"#10b981",color:"#fff",borderRadius:"10px",padding:"12px 20px",fontSize:"13px",fontWeight:600,boxShadow:"0 4px 20px rgba(16,185,129,0.4)",zIndex:9999}}>✓ Settings saved</div>}
        </>)}

      </div>

      {/* Mobile bottom nav — shows only new feature tabs + a "More" concept using two rows */}
      {isMobile&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:surface,borderTop:`1px solid ${border}`,zIndex:100,paddingBottom:"env(safe-area-inset-bottom)"}}>
          {/* Row 1: main tabs */}
          <div style={{display:"flex",borderBottom:`1px solid ${border}`}}>
            {mainTabs.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id as TabId)} style={{flex:1,background:"none",border:"none",borderTop:`2px solid ${activeTab===tab.id?"#10b981":"transparent"}`,color:activeTab===tab.id?"#10b981":muted,cursor:"pointer",padding:"8px 2px 6px",display:"flex",flexDirection:"column",alignItems:"center",gap:"1px"}}>
                <span style={{fontSize:"16px",lineHeight:1}}>{tab.short}</span>
                <span style={{fontSize:"8px",fontWeight:activeTab===tab.id?700:400,letterSpacing:"0.02em"}}>{tab.shortLabel}</span>
              </button>
            ))}
          </div>
          {/* Row 2: extra tabs */}
          <div style={{display:"flex"}}>
            {extraTabs.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id as TabId)} style={{flex:1,background:"none",border:"none",borderTop:`2px solid ${activeTab===tab.id?"#10b981":"transparent"}`,color:activeTab===tab.id?"#10b981":muted,cursor:"pointer",padding:"7px 2px 5px",display:"flex",flexDirection:"column",alignItems:"center",gap:"1px"}}>
                <span style={{fontSize:"15px",lineHeight:1}}>{tab.short}</span>
                <span style={{fontSize:"8px",fontWeight:activeTab===tab.id?700:400,letterSpacing:"0.02em"}}>{tab.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isMobile&&<div style={{height:"100px"}}/>}
    </div>
  );
}

// ── Helper components ──

function SettingsSection({title,children,surface,border,muted,titleColor}:{title:string;children:React.ReactNode;surface:string;border:string;muted:string;titleColor?:string}){
  return(<div style={{background:surface,border,borderRadius:"10px",overflow:"hidden",marginBottom:"14px"}}><div style={{padding:"12px 16px",borderBottom:`1px solid ${border}`}}><span style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.08em",color:titleColor||muted}}>{title}</span></div><div>{children}</div></div>);
}
function SettingsRow({label,desc,children,border,muted,text,isMobile}:{label:string;desc:string;children:React.ReactNode;border:string;muted:string;text:string;isMobile:boolean}){
  return(<div style={{display:"flex",flexDirection:isMobile?"column":"row",alignItems:isMobile?"flex-start":"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`1px solid ${border}`,gap:isMobile?"10px":"16px"}}><div><div style={{fontSize:"13px",fontWeight:500,color:text,marginBottom:"2px"}}>{label}</div><div style={{fontSize:"12px",color:muted}}>{desc}</div></div><div style={{flexShrink:0,width:isMobile?"100%":"auto"}}>{children}</div></div>);
}
function KpiCard({label,value,sub,valueColor,surface,border,muted,compact}:{label:string;value:string;sub:string;valueColor:string;surface:string;border:string;muted:string;compact?:boolean}){
  return(<div style={{background:surface,border:`1px solid ${border}`,borderRadius:"10px",padding:compact?"12px":"16px"}}><div style={{fontSize:"9px",fontWeight:700,letterSpacing:"0.1em",color:muted,marginBottom:"6px"}}>{label}</div><div style={{fontSize:compact?"16px":"22px",fontWeight:700,color:valueColor,fontVariantNumeric:"tabular-nums",marginBottom:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</div><div style={{fontSize:"10px",color:muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</div></div>);
}
function EmptyState({text="No data yet",dark}:{text?:string;dark:boolean}){
  return(<div style={{height:"140px",display:"flex",alignItems:"center",justifyContent:"center",color:dark?"#444":"#bbb",fontSize:"13px"}}>{text}</div>);
}
