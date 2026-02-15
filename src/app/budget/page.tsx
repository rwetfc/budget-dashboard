"use client";

import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart, ComposedChart, Line } from "recharts";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PROD_DAYS = [22,20,20,22,21,19,21,19,20,20,18,22];
const ev = (n: number) => Array(12).fill(Math.round(n / 12));
const DEFAULT_STATE = {
  overheadPct: 32, materialsPct: 40, revenuePerManHour: 145, commissionPct: 7,
  jobSuppliesPct: 2.5, nonDirectLaborPct: 2.0, teamMembers: 14, totalManHours: 11500,
  monthRevPct: [0.07,0.05,0.06,0.07,0.08,0.09,0.12,0.10,0.10,0.10,0.09,0.07],
  crewsByMonth: [1,1,1,2.5,2.5,2.5,2.5,2.5,2.5,2.5,2.5,2.5],
  products: [
    { name: "Vinyl", pct: 25, avgSale: 8250, color: "#3b82f6" },
    { name: "Aluminum", pct: 6, avgSale: 5500, color: "#22c55e" },
    { name: "Wood", pct: 40, avgSale: 14300, color: "#eab308" },
    { name: "Chainlink", pct: 8, avgSale: 10450, color: "#ef4444" },
    { name: "Avimore", pct: 19, avgSale: 14850, color: "#a855f7" },
    { name: "Steel", pct: 1.5, avgSale: 11550, color: "#ec4899" },
    { name: "Bufftech", pct: 0, avgSale: 30800, color: "#06b6d4" },
    { name: "Gate Ops", pct: 0, avgSale: 12650, color: "#84cc16" },
    { name: "Prefirt", pct: 0, avgSale: 1.1, color: "#f97316" },
  ],
  payrollTaxRate: 13,
  overheadItems: [
    { name: "Rent", monthly: ev(48000) },
    { name: "Advertising", monthly: [5000,5000,10000,12000,14000,16000,18000,14000,14000,10000,8000,4000] },
    { name: "Insurance", monthly: ev(58000) },
    { name: "OH Payroll", monthly: ev(200000) },
    { name: "Utilities", monthly: ev(30000) },
    { name: "Fuel", monthly: ev(20000) },
    { name: "Benefits", monthly: ev(42000) },
    { name: "Leases", monthly: ev(20000) },
    { name: "Repairs", monthly: ev(12000) },
    { name: "Small Tools", monthly: ev(10000) },
    { name: "Office Supplies", monthly: ev(26000) },
    { name: "Prof Fees", monthly: ev(12000) },
    { name: "Bad Debts", monthly: ev(7500) },
    { name: "Education", monthly: ev(1500) },
    { name: "Travel", monthly: ev(2000) },
    { name: "Uniforms", monthly: ev(2500) },
    { name: "Shop Supplies", monthly: ev(3000) },
    { name: "Shipping", monthly: ev(300) },
    { name: "Dump Fees", monthly: ev(500) },
    { name: "Meals", monthly: ev(800) },
    { name: "Entertainment", monthly: ev(1000) },
    { name: "Misc", monthly: ev(2000) },
  ],
  crew: [
    { name: "Kyle Hall", annual: 60000, months: [1,1,1,1,1,1,1,1,1,1,1,1] },
    { name: "David Hall", annual: 52000, months: [1,1,1,1,1,1,1,1,1,1,1,1] },
    { name: "Crew Lead 3", annual: 38000, months: [0,0,0,1,1,1,1,1,1,1,1,1] },
    { name: "Crew Lead 4", annual: 38000, months: [0,0,0,1,1,1,1,1,1,1,1,1] },
    { name: "Installer 5", annual: 38000, months: [0,0,0,1,1,1,1,1,1,1,1,1] },
  ],
  shopManager: { name: "Tom (Shop)", annual: 45000 },
  debts: [
    { name: "Blue F150", annual: 9600 },
    { name: "Emmer LOC", annual: 48000 },
  ],
};
function fmt(n: number) { return n >= 0 ? "$" + Math.round(n).toLocaleString() : "($" + Math.abs(Math.round(n)).toLocaleString() + ")"; }
function fmtK(n: number) { return n >= 0 ? "$" + (n/1000).toFixed(0) + "K" : "($" + (Math.abs(n)/1000).toFixed(0) + "K)"; }
function fmtPct(n: number) { return n.toFixed(1) + "%"; }
function KPI({ label, value, subtext, positive }: { label: string; value: string; subtext?: string; positive?: boolean }) {
  const isNeg = typeof value === 'string' && value.startsWith('(');
  return (
    <div className={`rounded-xl p-4 ${isNeg ? 'bg-red-50 border border-red-200' : positive ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'}`}>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${isNeg ? 'text-red-600' : positive ? 'text-green-600' : 'text-gray-900'}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );
}
function Slider({ label, value, onChange, min, max, step, suffix, prefix }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string; prefix?: string }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs font-bold text-blue-700">{prefix||""}{typeof value === 'number' ? value.toLocaleString() : value}{suffix||""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  );
}
function Section({ title, children, color }: { title: string; children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = { blue: "border-blue-500 bg-blue-50", green: "border-green-500 bg-green-50", amber: "border-amber-500 bg-amber-50", red: "border-red-500 bg-red-50", purple: "border-purple-500 bg-purple-50" };
  return (
    <div className={`border-l-4 ${colors[color||'blue']} rounded-r-xl p-4 mb-4`}>
      <h3 className="font-bold text-sm text-gray-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}
function convertOldFormat(data: any) {
  if (data.overhead && !data.overheadItems) {
    const oh = data.overhead;
    const e = (n: number) => Array(12).fill(Math.round((n||0)/12));
    data.overheadItems = [
      { name: "Rent", monthly: e(oh.rent) }, { name: "Advertising", monthly: data.adMonthly || e(oh.advertising) },
      { name: "Insurance", monthly: e(oh.insurance) }, { name: "OH Payroll", monthly: e(oh.ohPayroll) },
      { name: "Utilities", monthly: e(oh.utilities) }, { name: "Fuel", monthly: e(oh.fuel) },
      { name: "Benefits", monthly: e(oh.benefits) }, { name: "Leases", monthly: e(oh.leases) },
      { name: "Repairs", monthly: e(oh.repairs) }, { name: "Small Tools", monthly: e(oh.smallTools) },
      { name: "Office Supplies", monthly: e(oh.officeSupplies) }, { name: "Prof Fees", monthly: e(oh.profFees) },
      { name: "Bad Debts", monthly: e(oh.badDebts) }, { name: "Education", monthly: e(oh.education) },
      { name: "Travel", monthly: e(oh.travel) }, { name: "Uniforms", monthly: e(oh.uniforms) },
      { name: "Shop Supplies", monthly: e(oh.shopSupplies) }, { name: "Shipping", monthly: e(oh.shipping) },
      { name: "Dump Fees", monthly: e(oh.dumpFees) }, { name: "Meals", monthly: e(oh.meals) },
      { name: "Entertainment", monthly: e(oh.entertainment) }, { name: "Misc", monthly: e(oh.misc) },
    ];
    data.payrollTaxRate = oh.payrollTaxRate || 13;
    delete data.overhead; delete data.adMonthly; delete data.ohMonthlyPct;
  }
  return data;
}
export default function BudgetPage() {
  const [s, setS] = useState(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showStrategy, setShowStrategy] = useState(false);
  const [showSaveLoad, setShowSaveLoad] = useState<string | false>(false);
  const [saveData, setSaveData] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [showAllOH, setShowAllOH] = useState(false);
  const update = (key: string, val: any) => setS(prev => ({ ...prev, [key]: val }));
  const updateOHItem = (idx: number, mi: number, val: number) => {
    const items = s.overheadItems.map((item, i) => i === idx ? { ...item, monthly: item.monthly.map((v, j) => j === mi ? val : v) } : item);
    update('overheadItems', items);
  };
  const scaleOHItem = (idx: number, newAnnual: number) => {
    const item = s.overheadItems[idx];
    const cur = item.monthly.reduce((a,b) => a+b, 0);
    const monthly = cur > 0 ? item.monthly.map(v => Math.round(v * newAnnual / cur)) : Array(12).fill(Math.round(newAnnual / 12));
    const items = s.overheadItems.map((it, i) => i === idx ? { ...it, monthly } : it);
    update('overheadItems', items);
  };
  const handleSave = () => { setSaveData(JSON.stringify(s)); setShowSaveLoad("save"); setSaveMsg(""); };
  const handleLoad = () => { setSaveData(""); setShowSaveLoad("load"); setSaveMsg(""); };
  const applySave = () => {
    try {
      const data = convertOldFormat(JSON.parse(saveData));
      if (data.overheadPct && data.overheadItems) {
        setS(data); setSaveMsg("Settings loaded!");
        setTimeout(() => { setShowSaveLoad(false); setSaveMsg(""); }, 1000);
      } else { setSaveMsg("Invalid data — missing required fields"); }
    } catch { setSaveMsg("Invalid JSON — check your pasted data"); }
  };
  const calc = useMemo(() => {
    const directLabor = s.crew.reduce((sum, c) => sum + c.annual, 0) + s.shopManager.annual;
    const payrollTaxes = directLabor * (s.payrollTaxRate / 100);
    const totalItemsAnnual = s.overheadItems.reduce((sum, item) => sum + item.monthly.reduce((a,b) => a+b, 0), 0);
    const totalOverhead = totalItemsAnnual + payrollTaxes;
    const revenueGoal = totalOverhead / (s.overheadPct / 100);
    const totalCOGSLabor = directLabor + (revenueGoal * s.commissionPct / 100);
    const laborPct = (totalCOGSLabor / revenueGoal) * 100;
    const netProfitPct = 100 - s.overheadPct - laborPct - s.materialsPct;
    const netProfitDollars = revenueGoal * netProfitPct / 100;
    const materialsDollars = revenueGoal * s.materialsPct / 100;
    const grossMarginPct = 100 - laborPct - s.materialsPct - s.jobSuppliesPct - s.nonDirectLaborPct;
    const cogsTotal = revenueGoal * (laborPct + s.materialsPct + s.jobSuppliesPct + s.nonDirectLaborPct) / 100;
    const grossMargin = revenueGoal - cogsTotal;
    const numProjects = s.products.reduce((sum, p) => sum + (p.avgSale > 1 ? (revenueGoal * p.pct / 100) / p.avgSale : 0), 0);
    const avgSale = numProjects > 0 ? revenueGoal / numProjects : 0;
    const monthTotal = s.monthRevPct.reduce((a,b) => a+b, 0);
    const monthly = MONTHS.map((m, i) => {
      const revPct = s.monthRevPct[i] / monthTotal;
      const revenue = revenueGoal * revPct;
      const cogs = revenue * (laborPct + s.materialsPct + s.jobSuppliesPct + s.nonDirectLaborPct) / 100;
      const gm = revenue - cogs;
      const ohMonthly = s.overheadItems.reduce((sum, item) => sum + item.monthly[i], 0) + payrollTaxes / 12;
      return { month: m, revenue, cogs, grossMargin: gm, overhead: ohMonthly, netProfit: gm - ohMonthly, prodDays: PROD_DAYS[i], crews: s.crewsByMonth[i], cumProfit: 0 };
    });
    let cum = 0; monthly.forEach(m => { cum += m.netProfit; m.cumProfit = cum; });
    const agg = (ms: typeof monthly) => ({ revenue: ms.reduce((a,m) => a+m.revenue, 0), grossMargin: ms.reduce((a,m) => a+m.grossMargin, 0), netProfit: ms.reduce((a,m) => a+m.netProfit, 0) });
    const quarters = [{ q: "Q1", ...agg(monthly.slice(0,3)) }, { q: "Q2", ...agg(monthly.slice(3,6)) }, { q: "Q3", ...agg(monthly.slice(6,9)) }, { q: "Q4", ...agg(monthly.slice(9,12)) }];
    const productData = s.products.map(p => ({ name: p.name, value: Math.round(revenueGoal * p.pct / 100), pct: p.pct, projects: p.avgSale > 1 ? Math.round(revenueGoal * p.pct / 100 / p.avgSale) : 0, color: p.color }));
    const overheadBreakdown = s.overheadItems.map(item => ({ name: item.name, value: item.monthly.reduce((a,b) => a+b, 0) })).concat([{ name: "Payroll Tax", value: Math.round(payrollTaxes) }]).sort((a,b) => b.value - a.value);
    const debtService = s.debts.reduce((sum, d) => sum + d.annual, 0);
    const manHourCapacity = s.revenuePerManHour * s.totalManHours;
    const capacityGap = manHourCapacity - revenueGoal;
    const prev2025 = { revenue: 1951097, netProfit: -254809, overheadPct: 37, materialsPct: 39, projects: 177 };
    return { revenueGoal, totalOverhead, totalCOGSLabor, laborPct, netProfitPct, netProfitDollars, materialsDollars, grossMarginPct, grossMargin, cogsTotal, numProjects, avgSale, monthly, quarters, productData, overheadBreakdown, debtService, cashAfterDebt: netProfitDollars - debtService, directLabor, payrollTaxes, prev2025, manHourCapacity, capacityGap };
  }, [s]);
  const tabs = [{ id: "dashboard", label: "Dashboard" }, { id: "monthly", label: "Monthly" }, { id: "products", label: "Products" }, { id: "overhead", label: "Overhead" }, { id: "crew", label: "Crew" }];
  const majorOHIdxs = s.overheadItems.map((item, i) => ({ i, annual: item.monthly.reduce((a,b) => a+b, 0) })).sort((a,b) => b.annual - a.annual).slice(0, 12).map(x => x.i).sort((a,b) => a-b);
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div><h1 className="text-2xl font-bold">The Fence Company</h1><p className="text-blue-200 text-sm">2026 Budget Matrix Dashboard</p></div>
          <div className="flex items-center gap-3">
            <button onClick={handleLoad} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-800 hover:bg-blue-600 border border-blue-500">Load</button>
            <button onClick={handleSave} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-800 hover:bg-blue-600 border border-blue-500">Save</button>
            <div className={`px-4 py-2 rounded-full text-sm font-bold ${calc.netProfitDollars >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>Net: {fmt(calc.netProfitDollars)}</div>
            <div className="text-right text-sm"><div className="text-blue-200">Revenue Target</div><div className="text-xl font-bold">{fmt(calc.revenueGoal)}</div></div>
          </div>
        </div>
      </div>
      <div className="bg-white border-b sticky top-0 z-10"><div className="max-w-7xl mx-auto flex">
        {tabs.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>)}
      </div></div>
      <div className="max-w-7xl mx-auto p-4">
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4 space-y-4">
              <Section title="Key Business Levers" color="blue">
                <Slider label="Overhead %" value={s.overheadPct} onChange={v => update('overheadPct', v)} min={25} max={45} step={0.5} suffix="%" />
                <Slider label="Materials %" value={s.materialsPct} onChange={v => update('materialsPct', v)} min={25} max={50} step={0.5} suffix="%" />
                <Slider label="Commission %" value={s.commissionPct} onChange={v => update('commissionPct', v)} min={3} max={12} step={0.5} suffix="%" />
                <Slider label="Job Supplies %" value={s.jobSuppliesPct} onChange={v => update('jobSuppliesPct', v)} min={1} max={5} step={0.25} suffix="%" />
                <Slider label="Revenue / Man Hour" value={s.revenuePerManHour} onChange={v => update('revenuePerManHour', v)} min={100} max={200} step={5} prefix="$" />
                <Slider label="Total Man Hours" value={s.totalManHours} onChange={v => update('totalManHours', v)} min={5000} max={25000} step={500} />
              </Section>
              <Section title="4 Buckets Breakdown" color="green">
                <div className="space-y-2">
                  {[{ label: "Overhead", pct: s.overheadPct, val: calc.totalOverhead, color: "bg-blue-500" }, { label: "Labor & Comm.", pct: calc.laborPct, val: calc.totalCOGSLabor, color: "bg-amber-500" }, { label: "Materials", pct: s.materialsPct, val: calc.materialsDollars, color: "bg-red-500" }, { label: "Net Profit", pct: calc.netProfitPct, val: calc.netProfitDollars, color: calc.netProfitPct >= 0 ? "bg-green-500" : "bg-red-600" }].map(b =>
                    <div key={b.label}><div className="flex justify-between text-xs mb-1"><span className="font-medium">{b.label}</span><span>{fmtPct(b.pct)} = {fmt(b.val)}</span></div><div className="w-full bg-gray-200 rounded-full h-2"><div className={`${b.color} h-2 rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, b.pct))}%` }} /></div></div>
                  )}
                </div>
              </Section>
              <Section title="2025 vs 2026" color="purple">
                <div className="space-y-2 text-xs">
                  {[{ label: "Revenue", v25: calc.prev2025.revenue, v26: calc.revenueGoal }, { label: "Net Profit", v25: calc.prev2025.netProfit, v26: calc.netProfitDollars }, { label: "Overhead %", v25: calc.prev2025.overheadPct, v26: s.overheadPct, isPct: true }, { label: "Materials %", v25: calc.prev2025.materialsPct, v26: s.materialsPct, isPct: true }, { label: "Projects", v25: calc.prev2025.projects, v26: Math.round(calc.numProjects), isNum: true }].map(r =>
                    <div key={r.label} className="flex justify-between items-center">
                      <span className="text-gray-600 w-24">{r.label}</span>
                      <span className="text-gray-400 w-24 text-right">{r.isPct ? fmtPct(r.v25) : r.isNum ? r.v25 : fmt(r.v25)}</span>
                      <span className="text-gray-900 font-medium w-24 text-right">{r.isPct ? fmtPct(r.v26) : r.isNum ? Math.round(r.v26) : fmt(r.v26)}</span>
                      <span className={`w-16 text-right font-bold ${(r.isPct ? r.v26 < r.v25 : r.v26 > r.v25) ? 'text-green-600' : 'text-red-600'}`}>{r.isPct ? (r.v26 - r.v25).toFixed(1) + "pp" : r.isNum ? (r.v26 - r.v25 > 0 ? "+" : "") + (r.v26 - r.v25) : (r.v26 - r.v25 >= 0 ? "+" : "") + fmtK(r.v26 - r.v25)}</span>
                    </div>
                  )}
                </div>
              </Section>
            </div>
            <div className="col-span-8 space-y-4">
              <div className="grid grid-cols-5 gap-3">
                <KPI label="Revenue Goal" value={fmt(calc.revenueGoal)} subtext={Math.round(calc.numProjects) + " projects @ " + fmt(calc.avgSale) + " avg"} />
                <KPI label="Man-Hour Capacity" value={fmt(calc.manHourCapacity)} subtext={s.totalManHours.toLocaleString() + " hrs @ " + fmt(s.revenuePerManHour) + "/hr"} positive={calc.capacityGap >= 0} />
                <KPI label="Gross Margin" value={fmt(calc.grossMargin)} subtext={fmtPct(calc.grossMarginPct)} positive={calc.grossMarginPct > 30} />
                <KPI label="Total Overhead" value={fmt(calc.totalOverhead)} subtext={fmtPct(s.overheadPct)} />
                <KPI label="Net Profit" value={fmt(calc.netProfitDollars)} subtext={fmtPct(calc.netProfitPct)} positive={calc.netProfitDollars > 0} />
              </div>
              {calc.capacityGap < 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-medium">
                  Capacity shortfall: Your crews can produce {fmt(calc.manHourCapacity)} but you need {fmt(calc.revenueGoal)} — gap of {fmt(Math.abs(calc.capacityGap))}. Increase man hours, $/hr, or reduce overhead.
                </div>
              )}
              <div className="bg-white rounded-xl border p-4">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Monthly Revenue vs Net Profit</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={calc.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} /><Tooltip formatter={fmt} /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4,4,0,0]} opacity={0.7} />
                    <Bar dataKey="overhead" name="Overhead" fill="#f59e0b" radius={[4,4,0,0]} opacity={0.5} />
                    <Line dataKey="netProfit" name="Net Profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                    <Line dataKey="cumProfit" name="Cumulative" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {calc.quarters.map(q => <div key={q.q} className={`rounded-xl p-3 border ${q.netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><div className="text-xs font-bold text-gray-500">{q.q}</div><div className="text-sm font-bold text-gray-900 mt-1">{fmt(q.revenue)}</div><div className={`text-xs font-bold mt-1 ${q.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net: {fmt(q.netProfit)}</div><div className="text-xs text-gray-400">GM: {fmt(q.grossMargin)}</div></div>)}
              </div>
              <div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-2">Cash Flow Summary</h3><div className="grid grid-cols-3 gap-4"><div><span className="text-xs text-gray-500">Net Operating Profit</span><div className="text-lg font-bold">{fmt(calc.netProfitDollars)}</div></div><div><span className="text-xs text-gray-500">Debt Service</span><div className="text-lg font-bold text-red-600">{fmt(-calc.debtService)}</div></div><div><span className="text-xs text-gray-500">Cash After Debt</span><div className={`text-lg font-bold ${calc.cashAfterDebt >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(calc.cashAfterDebt)}</div></div></div></div>
            </div>
          </div>
        )}
        {activeTab === "monthly" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Monthly Revenue Distribution</h3>
              <p className="text-xs text-gray-500 mb-3">Adjust each month&apos;s revenue target. Percentages auto-normalize to 100%.</p>
              <div className="grid grid-cols-12 gap-2 mb-2">
                {MONTHS.map((m, i) => {
                  const monthTot = s.monthRevPct.reduce((a,b) => a+b, 0);
                  const normPct = (s.monthRevPct[i] / monthTot * 100);
                  const dollarVal = Math.round(calc.revenueGoal * s.monthRevPct[i] / monthTot);
                  return (
                    <div key={m} className="text-center">
                      <div className="text-xs font-bold text-gray-600 mb-1">{m}</div>
                      <div className="relative">
                        <span className="absolute left-1 top-1 text-xs text-gray-400">$</span>
                        <input type="number" value={Math.round(dollarVal / 1000)} onChange={e => {
                          const newDollar = (parseInt(e.target.value) || 0) * 1000;
                          const otherTotal = calc.revenueGoal - dollarVal;
                          const newPct = otherTotal > 0 ? newDollar / (otherTotal + newDollar) : s.monthRevPct[i];
                          const nm = [...s.monthRevPct]; nm[i] = newPct; update('monthRevPct', nm);
                        }} className="w-full text-xs text-center border rounded p-1 pl-3" title={"$" + dollarVal.toLocaleString()} />
                        <div className="text-xs text-gray-400 mt-0.5">{normPct.toFixed(1)}%</div>
                      </div>
                      <div className="mt-1"><input type="range" min={0.01} max={0.25} step={0.005} value={s.monthRevPct[i]} onChange={e => { const nm = [...s.monthRevPct]; nm[i] = parseFloat(e.target.value); update('monthRevPct', nm); }} className="w-full" style={{ height: '4px' }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t">
                <span className="text-gray-500">Total: <strong>{fmt(calc.revenueGoal)}</strong></span>
                <button onClick={() => update('monthRevPct', [0.07,0.05,0.06,0.07,0.08,0.09,0.12,0.10,0.10,0.10,0.09,0.07])} className="text-blue-600 hover:text-blue-800 font-medium">Reset to Default</button>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-3">Monthly P&L Breakdown</h3><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b-2 border-gray-300"><th className="text-left py-2 px-2 font-bold">Month</th><th className="text-right py-2 px-2">Revenue</th><th className="text-right py-2 px-2">COGS</th><th className="text-right py-2 px-2">Gross Margin</th><th className="text-right py-2 px-2">GM %</th><th className="text-right py-2 px-2">Overhead</th><th className="text-right py-2 px-2 font-bold">Net Profit</th><th className="text-right py-2 px-2">Cumulative</th><th className="text-right py-2 px-2">Crews</th></tr></thead><tbody>
              {calc.monthly.map(m => <tr key={m.month} className={`border-b ${m.netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}><td className="py-2 px-2 font-bold">{m.month}</td><td className="text-right py-2 px-2">{fmt(m.revenue)}</td><td className="text-right py-2 px-2">{fmt(m.cogs)}</td><td className="text-right py-2 px-2">{fmt(m.grossMargin)}</td><td className="text-right py-2 px-2">{m.revenue > 0 ? fmtPct(m.grossMargin / m.revenue * 100) : '-'}</td><td className="text-right py-2 px-2">{fmt(m.overhead)}</td><td className={`text-right py-2 px-2 font-bold ${m.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(m.netProfit)}</td><td className={`text-right py-2 px-2 ${m.cumProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(m.cumProfit)}</td><td className="text-right py-2 px-2">{m.crews}</td></tr>)}
              <tr className="border-t-2 border-gray-800 font-bold bg-gray-100"><td className="py-2 px-2">TOTAL</td><td className="text-right py-2 px-2">{fmt(calc.revenueGoal)}</td><td className="text-right py-2 px-2">{fmt(calc.cogsTotal)}</td><td className="text-right py-2 px-2">{fmt(calc.grossMargin)}</td><td className="text-right py-2 px-2">{fmtPct(calc.grossMarginPct)}</td><td className="text-right py-2 px-2">{fmt(calc.totalOverhead)}</td><td className={`text-right py-2 px-2 ${calc.netProfitDollars >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(calc.netProfitDollars)}</td><td></td><td></td></tr>
            </tbody></table></div></div>
            <div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-3">Cumulative Net Profit</h3><ResponsiveContainer width="100%" height={250}><AreaChart data={calc.monthly}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} /><Tooltip formatter={fmt} /><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs><Area dataKey="cumProfit" name="Cumulative" stroke="#8b5cf6" fill="url(#cg)" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
          </div>
        )}
        {activeTab === "products" && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-5"><div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-3">Product Mix</h3><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={calc.productData.filter(p => p.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={(props: any) => props.name + " " + props.pct + "%"} labelLine={{ strokeWidth: 1 }} style={{ fontSize: 10 }}>{calc.productData.map((p, i) => <Cell key={i} fill={p.color} />)}</Pie><Tooltip formatter={fmt} /></PieChart></ResponsiveContainer></div></div>
            <div className="col-span-7"><div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-3">Product Details</h3><table className="w-full text-xs"><thead><tr className="border-b-2"><th className="text-left py-2">Product</th><th className="text-right py-2">Mix %</th><th className="text-right py-2">Avg Sale</th><th className="text-right py-2">Revenue</th><th className="text-right py-2">Projects</th></tr></thead><tbody>
              {s.products.map((p, i) => <tr key={p.name} className="border-b"><td className="py-2 flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</td><td className="text-right py-2"><input type="number" value={p.pct} step={0.5} min={0} max={100} onChange={e => { const np = [...s.products]; np[i] = { ...p, pct: parseFloat(e.target.value) || 0 }; update('products', np); }} className="w-16 text-right text-xs border rounded p-1" />%</td><td className="text-right py-2"><input type="number" value={p.avgSale} step={100} onChange={e => { const np = [...s.products]; np[i] = { ...p, avgSale: parseFloat(e.target.value) || 0 }; update('products', np); }} className="w-20 text-right text-xs border rounded p-1" /></td><td className="text-right py-2 font-medium">{fmt(calc.productData[i]?.value || 0)}</td><td className="text-right py-2">{calc.productData[i]?.projects || 0}</td></tr>)}
              <tr className="border-t-2 font-bold"><td className="py-2">TOTAL</td><td className="text-right py-2">{s.products.reduce((a, p) => a + p.pct, 0).toFixed(1)}%</td><td className="text-right py-2">{fmt(calc.avgSale)}</td><td className="text-right py-2">{fmt(calc.revenueGoal)}</td><td className="text-right py-2">{Math.round(calc.numProjects)}</td></tr>
            </tbody></table>{Math.abs(s.products.reduce((a, p) => a + p.pct, 0) - 100) > 0.1 && <div className="mt-2 text-xs text-red-600 font-medium bg-red-50 p-2 rounded">Product mix totals {s.products.reduce((a, p) => a + p.pct, 0).toFixed(1)}% — should be ~99-100%</div>}</div></div>
          </div>
        )}
        {activeTab === "overhead" && (
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-5"><div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-3">Overhead ({fmt(calc.totalOverhead)})</h3><ResponsiveContainer width="100%" height={350}><BarChart data={calc.overheadBreakdown} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} /><Tooltip formatter={fmt} /><Bar dataKey="value" fill="#3b82f6" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer></div></div>
              <div className="col-span-7 space-y-4">
                <Section title="Annual Totals (drag to scale monthly values)" color="amber">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {s.overheadItems.slice(0, 12).map((item, idx) => {
                      const annual = item.monthly.reduce((a,b) => a+b, 0);
                      return <Slider key={item.name} label={item.name} value={annual} onChange={v => scaleOHItem(idx, v)} min={0} max={Math.max(annual * 2, 50000)} step={1000} prefix="$" />;
                    })}
                  </div>
                </Section>
                <Section title="Settings" color="green">
                  <Slider label="Payroll Tax Rate" value={s.payrollTaxRate} onChange={v => update('payrollTaxRate', v)} min={8} max={20} step={0.5} suffix="%" />
                  <div className="text-xs text-gray-500 mt-1">Payroll taxes on direct labor: {fmt(calc.payrollTaxes)}</div>
                </Section>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="flex justify-between items-center mb-3">
                <div><h3 className="font-bold text-sm text-gray-800">Monthly Overhead by Item</h3><p className="text-xs text-gray-500">Edit each item&apos;s monthly amount. Annual column shows the sum.</p></div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAllOH(!showAllOH)} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">{showAllOH ? "Show Major Only" : "Show All Items"}</button>
                  <button onClick={() => { const items = [...s.overheadItems, { name: "New Item", monthly: ev(0) }]; update('overheadItems', items); }} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">+ Add Item</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 px-1 font-bold w-28">Item</th>
                    {MONTHS.map(m => <th key={m} className="text-center py-2 px-0.5 font-bold w-16">{m}</th>)}
                    <th className="text-right py-2 px-1 font-bold w-20">Annual</th>
                    <th className="py-2 w-6"></th>
                  </tr></thead>
                  <tbody>
                    {s.overheadItems.map((item, idx) => {
                      if (!showAllOH && !majorOHIdxs.includes(idx)) return null;
                      const annual = item.monthly.reduce((a,b) => a+b, 0);
                      return (
                        <tr key={idx} className="border-b hover:bg-blue-50">
                          <td className="py-1 px-1"><input value={item.name} onChange={e => { const items = [...s.overheadItems]; items[idx] = { ...item, name: e.target.value }; update('overheadItems', items); }} className="text-xs border rounded p-1 w-full" /></td>
                          {item.monthly.map((val, mi) => (
                            <td key={mi} className="py-1 px-0.5"><input type="number" value={val} onChange={e => updateOHItem(idx, mi, parseInt(e.target.value) || 0)} className="w-full text-xs text-right border rounded p-1" /></td>
                          ))}
                          <td className="text-right py-1 px-1 font-bold">{fmtK(annual)}</td>
                          <td className="text-center py-1"><button onClick={() => { const items = [...s.overheadItems]; items.splice(idx, 1); update('overheadItems', items); }} className="text-red-400 hover:text-red-600 font-bold">x</button></td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50 border-b"><td className="py-1 px-1 text-gray-500">Payroll Tax ({s.payrollTaxRate}%)</td>{MONTHS.map((_, i) => <td key={i} className="text-right py-1 px-0.5 text-gray-400">{Math.round(calc.payrollTaxes / 12).toLocaleString()}</td>)}<td className="text-right py-1 px-1 font-bold text-gray-500">{fmtK(calc.payrollTaxes)}</td><td></td></tr>
                    <tr className="border-t-2 border-gray-800 font-bold bg-gray-100">
                      <td className="py-2 px-1">TOTAL</td>
                      {MONTHS.map((_, i) => <td key={i} className="text-right py-2 px-0.5">{fmtK(s.overheadItems.reduce((sum, item) => sum + item.monthly[i], 0) + calc.payrollTaxes / 12)}</td>)}
                      <td className="text-right py-2 px-1">{fmt(calc.totalOverhead)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {activeTab === "crew" && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-7"><div className="bg-white rounded-xl border p-4"><h3 className="font-bold text-sm text-gray-800 mb-3">Crew Members</h3><table className="w-full text-xs"><thead><tr className="border-b-2"><th className="text-left py-2">Name</th><th className="text-right py-2">Annual</th><th className="text-center py-2" colSpan={12}>Active Months</th></tr><tr className="border-b text-gray-400"><th></th><th></th>{MONTHS.map(m => <th key={m} className="text-center py-1 px-0.5">{m.slice(0, 1)}</th>)}</tr></thead><tbody>
              {s.crew.map((c, ci) => <tr key={ci} className="border-b"><td className="py-2"><input value={c.name} onChange={e => { const nc = [...s.crew]; nc[ci] = { ...c, name: e.target.value }; update('crew', nc); }} className="text-xs border rounded p-1 w-28" /></td><td className="text-right py-2"><input type="number" value={c.annual} step={1000} onChange={e => { const nc = [...s.crew]; nc[ci] = { ...c, annual: parseInt(e.target.value) || 0 }; update('crew', nc); }} className="text-xs border rounded p-1 w-20 text-right" /></td>{c.months.map((m, mi) => <td key={mi} className="text-center py-2"><button onClick={() => { const nc = [...s.crew]; const nm = [...c.months]; nm[mi] = nm[mi] ? 0 : 1; nc[ci] = { ...c, months: nm }; update('crew', nc); }} className={`w-5 h-5 rounded text-xs ${m ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}>{m ? "Y" : ""}</button></td>)}</tr>)}
              <tr className="border-b bg-blue-50"><td className="py-2 font-medium">{s.shopManager.name}</td><td className="text-right py-2"><input type="number" value={s.shopManager.annual} step={1000} onChange={e => update('shopManager', { ...s.shopManager, annual: parseInt(e.target.value) || 0 })} className="text-xs border rounded p-1 w-20 text-right" /></td>{MONTHS.map((_, i) => <td key={i} className="text-center py-2"><div className="w-5 h-5 rounded bg-blue-500 text-white text-xs flex items-center justify-center mx-auto">Y</div></td>)}</tr>
              <tr className="border-t-2 font-bold"><td className="py-2">TOTAL LABOR</td><td className="text-right py-2">{fmt(calc.directLabor)}</td><td colSpan={12}></td></tr>
            </tbody></table>
            <div className="mt-3 flex gap-2"><button onClick={() => update('crew', [...s.crew, { name: "New Hire " + (s.crew.length + 1), annual: 35000, months: [0,0,0,0,1,1,1,1,1,1,1,0] }])} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">+ Add Crew</button>{s.crew.length > 1 && <button onClick={() => update('crew', s.crew.slice(0, -1))} className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-200">Remove Last</button>}</div></div></div>
            <div className="col-span-5 space-y-4">
              <Section title="Crews / Month" color="blue">{MONTHS.map((m, i) => <Slider key={m} label={m} value={s.crewsByMonth[i]} onChange={v => { const nc = [...s.crewsByMonth]; nc[i] = v; update('crewsByMonth', nc); }} min={0} max={6} step={0.5} />)}</Section>
              <Section title="Labor Summary" color="green"><div className="space-y-2 text-xs"><div className="flex justify-between"><span>Direct Labor</span><span className="font-bold">{fmt(calc.directLabor)}</span></div><div className="flex justify-between"><span>Commissions ({s.commissionPct}%)</span><span className="font-bold">{fmt(calc.revenueGoal * s.commissionPct / 100)}</span></div><div className="flex justify-between"><span>Payroll Taxes</span><span className="font-bold">{fmt(calc.payrollTaxes)}</span></div><div className="flex justify-between border-t pt-2 font-bold"><span>Total Labor</span><span>{fmt(calc.totalCOGSLabor)}</span></div><div className="flex justify-between"><span>Labor %</span><span className="font-bold">{fmtPct(calc.laborPct)}</span></div></div></Section>
              <Section title="Debt Service" color="red">
                <table className="w-full text-xs mb-2">
                  <thead><tr className="border-b"><th className="text-left py-1">Name</th><th className="text-right py-1">Annual</th><th className="text-right py-1">Monthly</th><th className="py-1 w-6"></th></tr></thead>
                  <tbody>
                    {s.debts.map((d, di) =>
                      <tr key={di} className="border-b">
                        <td className="py-1"><input value={d.name} onChange={e => { const nd = [...s.debts]; nd[di] = { ...d, name: e.target.value }; update('debts', nd); }} className="text-xs border rounded p-1 w-full" /></td>
                        <td className="text-right py-1"><input type="number" value={d.annual} step={600} onChange={e => { const nd = [...s.debts]; nd[di] = { ...d, annual: parseInt(e.target.value) || 0 }; update('debts', nd); }} className="text-xs border rounded p-1 w-20 text-right" /></td>
                        <td className="text-right py-1 text-gray-500">{fmt(Math.round(d.annual / 12))}</td>
                        <td className="text-center py-1"><button onClick={() => { const nd = [...s.debts]; nd.splice(di, 1); update('debts', nd); }} className="text-red-400 hover:text-red-600 text-sm font-bold">x</button></td>
                      </tr>
                    )}
                    <tr className="border-t-2 font-bold"><td className="py-1">TOTAL</td><td className="text-right py-1">{fmt(calc.debtService)}</td><td className="text-right py-1">{fmt(Math.round(calc.debtService / 12))}</td><td></td></tr>
                  </tbody>
                </table>
                <button onClick={() => update('debts', [...s.debts, { name: "New Debt " + (s.debts.length + 1), annual: 0 }])} className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 w-full">+ Add Debt Item</button>
              </Section>
            </div>
          </div>
        )}
        <div className="mt-6 mb-4">
          <button onClick={() => setShowStrategy(!showStrategy)} className="text-sm text-blue-600 hover:text-blue-800 font-medium">{showStrategy ? "Hide" : "Show"} Strategy Notes</button>
          {showStrategy && <div className="mt-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-gray-700 space-y-2">
            <p className="font-bold text-blue-800">Key levers to reach profitability in 2026:</p>
            <p><strong>1. Materials:</strong> Every 1% reduction on $2M revenue saves ~$20K. Negotiate bulk pricing, reduce waste.</p>
            <p><strong>2. Revenue per man hour:</strong> $130 to $145+ via better scheduling, less downtime between jobs.</p>
            <p><strong>3. Overhead payroll:</strong> Biggest single overhead item. Can roles be consolidated?</p>
            <p><strong>4. Advertising ROI:</strong> Spend more May-Aug, cut winter. Track cost-per-lead by channel.</p>
            <p><strong>5. Product mix:</strong> Push Avimore and Bufftech for higher margins.</p>
            <p><strong>6. Seasonal cash:</strong> Q1/Q2 losses are normal for fencing. Build reserves from Q3/Q4.</p>
          </div>}
        </div>
      </div>
      {showSaveLoad && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowSaveLoad(false)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">{showSaveLoad === "save" ? "Save Settings" : "Load Settings"}</h2>
              <button onClick={() => setShowSaveLoad(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">x</button>
            </div>
            {showSaveLoad === "save" ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">Copy the text below and save it somewhere. Paste it back using Load to restore.</p>
                <textarea readOnly value={saveData} onClick={e => (e.target as HTMLTextAreaElement).select()} className="w-full h-32 text-xs font-mono border rounded-lg p-3 bg-gray-50" />
                <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(saveData).then(() => setSaveMsg("Copied!")).catch(() => setSaveMsg("Select all and copy manually")); }} className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Copy to Clipboard</button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-3">Paste your previously saved settings below. Supports both old and new format.</p>
                <textarea value={saveData} onChange={e => setSaveData(e.target.value)} placeholder="Paste your saved settings here..." className="w-full h-32 text-xs font-mono border rounded-lg p-3" />
                <button onClick={applySave} className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Load Settings</button>
              </div>
            )}
            {saveMsg && <div className={`mt-2 text-sm text-center font-medium ${saveMsg.includes("!") ? "text-green-600" : "text-red-600"}`}>{saveMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
