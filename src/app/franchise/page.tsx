"use client";

import { useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart,
  ComposedChart, Line, ReferenceLine,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────
interface MonthSales { franchises: number; tier1: number; tier2: number; jv: number; }
interface Scenario {
  name: string;
  startingTier1: number;
  startingTier2: number;
  startingJV: number;
  startingFranchises: number;
  months: MonthSales[];
  color: string;
}
interface Assumptions {
  franchiseFee: number;
  commissionPerFranchise: number;
  commissionPerTier1: number;
  commissionPerTier2: number;
  commissionPerJV: number;
  overheadMonthly: number;
  royaltyRate: number;
  platformFeeRate: number;
  tier1Price: number;
  tier2Price: number;
  jvPrice: number;
  franchiseMembershipPrice: number;
  gmvPerFranchiseMonthly: number;
  gmvPerJVMonthly: number;
  gmvRampMonths: number;
  churnRateTier1: number;
  churnRateTier2: number;
  churnRateJV: number;
  churnRateFranchise: number;
  materialPctOfGMV: number;
  materialMarkup: number;
}
interface AppState { assumptions: Assumptions; scenarios: Scenario[]; activeScenario: number; }

// ─── Defaults ───────────────────────────────────────────────────────────────
const MONTHS_36 = (): MonthSales[] => Array.from({ length: 60 }, () => ({ franchises: 0, tier1: 0, tier2: 0, jv: 0 }));
const MONTH_LABELS = (n: number) => {
  const labels: string[] = [];
  let y = 2026, m = 0;
  for (let i = 0; i < n; i++) {
    labels.push(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m] + "-" + y);
    m++; if (m === 12) { m = 0; y++; }
  }
  return labels;
};

const DEFAULT_ASSUMPTIONS: Assumptions = {
  franchiseFee: 40000,
  commissionPerFranchise: 10000,
  commissionPerTier1: 200,
  commissionPerTier2: 500,
  commissionPerJV: 500,
  overheadMonthly: 25000,
  royaltyRate: 0.04,
  platformFeeRate: 0.0033,
  tier1Price: 1000,
  tier2Price: 2000,
  jvPrice: 3500,
  franchiseMembershipPrice: 3500,
  gmvPerFranchiseMonthly: 83333,
  gmvPerJVMonthly: 83333,
  gmvRampMonths: 4,
  churnRateTier1: 0.02,
  churnRateTier2: 0.01,
  churnRateJV: 0.005,
  churnRateFranchise: 0.005,
  materialPctOfGMV: 0.40,
  materialMarkup: 0.10,
};

function buildFlatScenario(): Scenario {
  const m = MONTHS_36();
  // Apr-Sep 2026: 3 franchise, 4 T1, 2 T2 per month
  for (let i = 3; i <= 8; i++) { m[i] = { franchises: 3, tier1: 4, tier2: 2, jv: 0 }; }
  // Oct 2026: 1 franchise, 3 T1, 1 T2
  m[9] = { franchises: 1, tier1: 3, tier2: 1, jv: 0 };
  // Nov 2026: 1 franchise, 3 T1, 0 T2
  m[10] = { franchises: 1, tier1: 3, tier2: 0, jv: 0 };
  return { name: "Flat 3yr Steady State", startingTier1: 3, startingTier2: 1, startingJV: 1, startingFranchises: 0, months: m, color: "#3b82f6" };
}

function buildExpansionScenario(): Scenario {
  const m = MONTHS_36();
  for (let i = 3; i <= 8; i++) { m[i] = { franchises: 3, tier1: 4, tier2: 2, jv: 0 }; }
  m[9] = { franchises: 1, tier1: 3, tier2: 1, jv: 0 };
  m[10] = { franchises: 1, tier1: 3, tier2: 0, jv: 0 };
  // Nov 2027 (month 22): 20 franchise batch
  m[22] = { franchises: 20, tier1: 0, tier2: 0, jv: 0 };
  // Nov 2028 (month 34): 20 franchise batch
  m[34] = { franchises: 20, tier1: 0, tier2: 0, jv: 0 };
  return { name: "Expansion Plan", startingTier1: 5, startingTier2: 2, startingJV: 1, startingFranchises: 0, months: m, color: "#10b981" };
}

const DEFAULT_STATE: AppState = {
  assumptions: DEFAULT_ASSUMPTIONS,
  scenarios: [buildFlatScenario(), buildExpansionScenario()],
  activeScenario: 0,
};

// ─── Formatting ─────────────────────────────────────────────────────────────
function fmt(n: number) { return n >= 0 ? "$" + Math.round(n).toLocaleString() : "($" + Math.abs(Math.round(n)).toLocaleString() + ")"; }
function fmtK(n: number) { return n >= 0 ? "$" + (n / 1000).toFixed(0) + "K" : "($" + (Math.abs(n) / 1000).toFixed(0) + "K)"; }
function fmtM(n: number) { return n >= 0 ? "$" + (n / 1000000).toFixed(2) + "M" : "($" + (Math.abs(n) / 1000000).toFixed(2) + "M)"; }
function fmtPct(n: number) { return (n * 100).toFixed(1) + "%"; }
function fmtPctWhole(n: number) { return n.toFixed(1) + "%"; }

// ─── Calculation Engine ─────────────────────────────────────────────────────
function calcScenario(a: Assumptions, sc: Scenario) {
  const labels = MONTH_LABELS(sc.months.length);
  let activeTier1 = sc.startingTier1;
  let activeTier2 = sc.startingTier2;
  let activeJV = sc.startingJV;
  let activeFranchises = sc.startingFranchises;
  // Track ages for GMV ramp (franchises and JVs)
  const franchiseAges: number[] = Array(sc.startingFranchises).fill(a.gmvRampMonths + 1);
  const jvAges: number[] = Array(sc.startingJV).fill(a.gmvRampMonths + 1);

  const rows = sc.months.map((m, i) => {
    // New sales
    const newF = m.franchises;
    const newT1 = m.tier1;
    const newT2 = m.tier2;
    const newJV = m.jv;

    // Churn (applied before adding new)
    const churnedT1 = Math.round(activeTier1 * a.churnRateTier1);
    const churnedT2 = Math.round(activeTier2 * a.churnRateTier2);
    const churnedJV = Math.round(activeJV * a.churnRateJV);
    const churnedF = Math.round(activeFranchises * a.churnRateFranchise);

    activeTier1 = Math.max(0, activeTier1 - churnedT1 + newT1);
    activeTier2 = Math.max(0, activeTier2 - churnedT2 + newT2);
    activeJV = Math.max(0, activeJV - churnedJV + newJV);
    activeFranchises = Math.max(0, activeFranchises - churnedF + newF);

    // Age existing franchises and add new
    for (let f = 0; f < franchiseAges.length; f++) franchiseAges[f]++;
    for (let f = 0; f < newF; f++) franchiseAges.push(1);
    for (let f = 0; f < churnedF && franchiseAges.length > 0; f++) franchiseAges.shift();

    // Age existing JVs and add new
    for (let j = 0; j < jvAges.length; j++) jvAges[j]++;
    for (let j = 0; j < newJV; j++) jvAges.push(1);
    for (let j = 0; j < churnedJV && jvAges.length > 0; j++) jvAges.shift();

    // GMV calculation with ramp — Franchises
    let franchiseGMV = 0;
    for (const age of franchiseAges) {
      const rampFactor = Math.min(age / a.gmvRampMonths, 1);
      franchiseGMV += a.gmvPerFranchiseMonthly * rampFactor;
    }
    // GMV calculation with ramp — JVs
    let jvGMV = 0;
    for (const age of jvAges) {
      const rampFactor = Math.min(age / a.gmvRampMonths, 1);
      jvGMV += a.gmvPerJVMonthly * rampFactor;
    }
    const systemGMV = franchiseGMV + jvGMV;

    // Revenue
    const revFranchiseFees = newF * a.franchiseFee;
    const revTier1 = activeTier1 * a.tier1Price;
    const revTier2 = activeTier2 * a.tier2Price;
    const revJV = activeJV * a.jvPrice;
    const revFranchiseDues = activeFranchises * a.franchiseMembershipPrice;
    const revMembership = revTier1 + revTier2 + revJV + revFranchiseDues;
    const revHeadOffice = revFranchiseFees + revMembership;
    // Royalties on all GMV (franchises + JVs)
    const revRoyalties = systemGMV * a.royaltyRate;
    const revPlatformFees = (revMembership + systemGMV) * a.platformFeeRate;
    // Material sales: franchises + JVs buy materials through HQ
    const materialVolume = systemGMV * a.materialPctOfGMV;
    const revMaterialMarkup = materialVolume * a.materialMarkup;
    const totalRevenue = revHeadOffice + revRoyalties + revPlatformFees + revMaterialMarkup;

    // Costs
    const costCommFranchise = newF * a.commissionPerFranchise;
    const costCommTier1 = newT1 * a.commissionPerTier1;
    const costCommTier2 = newT2 * a.commissionPerTier2;
    const costCommJV = newJV * a.commissionPerJV;
    const costCommissions = costCommFranchise + costCommTier1 + costCommTier2 + costCommJV;
    const costOverhead = a.overheadMonthly;
    const totalCost = costCommissions + costOverhead;

    const operatingProfit = totalRevenue - totalCost;

    return {
      month: labels[i],
      monthIdx: i,
      newF, newT1, newT2, newJV,
      activeTier1, activeTier2, activeJV, activeFranchises,
      activeMembers: activeTier1 + activeTier2 + activeJV,
      franchiseGMV, jvGMV, systemGMV,
      revFranchiseFees, revTier1, revTier2, revJV, revFranchiseDues, revMembership, revHeadOffice,
      revRoyalties, revPlatformFees, materialVolume, revMaterialMarkup, totalRevenue,
      costCommissions, costOverhead, totalCost,
      operatingProfit,
      cumProfit: 0,
      cumRevenue: 0,
    };
  });

  let cum = 0, cumR = 0;
  rows.forEach(r => { cum += r.operatingProfit; cumR += r.totalRevenue; r.cumProfit = cum; r.cumRevenue = cumR; });

  // Yearly aggregation
  const years: { year: number; revenue: number; cost: number; profit: number; franchiseFees: number; membership: number; royalties: number; platformFees: number; materialMarkup: number; commissions: number; overhead: number; endMembers: number; endFranchises: number; gmv: number; }[] = [];
  for (let y = 0; y < Math.ceil(rows.length / 12); y++) {
    const slice = rows.slice(y * 12, (y + 1) * 12);
    if (slice.length === 0) continue;
    const last = slice[slice.length - 1];
    years.push({
      year: 2026 + y,
      revenue: slice.reduce((s, r) => s + r.totalRevenue, 0),
      cost: slice.reduce((s, r) => s + r.totalCost, 0),
      profit: slice.reduce((s, r) => s + r.operatingProfit, 0),
      franchiseFees: slice.reduce((s, r) => s + r.revFranchiseFees, 0),
      membership: slice.reduce((s, r) => s + r.revMembership, 0),
      royalties: slice.reduce((s, r) => s + r.revRoyalties, 0),
      platformFees: slice.reduce((s, r) => s + r.revPlatformFees, 0),
      materialMarkup: slice.reduce((s, r) => s + r.revMaterialMarkup, 0),
      commissions: slice.reduce((s, r) => s + r.costCommissions, 0),
      overhead: slice.reduce((s, r) => s + r.costOverhead, 0),
      endMembers: last.activeMembers,
      endFranchises: last.activeFranchises,
      gmv: last.systemGMV * 12,
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.operatingProfit, 0);
  const lastRow = rows[rows.length - 1];
  const breakEvenMonth = rows.findIndex(r => r.cumProfit > 0);

  return { rows, years, totalRevenue, totalProfit, lastRow, breakEvenMonth };
}

// ─── Components ─────────────────────────────────────────────────────────────
function KPI({ label, value, subtext, positive, negative }: { label: string; value: string; subtext?: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${negative ? 'bg-red-50 border border-red-200' : positive ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'} shadow-sm`}>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-1 ${negative ? 'text-red-600' : positive ? 'text-green-600' : 'text-gray-900'}`}>{value}</div>
      {subtext && <div className="text-xs text-gray-400 mt-1">{subtext}</div>}
    </div>
  );
}

function InputField({ label, value, onChange, prefix, suffix, step, min, max, small }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number; max?: number; small?: boolean;
}) {
  return (
    <div className={small ? "flex items-center gap-2" : "mb-3"}>
      <label className="text-xs font-medium text-gray-600 whitespace-nowrap">{label}</label>
      <div className="flex items-center gap-1 mt-0.5">
        {prefix && <span className="text-xs text-gray-400">{prefix}</span>}
        <input
          type="number" value={value} step={step || 1} min={min} max={max}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className={`text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${small ? 'w-20' : 'w-full'}`}
        />
        {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, children, color, collapsible, defaultOpen }: {
  title: string; children: React.ReactNode; color?: string; collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen !== false);
  const colors: Record<string, string> = {
    blue: "border-blue-500 bg-blue-50/50", green: "border-green-500 bg-green-50/50",
    amber: "border-amber-500 bg-amber-50/50", red: "border-red-500 bg-red-50/50",
    purple: "border-purple-500 bg-purple-50/50", indigo: "border-indigo-500 bg-indigo-50/50",
  };
  return (
    <div className={`border-l-4 ${colors[color || 'blue']} rounded-r-xl p-4 mb-4 shadow-sm`}>
      <div className="flex justify-between items-center mb-2 cursor-pointer" onClick={() => collapsible && setOpen(!open)}>
        <h3 className="font-bold text-sm text-gray-800">{title}</h3>
        {collapsible && <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>}
      </div>
      {open && children}
    </div>
  );
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
const PIE_COLORS = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#f97316", "#ec4899"];

// ─── Main App ───────────────────────────────────────────────────────────────
export default function FranchiseDashboard() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState("overview");
  const [showSaveLoad, setShowSaveLoad] = useState<string | false>(false);
  const [saveData, setSaveData] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [savedVersions, setSavedVersions] = useState<{ name: string; data: string; date: string }[]>([]);
  const [saveName, setSaveName] = useState("");
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { assumptions: a, scenarios, activeScenario } = state;
  const sc = scenarios[activeScenario];

  const updateAssumption = (key: keyof Assumptions, val: number) =>
    setState(prev => ({ ...prev, assumptions: { ...prev.assumptions, [key]: val } }));

  const updateMonthSales = (monthIdx: number, field: keyof MonthSales, val: number) => {
    setState(prev => {
      const newScenarios = [...prev.scenarios];
      const newMonths = [...newScenarios[prev.activeScenario].months];
      newMonths[monthIdx] = { ...newMonths[monthIdx], [field]: Math.max(0, val) };
      newScenarios[prev.activeScenario] = { ...newScenarios[prev.activeScenario], months: newMonths };
      return { ...prev, scenarios: newScenarios };
    });
  };

  const updateScenarioField = (field: string, val: any) => {
    setState(prev => {
      const newScenarios = [...prev.scenarios];
      newScenarios[prev.activeScenario] = { ...newScenarios[prev.activeScenario], [field]: val };
      return { ...prev, scenarios: newScenarios };
    });
  };

  const addScenario = () => {
    setState(prev => {
      const src = prev.scenarios[prev.activeScenario];
      return {
        ...prev,
        scenarios: [...prev.scenarios, {
          ...JSON.parse(JSON.stringify(src)),
          name: "Scenario " + (prev.scenarios.length + 1),
          color: CHART_COLORS[prev.scenarios.length % CHART_COLORS.length],
        }],
        activeScenario: prev.scenarios.length,
      };
    });
  };

  const duplicateScenario = () => {
    setState(prev => {
      const src = prev.scenarios[prev.activeScenario];
      return {
        ...prev,
        scenarios: [...prev.scenarios, { ...JSON.parse(JSON.stringify(src)), name: src.name + " (Copy)" }],
        activeScenario: prev.scenarios.length,
      };
    });
  };

  const deleteScenario = () => {
    if (state.scenarios.length <= 1) return;
    setState(prev => {
      const newScenarios = prev.scenarios.filter((_, i) => i !== prev.activeScenario);
      return { ...prev, scenarios: newScenarios, activeScenario: Math.min(prev.activeScenario, newScenarios.length - 1) };
    });
  };

  // Save/Load with named versions
  const handleSaveVersion = () => {
    const name = saveName || "Version " + (savedVersions.length + 1);
    const entry = { name, data: JSON.stringify(state), date: new Date().toLocaleString() };
    setSavedVersions(prev => [...prev, entry]);
    setSaveName("");
    setSaveMsg("Saved: " + name);
    setTimeout(() => setSaveMsg(""), 2000);
  };

  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `franchise-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.assumptions && data.scenarios) {
          setState(data);
          setSaveMsg("Loaded from file!");
          setTimeout(() => setSaveMsg(""), 2000);
        } else {
          setSaveMsg("Invalid file format");
        }
      } catch { setSaveMsg("Invalid JSON file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Calculated data
  const results = useMemo(() => scenarios.map(s => calcScenario(a, s)), [a, scenarios]);
  const result = results[activeScenario];

  // Comparison data for all scenarios
  const comparisonData = useMemo(() => {
    return results.map((r, i) => ({
      name: scenarios[i].name,
      color: scenarios[i].color,
      totalRevenue: r.totalRevenue,
      totalProfit: r.totalProfit,
      endMembers: r.lastRow.activeMembers,
      endFranchises: r.lastRow.activeFranchises,
      breakEvenMonth: r.breakEvenMonth,
    }));
  }, [results, scenarios]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "monthly", label: "Monthly Detail" },
    { id: "sales", label: "Sales Pipeline" },
    { id: "assumptions", label: "Assumptions" },
    { id: "compare", label: "Compare" },
  ];

  const monthLabels = MONTH_LABELS(sc.months.length);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-800 text-white px-6 py-5">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">The Fence Company</h1>
              <p className="text-indigo-200 text-sm mt-1">Franchise Growth Scenario Planner</p>
            </div>
            <div className="flex items-center gap-3">
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-700/50 hover:bg-indigo-600 border border-indigo-500/50 transition">Import JSON</button>
              <button onClick={handleExportJSON} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-700/50 hover:bg-indigo-600 border border-indigo-500/50 transition">Export JSON</button>
              <div className="flex items-center gap-2 bg-indigo-700/30 rounded-lg px-3 py-1.5 border border-indigo-500/30">
                <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Version name..." className="bg-transparent text-xs text-white placeholder-indigo-300 outline-none w-28" />
                <button onClick={handleSaveVersion} className="text-xs font-bold text-indigo-200 hover:text-white">Save</button>
              </div>
              {saveMsg && <span className="text-xs text-green-300 font-medium animate-pulse">{saveMsg}</span>}
            </div>
          </div>
          {/* Scenario Tabs */}
          <div className="flex items-center gap-2 mt-4">
            {scenarios.map((s, i) => (
              <div key={i}
                onClick={() => setState(prev => ({ ...prev, activeScenario: i }))}
                onDoubleClick={() => { setRenamingIdx(i); setRenameValue(s.name); }}
                className={`px-4 py-2 rounded-t-lg text-xs font-medium transition cursor-pointer flex items-center gap-2 ${i === activeScenario ? 'bg-white text-indigo-900 shadow-lg' : 'bg-indigo-700/30 text-indigo-200 hover:bg-indigo-700/50'}`}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {renamingIdx === i ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => { if (renameValue.trim()) updateScenarioField('name', renameValue.trim()); setRenamingIdx(null); }}
                    onKeyDown={e => { if (e.key === 'Enter') { if (renameValue.trim()) updateScenarioField('name', renameValue.trim()); setRenamingIdx(null); } if (e.key === 'Escape') setRenamingIdx(null); }}
                    onClick={e => e.stopPropagation()}
                    className="bg-transparent border-b border-indigo-300 outline-none text-xs w-32 px-0 py-0"
                  />
                ) : (
                  <span>{s.name}</span>
                )}
              </div>
            ))}
            <button onClick={addScenario} className="px-3 py-2 rounded-t-lg text-xs text-indigo-300 hover:text-white hover:bg-indigo-700/30 transition">+ New</button>
            <button onClick={duplicateScenario} className="px-3 py-2 rounded-t-lg text-xs text-indigo-300 hover:text-white hover:bg-indigo-700/30 transition">Duplicate</button>
            {scenarios.length > 1 && <button onClick={deleteScenario} className="px-3 py-2 rounded-t-lg text-xs text-red-300 hover:text-red-200 hover:bg-red-900/30 transition">Delete</button>}
            <span className="text-indigo-400/50 text-xs ml-2">double-click to rename</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Saved Versions Bar */}
      {savedVersions.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-medium text-amber-700 whitespace-nowrap">Saved:</span>
            {savedVersions.map((v, i) => (
              <button key={i} onClick={() => { setState(JSON.parse(v.data)); setSaveMsg("Loaded: " + v.name); setTimeout(() => setSaveMsg(""), 2000); }}
                className="flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-white border border-amber-300 hover:bg-amber-100 transition whitespace-nowrap">
                <span className="font-medium text-amber-800">{v.name}</span>
                <span className="text-amber-500">{v.date}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4">
        {/* ─── OVERVIEW TAB ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-6 gap-3">
              <KPI label="Total Revenue" value={fmtM(result.totalRevenue)} subtext={result.rows.length + " months"} positive />
              <KPI label="Total Profit" value={fmtM(result.totalProfit)} positive={result.totalProfit > 0} negative={result.totalProfit < 0} />
              <KPI label="End Members" value={result.lastRow.activeMembers.toString()} subtext={"T1: " + result.lastRow.activeTier1 + " T2: " + result.lastRow.activeTier2 + " JV: " + result.lastRow.activeJV} />
              <KPI label="End Franchises" value={result.lastRow.activeFranchises.toString()} subtext={fmt(result.lastRow.systemGMV) + "/mo GMV"} />
              <KPI label="Break-Even" value={result.breakEvenMonth >= 0 ? "Month " + (result.breakEvenMonth + 1) : "Never"} subtext={result.breakEvenMonth >= 0 ? monthLabels[result.breakEvenMonth] : ""} positive={result.breakEvenMonth >= 0} />
              <KPI label="Monthly Recurring" value={fmt(result.lastRow.revMembership + result.lastRow.revMaterialMarkup + result.lastRow.revRoyalties)} subtext={"Memberships + Materials + Royalties"} positive />
            </div>

            {/* Revenue & Profit Chart */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-8 bg-white rounded-xl border p-4 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Monthly Revenue & Operating Profit</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={result.rows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} angle={-45} textAnchor="end" height={50} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revFranchiseFees" name="Franchise Fees" fill="#8b5cf6" stackId="rev" opacity={0.8} />
                    <Bar dataKey="revMembership" name="Membership" fill="#3b82f6" stackId="rev" opacity={0.8} />
                    <Bar dataKey="revRoyalties" name="Royalties" fill="#10b981" stackId="rev" opacity={0.8} />
                    <Bar dataKey="revMaterialMarkup" name="Material Markup" fill="#f97316" stackId="rev" opacity={0.8} />
                    <Line dataKey="operatingProfit" name="Op. Profit" stroke="#f59e0b" strokeWidth={3} dot={false} />
                    <Line dataKey="cumProfit" name="Cumulative" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="col-span-4 space-y-4">
                {/* Annual Summary */}
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-800 mb-3">Annual Summary</h3>
                  <div className="space-y-3">
                    {result.years.map(y => (
                      <div key={y.year} className={`rounded-lg p-3 border ${y.profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-gray-800">{y.year}</span>
                          <span className={`text-sm font-bold ${y.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(y.profit)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 mt-2 text-xs text-gray-500">
                          <div>Revenue: <span className="font-medium text-gray-700">{fmtK(y.revenue)}</span></div>
                          <div>Cost: <span className="font-medium text-gray-700">{fmtK(y.cost)}</span></div>
                          <div>Members: <span className="font-medium text-gray-700">{y.endMembers}</span></div>
                          <div>Franchises: <span className="font-medium text-gray-700">{y.endFranchises}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue Mix */}
                <div className="bg-white rounded-xl border p-4 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-800 mb-3">Revenue Mix (Total)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Franchise Fees", value: result.rows.reduce((s, r) => s + r.revFranchiseFees, 0) },
                          { name: "Franchise Dues", value: result.rows.reduce((s, r) => s + r.revFranchiseDues, 0) },
                          { name: "Tier 1", value: result.rows.reduce((s, r) => s + r.revTier1, 0) },
                          { name: "Tier 2", value: result.rows.reduce((s, r) => s + r.revTier2, 0) },
                          { name: "JV Dues", value: result.rows.reduce((s, r) => s + r.revJV, 0) },
                          { name: "Royalties", value: result.rows.reduce((s, r) => s + r.revRoyalties, 0) },
                          { name: "Material Markup", value: result.rows.reduce((s, r) => s + r.revMaterialMarkup, 0) },
                          { name: "Platform Fees", value: result.rows.reduce((s, r) => s + r.revPlatformFees, 0) },
                        ].filter(d => d.value > 0)}
                        dataKey="value" cx="50%" cy="50%" outerRadius={70}
                        label={(props: any) => fmtK(props.value)} style={{ fontSize: 9 }}
                      >
                        {PIE_COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Growth Metrics */}
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Membership & Franchise Growth</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={result.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area dataKey="activeTier1" name="Tier 1" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.3} stackId="m" />
                  <Area dataKey="activeTier2" name="Tier 2" fill="#10b981" stroke="#10b981" fillOpacity={0.3} stackId="m" />
                  <Area dataKey="activeJV" name="JV" fill="#f59e0b" stroke="#f59e0b" fillOpacity={0.3} stackId="m" />
                  <Line dataKey="activeFranchises" name="Franchises" stroke="#ef4444" strokeWidth={3} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ─── MONTHLY DETAIL TAB ──────────────────────────────────────── */}
        {activeTab === "monthly" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border p-4 shadow-sm overflow-x-auto">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Monthly P&L Detail</h3>
              <table className="w-full text-xs min-w-[1200px]">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 px-2 sticky left-0 bg-white font-bold">Month</th>
                    <th className="text-right py-2 px-1">New F</th>
                    <th className="text-right py-2 px-1">New T1</th>
                    <th className="text-right py-2 px-1">New T2</th>
                    <th className="text-right py-2 px-1">New JV</th>
                    <th className="text-right py-2 px-1 bg-blue-50">Members</th>
                    <th className="text-right py-2 px-1 bg-blue-50">Franchises</th>
                    <th className="text-right py-2 px-1">Franchise $</th>
                    <th className="text-right py-2 px-1">Membership $</th>
                    <th className="text-right py-2 px-1">Royalties</th>
                    <th className="text-right py-2 px-1 text-orange-700">Material $</th>
                    <th className="text-right py-2 px-1">Platform</th>
                    <th className="text-right py-2 px-1 font-bold bg-green-50">Revenue</th>
                    <th className="text-right py-2 px-1">Commissions</th>
                    <th className="text-right py-2 px-1">Overhead</th>
                    <th className="text-right py-2 px-1 font-bold bg-red-50">Cost</th>
                    <th className="text-right py-2 px-2 font-bold">Profit</th>
                    <th className="text-right py-2 px-2">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => {
                    // Show year separators
                    const isYearStart = i > 0 && i % 12 === 0;
                    return (
                      <tr key={i} className={`border-b ${r.operatingProfit >= 0 ? '' : 'bg-red-50/30'} ${isYearStart ? 'border-t-2 border-gray-400' : ''} hover:bg-blue-50/30`}>
                        <td className="py-1.5 px-2 font-medium sticky left-0 bg-white">{r.month}</td>
                        <td className="text-right py-1.5 px-1 text-purple-600">{r.newF || ''}</td>
                        <td className="text-right py-1.5 px-1">{r.newT1 || ''}</td>
                        <td className="text-right py-1.5 px-1">{r.newT2 || ''}</td>
                        <td className="text-right py-1.5 px-1">{r.newJV || ''}</td>
                        <td className="text-right py-1.5 px-1 bg-blue-50/50 font-medium">{r.activeMembers}</td>
                        <td className="text-right py-1.5 px-1 bg-blue-50/50 font-medium">{r.activeFranchises}</td>
                        <td className="text-right py-1.5 px-1">{r.revFranchiseFees ? fmtK(r.revFranchiseFees) : '-'}</td>
                        <td className="text-right py-1.5 px-1">{fmtK(r.revMembership)}</td>
                        <td className="text-right py-1.5 px-1">{r.revRoyalties ? fmtK(r.revRoyalties) : '-'}</td>
                        <td className="text-right py-1.5 px-1 text-orange-600">{r.revMaterialMarkup ? fmtK(r.revMaterialMarkup) : '-'}</td>
                        <td className="text-right py-1.5 px-1 text-gray-400">{fmt(r.revPlatformFees)}</td>
                        <td className="text-right py-1.5 px-1 font-bold bg-green-50/50">{fmtK(r.totalRevenue)}</td>
                        <td className="text-right py-1.5 px-1">{r.costCommissions ? fmtK(r.costCommissions) : '-'}</td>
                        <td className="text-right py-1.5 px-1">{fmtK(r.costOverhead)}</td>
                        <td className="text-right py-1.5 px-1 font-bold bg-red-50/50">{fmtK(r.totalCost)}</td>
                        <td className={`text-right py-1.5 px-2 font-bold ${r.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtK(r.operatingProfit)}</td>
                        <td className={`text-right py-1.5 px-2 ${r.cumProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtK(r.cumProfit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* System GMV Chart */}
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-3">System GMV (with Franchise Ramp)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={result.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <defs>
                    <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area dataKey="systemGMV" name="System GMV" stroke="#8b5cf6" fill="url(#gmvGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ─── SALES PIPELINE TAB ──────────────────────────────────────── */}
        {activeTab === "sales" && (
          <div className="space-y-4">
            <Section title={"Scenario: " + sc.name} color="indigo">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <InputField label="Starting Tier 1" value={sc.startingTier1} onChange={v => updateScenarioField('startingTier1', Math.max(0, v))} />
                <InputField label="Starting Tier 2" value={sc.startingTier2} onChange={v => updateScenarioField('startingTier2', Math.max(0, v))} />
                <InputField label="Starting JV" value={sc.startingJV} onChange={v => updateScenarioField('startingJV', Math.max(0, v))} />
                <InputField label="Starting Franchises" value={sc.startingFranchises} onChange={v => updateScenarioField('startingFranchises', Math.max(0, v))} />
              </div>
            </Section>

            <div className="bg-white rounded-xl border p-4 shadow-sm overflow-x-auto">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="font-bold text-sm text-gray-800">Monthly New Sales (edit each cell)</h3>
                  <p className="text-xs text-gray-500">Enter the number of new sales per month. Existing members carry forward automatically.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => {
                    const m = [...sc.months];
                    if (m.length < 120) { for (let i = 0; i < 12; i++) m.push({ franchises: 0, tier1: 0, tier2: 0, jv: 0 }); updateScenarioField('months', m); }
                  }} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">+ Add Year</button>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 px-2 font-bold w-24">Month</th>
                    <th className="text-center py-2 px-1 font-bold text-purple-700 w-20">Franchises</th>
                    <th className="text-center py-2 px-1 font-bold text-blue-700 w-20">Tier 1</th>
                    <th className="text-center py-2 px-1 font-bold text-green-700 w-20">Tier 2</th>
                    <th className="text-center py-2 px-1 font-bold text-amber-700 w-20">JV</th>
                    <th className="text-right py-2 px-2 font-bold bg-gray-50 w-20">Active Mbrs</th>
                    <th className="text-right py-2 px-2 font-bold bg-gray-50 w-20">Active Fran</th>
                    <th className="text-right py-2 px-2 font-bold bg-green-50 w-24">Revenue</th>
                    <th className="text-right py-2 px-2 font-bold w-24">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {sc.months.map((m, i) => {
                    const r = result.rows[i];
                    const isYearStart = i > 0 && i % 12 === 0;
                    return (
                      <tr key={i} className={`border-b hover:bg-indigo-50/30 ${isYearStart ? 'border-t-2 border-gray-400' : ''}`}>
                        <td className="py-1 px-2 font-medium text-gray-600">{monthLabels[i]}</td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.franchises} onChange={e => updateMonthSales(i, 'franchises', parseInt(e.target.value) || 0)} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-purple-400 focus:border-purple-400 outline-none" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.tier1} onChange={e => updateMonthSales(i, 'tier1', parseInt(e.target.value) || 0)} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.tier2} onChange={e => updateMonthSales(i, 'tier2', parseInt(e.target.value) || 0)} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-green-400 focus:border-green-400 outline-none" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.jv} onChange={e => updateMonthSales(i, 'jv', parseInt(e.target.value) || 0)} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none" /></td>
                        <td className="text-right py-1 px-2 bg-gray-50/50 font-medium">{r?.activeMembers}</td>
                        <td className="text-right py-1 px-2 bg-gray-50/50 font-medium">{r?.activeFranchises}</td>
                        <td className="text-right py-1 px-2 bg-green-50/50 font-medium">{r ? fmtK(r.totalRevenue) : '-'}</td>
                        <td className={`text-right py-1 px-2 font-bold ${r && r.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{r ? fmtK(r.operatingProfit) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── ASSUMPTIONS TAB ─────────────────────────────────────────── */}
        {activeTab === "assumptions" && (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-4 space-y-4">
              <Section title="Pricing" color="blue">
                <InputField label="Franchise Fee" value={a.franchiseFee} onChange={v => updateAssumption('franchiseFee', v)} prefix="$" step={1000} />
                <InputField label="Tier 1 Monthly" value={a.tier1Price} onChange={v => updateAssumption('tier1Price', v)} prefix="$" step={100} />
                <InputField label="Tier 2 Monthly" value={a.tier2Price} onChange={v => updateAssumption('tier2Price', v)} prefix="$" step={100} />
                <InputField label="JV Monthly" value={a.jvPrice} onChange={v => updateAssumption('jvPrice', v)} prefix="$" step={100} />
                <InputField label="Franchise Monthly Dues" value={a.franchiseMembershipPrice} onChange={v => updateAssumption('franchiseMembershipPrice', v)} prefix="$" step={100} />
              </Section>
              <Section title="Commissions" color="amber">
                <InputField label="Per Franchise Sale" value={a.commissionPerFranchise} onChange={v => updateAssumption('commissionPerFranchise', v)} prefix="$" step={500} />
                <InputField label="Per Tier 1 Sale" value={a.commissionPerTier1} onChange={v => updateAssumption('commissionPerTier1', v)} prefix="$" step={50} />
                <InputField label="Per Tier 2 Sale" value={a.commissionPerTier2} onChange={v => updateAssumption('commissionPerTier2', v)} prefix="$" step={50} />
                <InputField label="Per JV Sale" value={a.commissionPerJV} onChange={v => updateAssumption('commissionPerJV', v)} prefix="$" step={50} />
              </Section>
            </div>
            <div className="col-span-4 space-y-4">
              <Section title="Operations" color="green">
                <InputField label="Monthly Overhead" value={a.overheadMonthly} onChange={v => updateAssumption('overheadMonthly', v)} prefix="$" step={1000} />
                <InputField label="Royalty Rate" value={a.royaltyRate * 100} onChange={v => updateAssumption('royaltyRate', v / 100)} suffix="%" step={0.5} />
                <InputField label="Platform Fee Rate" value={a.platformFeeRate * 100} onChange={v => updateAssumption('platformFeeRate', v / 100)} suffix="%" step={0.01} />
              </Section>
              <Section title="Franchise Economics" color="purple">
                <InputField label="GMV per Franchise/Month" value={a.gmvPerFranchiseMonthly} onChange={v => updateAssumption('gmvPerFranchiseMonthly', v)} prefix="$" step={5000} />
                <InputField label="GMV per JV/Month" value={a.gmvPerJVMonthly} onChange={v => updateAssumption('gmvPerJVMonthly', v)} prefix="$" step={5000} />
                <InputField label="GMV Ramp Months" value={a.gmvRampMonths} onChange={v => updateAssumption('gmvRampMonths', v)} step={1} min={1} max={12} />
                <div className="mt-3 p-3 bg-purple-100 rounded-lg text-xs text-purple-800">
                  <p className="font-bold mb-1">Franchise & JV GMV Model</p>
                  <p>Franchises ramp to {fmt(a.gmvPerFranchiseMonthly)}/mo, JVs ramp to {fmt(a.gmvPerJVMonthly)}/mo over {a.gmvRampMonths} months.</p>
                  <p className="mt-1">HQ earns {fmtPct(a.royaltyRate)} royalties + {fmtPct(a.materialPctOfGMV * a.materialMarkup)} material markup + {fmtPct(a.platformFeeRate)} platform fees on all GMV.</p>
                </div>
              </Section>
              <Section title="Material Sales" color="amber">
                <InputField label="Materials % of GMV" value={a.materialPctOfGMV * 100} onChange={v => updateAssumption('materialPctOfGMV', v / 100)} suffix="%" step={1} min={0} max={100} />
                <InputField label="HQ Markup on Materials" value={a.materialMarkup * 100} onChange={v => updateAssumption('materialMarkup', v / 100)} suffix="%" step={0.5} min={0} max={50} />
                <div className="mt-3 p-3 bg-amber-100 rounded-lg text-xs text-amber-800">
                  <p className="font-bold mb-1">Material Sales Model</p>
                  <p>Franchises & JVs purchase {fmtPctWhole(a.materialPctOfGMV * 100)} of their GMV in materials through HQ.</p>
                  <p className="mt-1">HQ earns a {fmtPctWhole(a.materialMarkup * 100)} markup = <span className="font-bold">{fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialMarkup)}/franchise/month</span> at steady state.</p>
                  <p className="mt-1">Per franchise annual material profit: <span className="font-bold">{fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialMarkup * 12)}</span></p>
                </div>
              </Section>
            </div>
            <div className="col-span-4 space-y-4">
              <Section title="Churn Rates (Monthly)" color="red">
                <InputField label="Tier 1 Churn" value={a.churnRateTier1 * 100} onChange={v => updateAssumption('churnRateTier1', v / 100)} suffix="%" step={0.5} />
                <InputField label="Tier 2 Churn" value={a.churnRateTier2 * 100} onChange={v => updateAssumption('churnRateTier2', v / 100)} suffix="%" step={0.5} />
                <InputField label="JV Churn" value={a.churnRateJV * 100} onChange={v => updateAssumption('churnRateJV', v / 100)} suffix="%" step={0.25} />
                <InputField label="Franchise Churn" value={a.churnRateFranchise * 100} onChange={v => updateAssumption('churnRateFranchise', v / 100)} suffix="%" step={0.25} />
                <div className="mt-3 p-3 bg-red-100 rounded-lg text-xs text-red-800">
                  <p className="font-bold mb-1">Churn Impact</p>
                  <p>At {(a.churnRateTier1 * 100).toFixed(1)}% monthly T1 churn, annual retention is ~{((1 - a.churnRateTier1) ** 12 * 100).toFixed(0)}%.</p>
                  <p>At {(a.churnRateFranchise * 100).toFixed(1)}% monthly franchise churn, you lose ~{(a.churnRateFranchise * 12 * 100).toFixed(0)}% per year.</p>
                </div>
              </Section>
              <Section title="Quick Sensitivity" color="indigo">
                <div className="space-y-2 text-xs">
                  <p className="text-gray-600">Each additional Tier 1 member = <span className="font-bold text-indigo-700">{fmt(a.tier1Price * 12)}/year</span></p>
                  <p className="text-gray-600">Each additional Tier 2 member = <span className="font-bold text-indigo-700">{fmt(a.tier2Price * 12)}/year</span></p>
                  <p className="text-gray-600">Each additional JV = <span className="font-bold text-indigo-700">{fmt(a.jvPrice * 12)}/yr dues + {fmt(a.gmvPerJVMonthly * 12 * (a.royaltyRate + a.materialPctOfGMV * a.materialMarkup + a.platformFeeRate))}/yr from GMV</span></p>
                  <p className="text-gray-600">Each franchise sale = <span className="font-bold text-indigo-700">{fmt(a.franchiseFee)} upfront + {fmt(a.gmvPerFranchiseMonthly * 12 * a.royaltyRate)}/yr royalties + {fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialMarkup * 12)}/yr materials</span></p>
                  <p className="text-gray-600">Net per franchise sale (after comm.) = <span className="font-bold text-indigo-700">{fmt(a.franchiseFee - a.commissionPerFranchise)}</span></p>
                  <p className="text-gray-600">Annual recurring per franchise = <span className="font-bold text-indigo-700">{fmt(a.franchiseMembershipPrice * 12 + a.gmvPerFranchiseMonthly * 12 * (a.royaltyRate + a.materialPctOfGMV * a.materialMarkup + a.platformFeeRate))}</span> (dues + GMV income)</p>
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* ─── COMPARE TAB ─────────────────────────────────────────────── */}
        {activeTab === "compare" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Side by Side KPIs */}
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Scenario Comparison</h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2">
                      <th className="text-left py-2">Metric</th>
                      {scenarios.map((s, i) => <th key={i} className="text-right py-2 px-2">
                        <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Total Revenue", get: (r: any) => fmtM(r.totalRevenue) },
                      { label: "Total Profit", get: (r: any) => fmtM(r.totalProfit) },
                      { label: "End Members", get: (r: any) => r.lastRow.activeMembers },
                      { label: "End Franchises", get: (r: any) => r.lastRow.activeFranchises },
                      { label: "Monthly Recurring (end)", get: (r: any) => fmt(r.lastRow.revMembership) },
                      { label: "Monthly GMV (end)", get: (r: any) => fmt(r.lastRow.systemGMV) },
                      { label: "Break-Even Month", get: (r: any) => r.breakEvenMonth >= 0 ? "Month " + (r.breakEvenMonth + 1) : "Never" },
                      { label: "Avg Monthly Profit", get: (r: any) => fmt(r.totalProfit / r.rows.length) },
                    ].map(metric => (
                      <tr key={metric.label} className="border-b">
                        <td className="py-2 font-medium text-gray-600">{metric.label}</td>
                        {results.map((r, i) => <td key={i} className="text-right py-2 px-2 font-medium">{metric.get(r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cumulative Profit Overlay */}
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Cumulative Profit Overlay</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={5} angle={-45} textAnchor="end" height={50}
                      allowDuplicatedCategory={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
                    {results.map((r, i) => (
                      <Line key={i} data={r.rows} dataKey="cumProfit" name={scenarios[i].name}
                        stroke={scenarios[i].color} strokeWidth={2.5} dot={false} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue Overlay */}
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Monthly Revenue Overlay</h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={5} angle={-45} textAnchor="end" height={50}
                    allowDuplicatedCategory={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {results.map((r, i) => (
                    <Line key={i} data={r.rows} dataKey="totalRevenue" name={scenarios[i].name}
                      stroke={scenarios[i].color} strokeWidth={2} dot={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Annual Comparison Table */}
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Annual P&L by Scenario</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 px-2">Scenario</th>
                      <th className="text-left py-2 px-2">Year</th>
                      <th className="text-right py-2 px-2">Franchise Fees</th>
                      <th className="text-right py-2 px-2">Membership</th>
                      <th className="text-right py-2 px-2">Royalties</th>
                      <th className="text-right py-2 px-2 text-orange-700">Material Markup</th>
                      <th className="text-right py-2 px-2">Platform</th>
                      <th className="text-right py-2 px-2 font-bold bg-green-50">Revenue</th>
                      <th className="text-right py-2 px-2 font-bold bg-red-50">Cost</th>
                      <th className="text-right py-2 px-2 font-bold">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, si) => results[si].years.map((y, yi) => (
                      <tr key={`${si}-${yi}`} className={`border-b ${yi === 0 && si > 0 ? 'border-t-2 border-gray-400' : ''}`}>
                        {yi === 0 && <td rowSpan={results[si].years.length} className="py-2 px-2 font-bold align-top">
                          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </td>}
                        <td className="py-2 px-2 font-medium">{y.year}</td>
                        <td className="text-right py-2 px-2">{fmt(y.franchiseFees)}</td>
                        <td className="text-right py-2 px-2">{fmt(y.membership)}</td>
                        <td className="text-right py-2 px-2">{fmt(y.royalties)}</td>
                        <td className="text-right py-2 px-2 text-orange-600">{fmt(y.materialMarkup)}</td>
                        <td className="text-right py-2 px-2">{fmt(y.platformFees)}</td>
                        <td className="text-right py-2 px-2 font-bold bg-green-50">{fmt(y.revenue)}</td>
                        <td className="text-right py-2 px-2 font-bold bg-red-50">{fmt(y.cost)}</td>
                        <td className={`text-right py-2 px-2 font-bold ${y.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(y.profit)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
