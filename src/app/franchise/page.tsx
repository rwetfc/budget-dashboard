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
  // Overhead scaling: $25K salary unit supports X of each type
  overheadSalaryUnit: number;        // cost per "support unit" ($25K)
  overheadCapFranchiseJV: number;    // franchises+JVs per unit (5)
  overheadCapTier1: number;          // tier1 members per unit (15)
  overheadCapTier2: number;          // tier2 members per unit (12)
  overheadScaleExponent: number;     // <1 = economies of scale (0.8 default)
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
  materialStartMonth: number;   // 0-indexed month when material distribution begins (0 = Jan 2026)
  materialAdoptionRate: number;  // max % of materials purchased through HQ (0.75 = 75%)
  materialRampMonths: number;    // months for a location to ramp to full adoption after program starts
  seasonalityEnabled: boolean;   // apply seasonal GMV curve (fencing peaks spring/summer)
  effectiveTaxRate: number;      // combined federal+state effective tax rate (0.25 = 25%)
}
interface AppState { assumptions: Assumptions; scenarios: Scenario[]; activeScenario: number; }

// ─── Defaults ───────────────────────────────────────────────────────────────
const MONTHS_60 = (): MonthSales[] => Array.from({ length: 60 }, () => ({ franchises: 0, tier1: 0, tier2: 0, jv: 0 }));
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
  overheadSalaryUnit: 25000,
  overheadCapFranchiseJV: 5,
  overheadCapTier1: 15,
  overheadCapTier2: 12,
  overheadScaleExponent: 0.8,
  royaltyRate: 0.04,
  platformFeeRate: 0.0033,
  tier1Price: 1000,
  tier2Price: 2000,
  jvPrice: 3500,
  franchiseMembershipPrice: 3500,
  gmvPerFranchiseMonthly: 83333,
  gmvPerJVMonthly: 83333,
  gmvRampMonths: 4,
  churnRateTier1: 0.20,       // 20% annual → converted to monthly in calc engine
  churnRateTier2: 0.10,       // 10% annual
  churnRateJV: 0.05,          // 5% annual
  churnRateFranchise: 0.05,   // 5% annual
  materialPctOfGMV: 0.40,
  materialMarkup: 0.10,
  materialStartMonth: 15,   // April 2027 (0-indexed from Jan 2026)
  materialAdoptionRate: 0.75,  // 75% of materials purchased through HQ at full adoption
  materialRampMonths: 4,       // 4 months per location to reach full adoption
  seasonalityEnabled: true,    // fencing seasonal curve on by default
  effectiveTaxRate: 0.25,      // 25% combined federal + state
};

function buildFlatScenario(): Scenario {
  const m = MONTHS_60();
  // Apr-Sep 2026: 3 franchise, 4 T1, 2 T2 per month
  for (let i = 3; i <= 8; i++) { m[i] = { franchises: 3, tier1: 4, tier2: 2, jv: 0 }; }
  // Oct 2026: 1 franchise, 3 T1, 1 T2
  m[9] = { franchises: 1, tier1: 3, tier2: 1, jv: 0 };
  // Nov 2026: 1 franchise, 3 T1, 0 T2
  m[10] = { franchises: 1, tier1: 3, tier2: 0, jv: 0 };
  return { name: "Flat 3yr Steady State", startingTier1: 3, startingTier2: 1, startingJV: 1, startingFranchises: 0, months: m, color: "#3b82f6" };
}

function buildExpansionScenario(): Scenario {
  const m = MONTHS_60();
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
function fmtK(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0;
  let s: string;
  if (abs >= 1000000) s = "$" + (abs / 1000000).toFixed(1) + "M";
  else if (abs >= 1000) s = "$" + (abs / 1000).toFixed(0) + "K";
  else s = "$" + Math.round(abs).toString();
  return sign ? "(" + s + ")" : s;
}
function fmtM(n: number) { return n >= 0 ? "$" + (n / 1000000).toFixed(2) + "M" : "($" + (Math.abs(n) / 1000000).toFixed(2) + "M)"; }
function fmtPct(n: number) { return (n * 100).toFixed(1) + "%"; }
function fmtPctWhole(n: number) { return n.toFixed(1) + "%"; }

// ─── Churn Conversion ────────────────────────────────────────────────────────
// Convert annual churn rate to equivalent monthly rate with proper compounding:
// monthly = 1 − (1 − annual)^(1/12)
// e.g. 5% annual → 0.427% monthly, NOT 0.417% (simple division)
function annualToMonthlyChurn(annual: number): number {
  if (annual <= 0) return 0;
  if (annual >= 1) return 1;
  return 1 - Math.pow(1 - annual, 1 / 12);
}

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
// Deterministic random: same seed always produces same sequence.
// Prevents dashboard jitter on re-renders while giving random churn selection.
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Seasonal GMV Weights ────────────────────────────────────────────────────
// Fencing industry: peaks May-Jul, troughs Dec-Feb. Normalized to average 1.0.
const SEASONAL_RAW = [0.50, 0.55, 0.85, 1.15, 1.40, 1.50, 1.45, 1.30, 1.10, 0.80, 0.55, 0.40];
const SEASONAL_SUM = SEASONAL_RAW.reduce((s, v) => s + v, 0);
const SEASONAL_WEIGHTS = SEASONAL_RAW.map(w => (w * 12) / SEASONAL_SUM);
// SEASONAL_WEIGHTS averages exactly 1.0, so annual GMV totals are preserved.

// ─── Overhead Scaling ───────────────────────────────────────────────────────
// Each $25K salary unit supports 5 franchises/JVs, 15 T1, or 12 T2.
// We compute "load units" needed, then apply a power curve (exponent < 1)
// so doubling load doesn't double cost — economies of scale.
// Formula: overhead = base + salaryUnit * loadUnits^exponent
function calcOverhead(a: Assumptions, franchises: number, jv: number, t1: number, t2: number): number {
  const loadFranJV = (franchises + jv) / Math.max(1, a.overheadCapFranchiseJV);
  const loadT1 = t1 / Math.max(1, a.overheadCapTier1);
  const loadT2 = t2 / Math.max(1, a.overheadCapTier2);
  const rawUnits = loadFranJV + loadT1 + loadT2;
  // Apply economies of scale: units^exponent (exponent < 1 means sublinear)
  const scaledUnits = rawUnits > 0 ? Math.pow(rawUnits, a.overheadScaleExponent) : 0;
  // Base overhead is the minimum floor, salary scales on top
  return a.overheadMonthly + a.overheadSalaryUnit * scaledUnits;
}

// ─── Calculation Engine ─────────────────────────────────────────────────────
function calcScenario(a: Assumptions, sc: Scenario, scenarioIdx: number) {
  const labels = MONTH_LABELS(sc.months.length);
  let activeTier1 = sc.startingTier1;
  let activeTier2 = sc.startingTier2;
  let activeJV = sc.startingJV;
  let activeFranchises = sc.startingFranchises;
  // Track ages for GMV ramp (franchises and JVs)
  const franchiseAges: number[] = Array(sc.startingFranchises).fill(a.gmvRampMonths + 1);
  const jvAges: number[] = Array(sc.startingJV).fill(a.gmvRampMonths + 1);

  // Seeded PRNG for deterministic random churn (seed = scenario index)
  const rng = mulberry32(scenarioIdx * 7919 + 42);

  const rows = sc.months.map((m, i) => {
    // New sales
    const newF = m.franchises;
    const newT1 = m.tier1;
    const newT2 = m.tier2;
    const newJV = m.jv;

    // Churn: rates are stored as ANNUAL, converted to monthly via compounding formula
    const mChurnT1 = annualToMonthlyChurn(a.churnRateTier1);
    const mChurnT2 = annualToMonthlyChurn(a.churnRateTier2);
    const mChurnJV = annualToMonthlyChurn(a.churnRateJV);
    const mChurnF  = annualToMonthlyChurn(a.churnRateFranchise);

    const churnedT1 = Math.floor(activeTier1 * mChurnT1);
    const churnedT2 = Math.floor(activeTier2 * mChurnT2);
    const churnedJV = Math.floor(activeJV * mChurnJV);
    const churnedF = Math.floor(activeFranchises * mChurnF);

    activeTier1 = Math.max(0, activeTier1 - churnedT1 + newT1);
    activeTier2 = Math.max(0, activeTier2 - churnedT2 + newT2);
    activeJV = Math.max(0, activeJV - churnedJV + newJV);
    activeFranchises = Math.max(0, activeFranchises - churnedF + newF);

    // Age existing franchises and add new
    for (let f = 0; f < franchiseAges.length; f++) franchiseAges[f]++;
    for (let f = 0; f < newF; f++) franchiseAges.push(1);
    // Random churn removal (seeded PRNG — deterministic for same inputs)
    for (let f = 0; f < churnedF && franchiseAges.length > 0; f++) {
      const idx = Math.floor(rng() * franchiseAges.length);
      franchiseAges.splice(idx, 1);
    }

    // Age existing JVs and add new
    for (let j = 0; j < jvAges.length; j++) jvAges[j]++;
    for (let j = 0; j < newJV; j++) jvAges.push(1);
    for (let j = 0; j < churnedJV && jvAges.length > 0; j++) {
      const idx = Math.floor(rng() * jvAges.length);
      jvAges.splice(idx, 1);
    }

    // Seasonal multiplier (preserves annual totals — weights average 1.0)
    const seasonFactor = a.seasonalityEnabled ? SEASONAL_WEIGHTS[i % 12] : 1.0;

    // GMV calculation with ramp + seasonality — Franchises
    let franchiseGMV = 0;
    for (const age of franchiseAges) {
      const rampFactor = Math.min(age / a.gmvRampMonths, 1);
      franchiseGMV += a.gmvPerFranchiseMonthly * rampFactor * seasonFactor;
    }
    // GMV calculation with ramp + seasonality — JVs
    let jvGMV = 0;
    for (const age of jvAges) {
      const rampFactor = Math.min(age / a.gmvRampMonths, 1);
      jvGMV += a.gmvPerJVMonthly * rampFactor * seasonFactor;
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
    const revPlatformFees = systemGMV * a.platformFeeRate;
    // Material sales: per-location adoption ramp after program start with seasonality
    let materialGMV = 0;
    if (i >= a.materialStartMonth) {
      const programMonths = i - a.materialStartMonth + 1;
      for (const age of franchiseAges) {
        const locMonthsInProgram = Math.min(age, programMonths);
        const adoptionFactor = Math.min(locMonthsInProgram / Math.max(1, a.materialRampMonths), 1) * a.materialAdoptionRate;
        const rampFactor = Math.min(age / a.gmvRampMonths, 1);
        materialGMV += a.gmvPerFranchiseMonthly * rampFactor * adoptionFactor * seasonFactor;
      }
      for (const age of jvAges) {
        const locMonthsInProgram = Math.min(age, programMonths);
        const adoptionFactor = Math.min(locMonthsInProgram / Math.max(1, a.materialRampMonths), 1) * a.materialAdoptionRate;
        const rampFactor = Math.min(age / a.gmvRampMonths, 1);
        materialGMV += a.gmvPerJVMonthly * rampFactor * adoptionFactor * seasonFactor;
      }
    }
    const materialVolume = materialGMV * a.materialPctOfGMV;
    const revMaterialMarkup = materialVolume * a.materialMarkup;
    const totalRevenue = revHeadOffice + revRoyalties + revPlatformFees + revMaterialMarkup;

    // Costs
    const costCommFranchise = newF * a.commissionPerFranchise;
    const costCommTier1 = newT1 * a.commissionPerTier1;
    const costCommTier2 = newT2 * a.commissionPerTier2;
    const costCommJV = newJV * a.commissionPerJV;
    const costCommissions = costCommFranchise + costCommTier1 + costCommTier2 + costCommJV;
    const costOverhead = calcOverhead(a, activeFranchises, activeJV, activeTier1, activeTier2);
    const totalCost = costCommissions + costOverhead;

    const operatingProfit = totalRevenue - totalCost;
    // Tax: only on positive income (no tax benefit on losses in this simple model)
    const taxExpense = Math.max(0, operatingProfit * a.effectiveTaxRate);
    const netIncome = operatingProfit - taxExpense;

    return {
      month: labels[i],
      monthIdx: i,
      newF, newT1, newT2, newJV,
      activeTier1, activeTier2, activeJV, activeFranchises,
      activeMembers: activeTier1 + activeTier2,
      franchiseGMV, jvGMV, systemGMV,
      revFranchiseFees, revTier1, revTier2, revJV, revFranchiseDues, revMembership, revHeadOffice,
      revRoyalties, revPlatformFees, materialVolume, revMaterialMarkup, totalRevenue,
      costCommissions, costOverhead, totalCost,
      operatingProfit, taxExpense, netIncome,
      cumProfit: 0,
      cumRevenue: 0,
      cumNetIncome: 0,
    };
  });

  let cum = 0, cumR = 0, cumNI = 0;
  rows.forEach(r => { cum += r.operatingProfit; cumR += r.totalRevenue; cumNI += r.netIncome; r.cumProfit = cum; r.cumRevenue = cumR; r.cumNetIncome = cumNI; });

  // Yearly aggregation
  const years: { year: number; revenue: number; cost: number; profit: number; tax: number; netIncome: number; franchiseFees: number; membership: number; royalties: number; platformFees: number; materialMarkup: number; commissions: number; overhead: number; endMembers: number; endJV: number; endFranchises: number; gmv: number; }[] = [];
  for (let y = 0; y < Math.ceil(rows.length / 12); y++) {
    const slice = rows.slice(y * 12, (y + 1) * 12);
    if (slice.length === 0) continue;
    const last = slice[slice.length - 1];
    years.push({
      year: 2026 + y,
      revenue: slice.reduce((s, r) => s + r.totalRevenue, 0),
      cost: slice.reduce((s, r) => s + r.totalCost, 0),
      profit: slice.reduce((s, r) => s + r.operatingProfit, 0),
      tax: slice.reduce((s, r) => s + r.taxExpense, 0),
      netIncome: slice.reduce((s, r) => s + r.netIncome, 0),
      franchiseFees: slice.reduce((s, r) => s + r.revFranchiseFees, 0),
      membership: slice.reduce((s, r) => s + r.revMembership, 0),
      royalties: slice.reduce((s, r) => s + r.revRoyalties, 0),
      platformFees: slice.reduce((s, r) => s + r.revPlatformFees, 0),
      materialMarkup: slice.reduce((s, r) => s + r.revMaterialMarkup, 0),
      commissions: slice.reduce((s, r) => s + r.costCommissions, 0),
      overhead: slice.reduce((s, r) => s + r.costOverhead, 0),
      endMembers: last.activeTier1 + last.activeTier2,
      endJV: last.activeJV,
      endFranchises: last.activeFranchises,
      gmv: slice.reduce((s, r) => s + r.systemGMV, 0),
    });
  }

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.operatingProfit, 0);
  const lastRow = rows[rows.length - 1];
  const breakEvenMonth = rows.findIndex(r => r.cumProfit > 0);

  return { rows, years, totalRevenue, totalProfit, lastRow, breakEvenMonth };
}

// Project EBITDA at a future sale year beyond the model period
// Assumes no new sales after model ends — just churn + fully ramped recurring revenue
function projectSaleYearEbitda(a: Assumptions, lastRow: any, modelEndYear: number, saleYear: number): number {
  if (saleYear <= modelEndYear) {
    return 0;
  }
  let { activeFranchises, activeJV, activeTier1, activeTier2 } = lastRow;
  const mChurnF = annualToMonthlyChurn(a.churnRateFranchise);
  const mChurnJV = annualToMonthlyChurn(a.churnRateJV);
  const mChurnT1 = annualToMonthlyChurn(a.churnRateTier1);
  const mChurnT2 = annualToMonthlyChurn(a.churnRateTier2);

  // Fast-forward month by month from end of model to Dec of saleYear
  // Model ends at Dec of modelEndYear, so first projected month = Jan of modelEndYear+1
  const extraMonths = (saleYear - modelEndYear) * 12;
  const monthlyProfits: number[] = [];
  for (let m = 0; m < extraMonths; m++) {
    // Churn (no new sales)
    activeFranchises = Math.max(0, activeFranchises - Math.floor(activeFranchises * mChurnF));
    activeJV = Math.max(0, activeJV - Math.floor(activeJV * mChurnJV));
    activeTier1 = Math.max(0, activeTier1 - Math.floor(activeTier1 * mChurnT1));
    activeTier2 = Math.max(0, activeTier2 - Math.floor(activeTier2 * mChurnT2));

    // Seasonal GMV — m=0 is Jan of modelEndYear+1
    const calendarMonth = m % 12; // 0=Jan, 11=Dec
    const seasonFactor = a.seasonalityEnabled ? SEASONAL_WEIGHTS[calendarMonth] : 1.0;

    const franchiseGMV = activeFranchises * a.gmvPerFranchiseMonthly * seasonFactor;
    const jvGMV = activeJV * a.gmvPerJVMonthly * seasonFactor;
    const systemGMV = franchiseGMV + jvGMV;

    // Revenue (no franchise fees — no new sales)
    const revMembership = activeTier1 * a.tier1Price + activeTier2 * a.tier2Price
      + activeJV * a.jvPrice + activeFranchises * a.franchiseMembershipPrice;
    const revRoyalties = systemGMV * a.royaltyRate;
    const revPlatformFees = systemGMV * a.platformFeeRate;
    const revMaterialMarkup = systemGMV * a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup;
    const totalRevenue = revMembership + revRoyalties + revPlatformFees + revMaterialMarkup;

    // Costs (no commissions — no new sales)
    const costOverhead = calcOverhead(a, activeFranchises, activeJV, activeTier1, activeTier2);
    const operatingProfit = totalRevenue - costOverhead;
    monthlyProfits.push(operatingProfit);
  }

  // Return trailing 12-month EBITDA (pre-tax — standard for valuation multiples)
  const trailing12 = monthlyProfits.slice(-12);
  return trailing12.reduce((s, p) => s + p, 0);
}

// ─── Components ─────────────────────────────────────────────────────────────
function KPI({ label, value, subtext, positive, negative }: { label: string; value: string; subtext?: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${negative ? 'bg-red-50 border border-red-200' : positive ? 'bg-green-50 border border-green-200' : 'bg-white border border-gray-200'} shadow-sm overflow-hidden`}>
      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide truncate">{label}</div>
      <div className={`text-lg font-bold mt-1 truncate ${negative ? 'text-red-600' : positive ? 'text-green-600' : 'text-gray-900'}`}>{value}</div>
      {subtext && <div className="text-[10px] text-gray-400 mt-1 truncate">{subtext}</div>}
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
  const [saveMsg, setSaveMsg] = useState("");
  const [savedVersions, setSavedVersions] = useState<{ name: string; data: string; date: string }[]>([]);
  const [saveName, setSaveName] = useState("");
  const [renamingIdx, setRenamingIdx] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Commission calculator state
  const [calcFranchises, setCalcFranchises] = useState(5);
  const [calcTier1, setCalcTier1] = useState(10);
  const [calcTier2, setCalcTier2] = useState(5);
  const [calcJV, setCalcJV] = useState(2);
  // EBITDA Valuation calculator state
  const [ebitdaMultiple, setEbitdaMultiple] = useState(5);
  const [saleYear, setSaleYear] = useState(2030);

  const { assumptions: a, scenarios, activeScenario } = state;
  const sc = scenarios[activeScenario];

  const updateAssumption = (key: keyof Assumptions, val: number | boolean) =>
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

  // Backfill any missing assumption fields with defaults so old JSON files don't produce NaN
  // Also migrate old monthly churn rates → annual (old files had values like 0.005-0.02)
  const migrateState = (data: any): AppState => {
    const merged: Assumptions = { ...DEFAULT_ASSUMPTIONS, ...data.assumptions };
    // Detect old monthly churn rates (all < 0.05 means they were monthly, not annual)
    const oldChurns = [data.assumptions?.churnRateTier1, data.assumptions?.churnRateTier2,
      data.assumptions?.churnRateJV, data.assumptions?.churnRateFranchise].filter(Boolean);
    if (oldChurns.length > 0 && oldChurns.every((c: number) => c < 0.04)) {
      // Convert monthly → annual: annual = 1 - (1 - monthly)^12
      if (data.assumptions?.churnRateTier1) merged.churnRateTier1 = 1 - Math.pow(1 - data.assumptions.churnRateTier1, 12);
      if (data.assumptions?.churnRateTier2) merged.churnRateTier2 = 1 - Math.pow(1 - data.assumptions.churnRateTier2, 12);
      if (data.assumptions?.churnRateJV) merged.churnRateJV = 1 - Math.pow(1 - data.assumptions.churnRateJV, 12);
      if (data.assumptions?.churnRateFranchise) merged.churnRateFranchise = 1 - Math.pow(1 - data.assumptions.churnRateFranchise, 12);
    }
    return { ...data, assumptions: merged };
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.assumptions && data.scenarios) {
          setState(migrateState(data));
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

  // Seasonal auto-distribute: type a total in the header and it fills months with seasonal weighting
  // Franchises/JV: selling season Jul-Oct (months 6-9 within each year)
  // Memberships (T1/T2): heavier Apr-Sep (months 3-8), lighter rest of year
  const seasonalDistribute = (field: keyof MonthSales, total: number) => {
    setState(prev => {
      const newScenarios = [...prev.scenarios];
      const newMonths = [...newScenarios[prev.activeScenario].months].map(m => ({ ...m }));
      const numMonths = newMonths.length;

      // Build seasonal weights per month
      const weights: number[] = [];
      for (let i = 0; i < numMonths; i++) {
        const calMonth = i % 12; // 0=Jan, 3=Apr, 6=Jul, 9=Oct, 11=Dec
        if (field === 'franchises' || field === 'jv') {
          // Franchise/JV selling: Jul(6), Aug(7), Sep(8), Oct(9)
          weights.push(calMonth >= 6 && calMonth <= 9 ? 1 : 0);
        } else {
          // Memberships: Apr-Sep heavy (weight 2), rest light (weight 1)
          weights.push(calMonth >= 3 && calMonth <= 8 ? 2 : 1);
        }
      }

      const totalWeight = weights.reduce((s, w) => s + w, 0);
      if (totalWeight === 0) return prev; // no valid months

      // Distribute using largest remainder method for whole numbers
      const raw = weights.map(w => (w / totalWeight) * total);
      const floored = raw.map(v => Math.floor(v));
      let remainder = total - floored.reduce((s, v) => s + v, 0);
      // Give remainders to months with largest fractional parts
      const fractions = raw.map((v, i) => ({ i, frac: v - floored[i] }))
        .filter(f => f.frac > 0)
        .sort((a, b) => b.frac - a.frac);
      for (let j = 0; j < remainder && j < fractions.length; j++) {
        floored[fractions[j].i]++;
      }

      for (let i = 0; i < numMonths; i++) {
        newMonths[i][field] = floored[i];
      }

      newScenarios[prev.activeScenario] = { ...newScenarios[prev.activeScenario], months: newMonths };
      return { ...prev, scenarios: newScenarios };
    });
  };

  // Tab down columns in sales pipeline instead of across rows
  const handlePipelineTab = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Tab') return;
    const el = e.currentTarget;
    const row = parseInt(el.dataset.row || '0');
    const col = el.dataset.col;
    const nextRow = e.shiftKey ? row - 1 : row + 1;
    if (nextRow < 0 || nextRow >= sc.months.length) return;
    const next = document.querySelector<HTMLInputElement>(`input[data-row="${nextRow}"][data-col="${col}"]`);
    if (next) { e.preventDefault(); next.focus(); next.select(); }
  };

  // Calculated data
  const results = useMemo(() => scenarios.map((s, si) => calcScenario(a, s, si)), [a, scenarios]);
  const result = results[activeScenario];

  // Comparison data for all scenarios
  const comparisonData = useMemo(() => {
    return results.map((r, i) => ({
      name: scenarios[i].name,
      color: scenarios[i].color,
      totalRevenue: r.totalRevenue,
      totalProfit: r.totalProfit,
      endMembers: r.lastRow.activeTier1 + r.lastRow.activeTier2,
      endJV: r.lastRow.activeJV,
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
              <button key={i} onClick={() => { setState(migrateState(JSON.parse(v.data))); setSaveMsg("Loaded: " + v.name); setTimeout(() => setSaveMsg(""), 2000); }}
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
            <div className="grid grid-cols-7 gap-2">
              <KPI label="Total Revenue" value={fmtM(result.totalRevenue)} subtext={result.rows.length + " mo"} positive />
              <KPI label="Total Profit" value={fmtM(result.totalProfit)} positive={result.totalProfit > 0} negative={result.totalProfit < 0} />
              <KPI label="Members (T1+T2)" value={(result.lastRow.activeTier1 + result.lastRow.activeTier2).toString()} subtext={"T1:" + result.lastRow.activeTier1 + " T2:" + result.lastRow.activeTier2} />
              <KPI label="JV Partners" value={result.lastRow.activeJV.toString()} subtext={fmtK(result.lastRow.jvGMV) + "/mo"} />
              <KPI label="Franchises" value={result.lastRow.activeFranchises.toString()} subtext={fmtK(result.lastRow.franchiseGMV) + "/mo"} />
              <KPI label="Break-Even" value={result.breakEvenMonth >= 0 ? "Mo " + (result.breakEvenMonth + 1) : "Never"} subtext={result.breakEvenMonth >= 0 ? monthLabels[result.breakEvenMonth] : ""} positive={result.breakEvenMonth >= 0} />
              <KPI label="Recurring/Mo" value={fmtK(result.lastRow.revMembership + result.lastRow.revMaterialMarkup + result.lastRow.revRoyalties)} subtext={"Mbr+Matl+Roy"} positive />
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
                          <div>JV: <span className="font-medium text-gray-700">{y.endJV}</span> · Fran: <span className="font-medium text-gray-700">{y.endFranchises}</span></div>
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
                          { name: "Software Licenses", value: result.rows.reduce((s, r) => s + r.revFranchiseDues, 0) },
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

            {/* Cumulative Revenue & Profit */}
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Cumulative Revenue & Profit</h3>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={result.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} interval={2} angle={-45} textAnchor="end" height={50} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <defs>
                    <linearGradient id="cumRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cumProfitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area dataKey="cumRevenue" name="Cumulative Revenue" stroke="#3b82f6" fill="url(#cumRevGrad)" strokeWidth={2} />
                  <Area dataKey="cumProfit" name="Cumulative Profit" stroke="#10b981" fill="url(#cumProfitGrad)" strokeWidth={2.5} />
                  <ReferenceLine y={0} stroke="#999" strokeDasharray="3 3" />
                </ComposedChart>
              </ResponsiveContainer>
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
              <table className="w-full text-xs" style={{ minWidth: 1200 }}>
                <thead>
                  <tr className="border-b-2 border-gray-300 whitespace-nowrap">
                    <th className="text-left py-2 px-2 sticky left-0 bg-white font-bold">Month</th>
                    <th className="text-right py-2 px-1">New F</th>
                    <th className="text-right py-2 px-1">New T1</th>
                    <th className="text-right py-2 px-1">New T2</th>
                    <th className="text-right py-2 px-1">New JV</th>
                    <th className="text-right py-2 px-1 bg-blue-50">Mbrs</th>
                    <th className="text-right py-2 px-1 bg-blue-50">JV</th>
                    <th className="text-right py-2 px-1 bg-blue-50">Fran</th>
                    <th className="text-right py-2 px-1">Fran $</th>
                    <th className="text-right py-2 px-1">Soft Lic</th>
                    <th className="text-right py-2 px-1">Mbr $</th>
                    <th className="text-right py-2 px-1">Royalty</th>
                    <th className="text-right py-2 px-1 text-orange-700">Matl $</th>
                    <th className="text-right py-2 px-1">Platform</th>
                    <th className="text-right py-2 px-1 font-bold bg-green-50">Revenue</th>
                    <th className="text-right py-2 px-1">Comm</th>
                    <th className="text-right py-2 px-1">Overhead</th>
                    <th className="text-right py-2 px-1 font-bold bg-red-50">Cost</th>
                    <th className="text-right py-2 px-2 font-bold">Profit</th>
                    <th className="text-right py-2 px-2">Cumul</th>
                  </tr>
                  {/* Totals row */}
                  {(() => {
                    const totals = result.rows.reduce((acc, r) => ({
                      newF: acc.newF + r.newF, newT1: acc.newT1 + r.newT1, newT2: acc.newT2 + r.newT2, newJV: acc.newJV + r.newJV,
                      revFranchiseFees: acc.revFranchiseFees + r.revFranchiseFees, revFranchiseDues: acc.revFranchiseDues + r.revFranchiseDues,
                      revMembership: acc.revMembership + r.revMembership, revRoyalties: acc.revRoyalties + r.revRoyalties,
                      revMaterialMarkup: acc.revMaterialMarkup + r.revMaterialMarkup, revPlatformFees: acc.revPlatformFees + r.revPlatformFees,
                      totalRevenue: acc.totalRevenue + r.totalRevenue, costCommissions: acc.costCommissions + r.costCommissions,
                      costOverhead: acc.costOverhead + r.costOverhead, totalCost: acc.totalCost + r.totalCost,
                      operatingProfit: acc.operatingProfit + r.operatingProfit,
                    }), { newF: 0, newT1: 0, newT2: 0, newJV: 0, revFranchiseFees: 0, revFranchiseDues: 0, revMembership: 0, revRoyalties: 0, revMaterialMarkup: 0, revPlatformFees: 0, totalRevenue: 0, costCommissions: 0, costOverhead: 0, totalCost: 0, operatingProfit: 0 });
                    const last = result.lastRow;
                    return (
                      <tr className="border-b-2 border-indigo-300 bg-indigo-50 font-bold text-xs">
                        <td className="py-2 px-2 sticky left-0 bg-indigo-50 font-bold text-indigo-800">TOTALS</td>
                        <td className="text-right py-2 px-1 text-purple-700">{totals.newF}</td>
                        <td className="text-right py-2 px-1">{totals.newT1}</td>
                        <td className="text-right py-2 px-1">{totals.newT2}</td>
                        <td className="text-right py-2 px-1">{totals.newJV}</td>
                        <td className="text-right py-2 px-1 bg-indigo-100">{last.activeTier1 + last.activeTier2}</td>
                        <td className="text-right py-2 px-1 bg-indigo-100">{last.activeJV}</td>
                        <td className="text-right py-2 px-1 bg-indigo-100">{last.activeFranchises}</td>
                        <td className="text-right py-2 px-1">{fmtK(totals.revFranchiseFees)}</td>
                        <td className="text-right py-2 px-1">{fmtK(totals.revFranchiseDues)}</td>
                        <td className="text-right py-2 px-1">{fmtK(totals.revMembership)}</td>
                        <td className="text-right py-2 px-1">{fmtK(totals.revRoyalties)}</td>
                        <td className="text-right py-2 px-1 text-orange-700">{fmtK(totals.revMaterialMarkup)}</td>
                        <td className="text-right py-2 px-1">{fmt(totals.revPlatformFees)}</td>
                        <td className="text-right py-2 px-1 bg-green-100">{fmtK(totals.totalRevenue)}</td>
                        <td className="text-right py-2 px-1">{fmtK(totals.costCommissions)}</td>
                        <td className="text-right py-2 px-1">{fmtK(totals.costOverhead)}</td>
                        <td className="text-right py-2 px-1 bg-red-100">{fmtK(totals.totalCost)}</td>
                        <td className={`text-right py-2 px-2 ${totals.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtK(totals.operatingProfit)}</td>
                        <td className="text-right py-2 px-2"></td>
                      </tr>
                    );
                  })()}
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
                        <td className="text-right py-1.5 px-1 bg-blue-50/50 font-medium">{r.activeTier1 + r.activeTier2}</td>
                        <td className="text-right py-1.5 px-1 bg-blue-50/50 font-medium">{r.activeJV}</td>
                        <td className="text-right py-1.5 px-1 bg-blue-50/50 font-medium">{r.activeFranchises}</td>
                        <td className="text-right py-1.5 px-1">{r.revFranchiseFees ? fmtK(r.revFranchiseFees) : '-'}</td>
                        <td className="text-right py-1.5 px-1">{r.revFranchiseDues ? fmtK(r.revFranchiseDues) : '-'}</td>
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
              <div className="flex justify-between items-start gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-gray-800 truncate">Monthly New Sales (edit each cell)</h3>
                  <p className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">Edit <span className="font-bold text-indigo-600">⚡ TOTALS</span> row to auto-distribute with seasonality, or edit months directly.</p>
                  <p className="text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis">Franchises/JV → Jul-Oct · Memberships → Apr-Sep heavier · Tab moves down column</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => {
                    const m = [...sc.months];
                    if (m.length < 120) { for (let i = 0; i < 12; i++) m.push({ franchises: 0, tier1: 0, tier2: 0, jv: 0 }); updateScenarioField('months', m); }
                  }} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 whitespace-nowrap">+ Add Year</button>
                </div>
              </div>
              <table className="w-full text-xs" style={{ minWidth: 700 }}>
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 px-2 font-bold whitespace-nowrap" style={{ width: 80 }}>Month</th>
                    <th className="text-center py-2 px-1 font-bold text-purple-700 whitespace-nowrap" style={{ width: 72 }}>Fran</th>
                    <th className="text-center py-2 px-1 font-bold text-blue-700 whitespace-nowrap" style={{ width: 72 }}>Tier 1</th>
                    <th className="text-center py-2 px-1 font-bold text-green-700 whitespace-nowrap" style={{ width: 72 }}>Tier 2</th>
                    <th className="text-center py-2 px-1 font-bold text-amber-700 whitespace-nowrap" style={{ width: 72 }}>JV</th>
                    <th className="text-right py-2 px-2 font-bold bg-gray-50 whitespace-nowrap" style={{ width: 64 }}>Mbrs</th>
                    <th className="text-right py-2 px-2 font-bold bg-gray-50 whitespace-nowrap" style={{ width: 64 }}>Act JV</th>
                    <th className="text-right py-2 px-2 font-bold bg-gray-50 whitespace-nowrap" style={{ width: 64 }}>Act Fran</th>
                    <th className="text-right py-2 px-2 font-bold bg-green-50 whitespace-nowrap" style={{ width: 80 }}>Revenue</th>
                    <th className="text-right py-2 px-2 font-bold whitespace-nowrap" style={{ width: 80 }}>Profit</th>
                  </tr>
                  {/* Totals row — editable: type a number to auto-distribute with seasonality */}
                  {(() => {
                    const totals = result.rows.reduce((acc, r) => ({
                      totalRevenue: acc.totalRevenue + r.totalRevenue,
                      operatingProfit: acc.operatingProfit + r.operatingProfit,
                    }), { totalRevenue: 0, operatingProfit: 0 });
                    const totalNewF = sc.months.reduce((s, m) => s + m.franchises, 0);
                    const totalNewT1 = sc.months.reduce((s, m) => s + m.tier1, 0);
                    const totalNewT2 = sc.months.reduce((s, m) => s + m.tier2, 0);
                    const totalNewJV = sc.months.reduce((s, m) => s + m.jv, 0);
                    const last = result.lastRow;
                    const totalInputClass = "w-full text-center text-xs font-bold border border-indigo-300 rounded p-1 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
                    return (
                      <tr className="border-b-2 border-indigo-300 bg-indigo-50 font-bold text-xs">
                        <td className="py-2 px-2 font-bold text-indigo-800" title="Edit totals to auto-distribute with seasonality">⚡ TOTALS</td>
                        <td className="py-1 px-1"><input type="number" min={0} value={totalNewF} onChange={e => seasonalDistribute('franchises', parseInt(e.target.value) || 0)} className={totalInputClass} title="Distributes to Jul-Oct selling season" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={totalNewT1} onChange={e => seasonalDistribute('tier1', parseInt(e.target.value) || 0)} className={totalInputClass} title="Heavier Apr-Sep, lighter rest of year" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={totalNewT2} onChange={e => seasonalDistribute('tier2', parseInt(e.target.value) || 0)} className={totalInputClass} title="Heavier Apr-Sep, lighter rest of year" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={totalNewJV} onChange={e => seasonalDistribute('jv', parseInt(e.target.value) || 0)} className={totalInputClass} title="Distributes to Jul-Oct selling season" /></td>
                        <td className="text-right py-2 px-2 bg-indigo-100">{last.activeTier1 + last.activeTier2}</td>
                        <td className="text-right py-2 px-2 bg-indigo-100">{last.activeJV}</td>
                        <td className="text-right py-2 px-2 bg-indigo-100">{last.activeFranchises}</td>
                        <td className="text-right py-2 px-2 bg-green-100">{fmtK(totals.totalRevenue)}</td>
                        <td className={`text-right py-2 px-2 ${totals.operatingProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtK(totals.operatingProfit)}</td>
                      </tr>
                    );
                  })()}
                </thead>
                <tbody>
                  {sc.months.map((m, i) => {
                    const r = result.rows[i];
                    const isYearStart = i > 0 && i % 12 === 0;
                    return (
                      <tr key={i} className={`border-b hover:bg-indigo-50/30 ${isYearStart ? 'border-t-2 border-gray-400' : ''}`}>
                        <td className="py-1 px-2 font-medium text-gray-600">{monthLabels[i]}</td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.franchises} onChange={e => updateMonthSales(i, 'franchises', parseInt(e.target.value) || 0)} data-row={i} data-col="franchises" onKeyDown={handlePipelineTab} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-purple-400 focus:border-purple-400 outline-none" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.tier1} onChange={e => updateMonthSales(i, 'tier1', parseInt(e.target.value) || 0)} data-row={i} data-col="tier1" onKeyDown={handlePipelineTab} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.tier2} onChange={e => updateMonthSales(i, 'tier2', parseInt(e.target.value) || 0)} data-row={i} data-col="tier2" onKeyDown={handlePipelineTab} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-green-400 focus:border-green-400 outline-none" /></td>
                        <td className="py-1 px-1"><input type="number" min={0} value={m.jv} onChange={e => updateMonthSales(i, 'jv', parseInt(e.target.value) || 0)} data-row={i} data-col="jv" onKeyDown={handlePipelineTab} className="w-full text-center text-xs border border-gray-200 rounded p-1 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none" /></td>
                        <td className="text-right py-1 px-2 bg-gray-50/50 font-medium">{r ? r.activeTier1 + r.activeTier2 : ''}</td>
                        <td className="text-right py-1 px-2 bg-gray-50/50 font-medium">{r?.activeJV}</td>
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
                <InputField label="Software License Monthly" value={a.franchiseMembershipPrice} onChange={v => updateAssumption('franchiseMembershipPrice', v)} prefix="$" step={100} />
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
                <InputField label="Base Overhead (floor)" value={a.overheadMonthly} onChange={v => updateAssumption('overheadMonthly', v)} prefix="$" step={1000} />
                <InputField label="Salary Unit Cost" value={a.overheadSalaryUnit} onChange={v => updateAssumption('overheadSalaryUnit', v)} prefix="$" step={1000} />
                <InputField label="Fran/JV per Unit" value={a.overheadCapFranchiseJV} onChange={v => updateAssumption('overheadCapFranchiseJV', v)} step={1} min={1} />
                <InputField label="Tier 1 per Unit" value={a.overheadCapTier1} onChange={v => updateAssumption('overheadCapTier1', v)} step={1} min={1} />
                <InputField label="Tier 2 per Unit" value={a.overheadCapTier2} onChange={v => updateAssumption('overheadCapTier2', v)} step={1} min={1} />
                <InputField label="Scale Exponent" value={a.overheadScaleExponent} onChange={v => updateAssumption('overheadScaleExponent', v)} step={0.05} min={0.3} max={1.5} />
                <InputField label="Royalty Rate" value={a.royaltyRate * 100} onChange={v => updateAssumption('royaltyRate', v / 100)} suffix="%" step={0.5} />
                <InputField label="Platform Fee Rate" value={a.platformFeeRate * 100} onChange={v => updateAssumption('platformFeeRate', v / 100)} suffix="%" step={0.01} />
                <div className="mt-3 p-3 bg-green-100 rounded-lg text-xs text-green-800">
                  <p className="font-bold mb-1">📊 How Overhead Scales</p>
                  <p>Base overhead of <span className="font-bold">{fmt(a.overheadMonthly)}/mo</span> covers rent, tools, insurance — fixed regardless of size.</p>
                  <p className="mt-1">Each <span className="font-bold">{fmt(a.overheadSalaryUnit)}</span> salary unit supports <span className="font-bold">{a.overheadCapFranchiseJV}</span> franchises/JVs, <span className="font-bold">{a.overheadCapTier1}</span> T1, or <span className="font-bold">{a.overheadCapTier2}</span> T2 members.</p>
                  <p className="mt-1">Scale exponent of <span className="font-bold">{a.overheadScaleExponent}</span> means {a.overheadScaleExponent < 1 ? 'economies of scale — doubling clients costs only ' + ((Math.pow(2, a.overheadScaleExponent) - 1) * 100).toFixed(0) + '% more staff (not 100%)' : a.overheadScaleExponent === 1 ? 'linear scaling — no economies' : 'diseconomies — scaling gets harder'}.</p>
                  <div className="mt-2 border-t border-green-300 pt-2">
                    <p className="font-bold mb-1">Example overhead at different scales:</p>
                    {[{ f: 5, j: 1, t1: 10, t2: 5 }, { f: 20, j: 3, t1: 30, t2: 15 }, { f: 50, j: 5, t1: 60, t2: 30 }].map(ex => (
                      <p key={ex.f} className="text-green-700">{ex.f}F + {ex.j}JV + {ex.t1}T1 + {ex.t2}T2 → <span className="font-bold">{fmt(calcOverhead(a, ex.f, ex.j, ex.t1, ex.t2))}/mo</span></p>
                    ))}
                  </div>
                  <p className="mt-2 text-green-600 italic">Current end-state: {fmt(calcOverhead(a, result.lastRow.activeFranchises, result.lastRow.activeJV, result.lastRow.activeTier1, result.lastRow.activeTier2))}/mo</p>
                </div>
              </Section>
              <Section title="Franchise Economics" color="purple">
                <InputField label="GMV per Franchise/Month" value={a.gmvPerFranchiseMonthly} onChange={v => updateAssumption('gmvPerFranchiseMonthly', v)} prefix="$" step={5000} />
                <InputField label="GMV per JV/Month" value={a.gmvPerJVMonthly} onChange={v => updateAssumption('gmvPerJVMonthly', v)} prefix="$" step={5000} />
                <InputField label="GMV Ramp Months" value={a.gmvRampMonths} onChange={v => updateAssumption('gmvRampMonths', v)} step={1} min={1} max={12} />
                <div className="mt-3 p-3 bg-purple-100 rounded-lg text-xs text-purple-800">
                  <p className="font-bold mb-1">Franchise & JV GMV Model</p>
                  <p>Franchises ramp to {fmt(a.gmvPerFranchiseMonthly)}/mo, JVs ramp to {fmt(a.gmvPerJVMonthly)}/mo over {a.gmvRampMonths} months.</p>
                  <p className="mt-1">HQ earns {fmtPct(a.royaltyRate)} royalties + {fmtPct(a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup)} material markup ({fmtPctWhole(a.materialAdoptionRate * 100)} adoption) + {fmtPct(a.platformFeeRate)} platform fees on GMV.</p>
                </div>
              </Section>
              <Section title="Material Sales" color="amber">
                <InputField label="Materials % of GMV" value={a.materialPctOfGMV * 100} onChange={v => updateAssumption('materialPctOfGMV', v / 100)} suffix="%" step={1} min={0} max={100} />
                <InputField label="HQ Markup on Materials" value={a.materialMarkup * 100} onChange={v => updateAssumption('materialMarkup', v / 100)} suffix="%" step={0.5} min={0} max={50} />
                <InputField label="Max Adoption Rate" value={a.materialAdoptionRate * 100} onChange={v => updateAssumption('materialAdoptionRate', v / 100)} suffix="%" step={5} min={0} max={100} />
                <InputField label="Adoption Ramp (months)" value={a.materialRampMonths} onChange={v => updateAssumption('materialRampMonths', Math.max(1, v))} step={1} min={1} max={24} />
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600">Distribution Starts</label>
                  <select
                    value={a.materialStartMonth}
                    onChange={e => updateAssumption('materialStartMonth', parseInt(e.target.value))}
                    className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 mt-0.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    {MONTH_LABELS(60).map((label, idx) => (
                      <option key={idx} value={idx}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 p-3 bg-amber-100 rounded-lg text-xs text-amber-800">
                  <p className="font-bold mb-1">Material Adoption Model</p>
                  <p>Program launches <span className="font-bold">{MONTH_LABELS(60)[a.materialStartMonth]}</span>. No material revenue before that.</p>
                  <p className="mt-1">Each location ramps from 0% → <span className="font-bold">{fmtPctWhole(a.materialAdoptionRate * 100)}</span> adoption over <span className="font-bold">{a.materialRampMonths} months</span>.</p>
                  <p className="mt-1">At full adoption: {fmtPctWhole(a.materialAdoptionRate * 100)} of {fmtPctWhole(a.materialPctOfGMV * 100)} GMV = <span className="font-bold">{fmtPctWhole(a.materialAdoptionRate * a.materialPctOfGMV * 100)}</span> of GMV flows through HQ.</p>
                  <p className="mt-1">HQ earns {fmtPctWhole(a.materialMarkup * 100)} markup = <span className="font-bold">{fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup)}/franchise/month</span> at steady state.</p>
                  <p className="mt-1">Per franchise annual: <span className="font-bold">{fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup * 12)}</span></p>
                  <div className="mt-2 border-t border-amber-300 pt-2">
                    <p className="font-bold">Ramp example (per location):</p>
                    {[1, 2, 3, 4].filter(m => m <= a.materialRampMonths).map(m => {
                      const factor = Math.min(m / a.materialRampMonths, 1) * a.materialAdoptionRate;
                      return <p key={m} className="ml-2">Mo {m}: {fmtPctWhole(factor * 100)} adoption → {fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * factor * a.materialMarkup)}/mo</p>;
                    })}
                    <p className="ml-2">Mo {a.materialRampMonths}+: {fmtPctWhole(a.materialAdoptionRate * 100)} (full) → {fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup)}/mo</p>
                  </div>
                </div>
              </Section>
            </div>
            <div className="col-span-4 space-y-4">
              <Section title="Churn Rates (Annual)" color="red">
                <InputField label="Tier 1 Annual Churn" value={a.churnRateTier1 * 100} onChange={v => updateAssumption('churnRateTier1', v / 100)} suffix="%" step={1} />
                <InputField label="Tier 2 Annual Churn" value={a.churnRateTier2 * 100} onChange={v => updateAssumption('churnRateTier2', v / 100)} suffix="%" step={1} />
                <InputField label="JV Annual Churn" value={a.churnRateJV * 100} onChange={v => updateAssumption('churnRateJV', v / 100)} suffix="%" step={1} />
                <InputField label="Franchise Annual Churn" value={a.churnRateFranchise * 100} onChange={v => updateAssumption('churnRateFranchise', v / 100)} suffix="%" step={1} />
                <div className="mt-3 p-3 bg-red-100 rounded-lg text-xs text-red-800">
                  <p className="font-bold mb-1">Churn Conversion</p>
                  <p>Rates entered as <span className="font-bold">annual</span>, converted to monthly via compounding:</p>
                  <p className="mt-1 font-mono text-[10px] bg-red-50 rounded p-1">monthly = 1 − (1 − annual)^(1/12)</p>
                  <p className="mt-1">T1: {(a.churnRateTier1 * 100).toFixed(0)}%/yr → {(annualToMonthlyChurn(a.churnRateTier1) * 100).toFixed(2)}%/mo → {((1 - a.churnRateTier1) * 100).toFixed(0)}% retention</p>
                  <p>Franchise: {(a.churnRateFranchise * 100).toFixed(0)}%/yr → {(annualToMonthlyChurn(a.churnRateFranchise) * 100).toFixed(2)}%/mo → {((1 - a.churnRateFranchise) * 100).toFixed(0)}% retention</p>
                </div>
              </Section>
              <Section title="Seasonality" color="blue">
                <div className="flex items-center gap-3 mb-3">
                  <label className="text-xs font-medium text-gray-600">Seasonal GMV Curve</label>
                  <button
                    onClick={() => updateAssumption('seasonalityEnabled', !a.seasonalityEnabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${a.seasonalityEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${a.seasonalityEnabled ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-xs text-gray-500">{a.seasonalityEnabled ? 'On' : 'Off'}</span>
                </div>
                <div className="p-3 bg-blue-100 rounded-lg text-xs text-blue-800">
                  <p className="font-bold mb-2">Fencing Industry Seasonal Curve</p>
                  <p className="mb-2">GMV multipliers by month (normalized to average 1.0 — annual totals preserved):</p>
                  <div className="flex items-end gap-0.5 h-16 mb-1">
                    {SEASONAL_WEIGHTS.map((w, mi) => (
                      <div key={mi} className="flex-1 flex flex-col items-center">
                        <div
                          className={`w-full rounded-t ${a.seasonalityEnabled ? (w >= 1 ? 'bg-blue-500' : 'bg-blue-300') : 'bg-gray-300'}`}
                          style={{ height: `${(w / Math.max(...SEASONAL_WEIGHTS)) * 100}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-0.5 text-[8px] text-blue-600">
                    {['J','F','M','A','M','J','J','A','S','O','N','D'].map((l, i) => (
                      <div key={i} className="flex-1 text-center">{l}</div>
                    ))}
                  </div>
                  <div className="flex gap-0.5 text-[8px] text-blue-500 mt-0.5">
                    {SEASONAL_WEIGHTS.map((w, i) => (
                      <div key={i} className="flex-1 text-center">{w.toFixed(2)}</div>
                    ))}
                  </div>
                  <p className="mt-2 text-blue-600 italic">Peak: {(Math.max(...SEASONAL_WEIGHTS)).toFixed(2)}x (Jun) · Trough: {(Math.min(...SEASONAL_WEIGHTS)).toFixed(2)}x (Dec)</p>
                </div>
              </Section>
              <Section title="Tax Estimate" color="amber">
                <InputField label="Effective Tax Rate" value={a.effectiveTaxRate * 100} onChange={v => updateAssumption('effectiveTaxRate', v / 100)} suffix="%" step={1} min={0} max={50} />
                <div className="mt-3 p-3 bg-amber-100 rounded-lg text-xs text-amber-800">
                  <p className="font-bold mb-1">Tax Assumptions</p>
                  <p>Combined federal ({'>'}21%) + state (~5%) effective rate.</p>
                  <p className="mt-1">Tax only applies to profitable months — losses carry no tax benefit in this model.</p>
                  <p className="mt-1">Valuation multiples are applied to <span className="font-bold">pre-tax EBITDA</span> (standard for acquisitions).</p>
                  <p className="mt-1 text-amber-600 italic">Current rate: {fmtPctWhole(a.effectiveTaxRate * 100)} → every $100K EBITDA yields {fmt(100000 * (1 - a.effectiveTaxRate))} after tax</p>
                </div>
              </Section>
              <Section title="Quick Sensitivity" color="indigo">
                <div className="space-y-2 text-xs">
                  <p className="text-gray-600">Each additional Tier 1 member = <span className="font-bold text-indigo-700">{fmt(a.tier1Price * 12)}/year</span></p>
                  <p className="text-gray-600">Each additional Tier 2 member = <span className="font-bold text-indigo-700">{fmt(a.tier2Price * 12)}/year</span></p>
                  <p className="text-gray-600">Each additional JV = <span className="font-bold text-indigo-700">{fmt(a.jvPrice * 12)}/yr dues + {fmt(a.gmvPerJVMonthly * 12 * (a.royaltyRate + a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup + a.platformFeeRate))}/yr from GMV</span></p>
                  <p className="text-gray-600">Each franchise sale = <span className="font-bold text-indigo-700">{fmt(a.franchiseFee)} upfront + {fmt(a.gmvPerFranchiseMonthly * 12 * a.royaltyRate)}/yr royalties + {fmt(a.gmvPerFranchiseMonthly * a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup * 12)}/yr materials</span></p>
                  <p className="text-gray-600">Net per franchise sale (after comm.) = <span className="font-bold text-indigo-700">{fmt(a.franchiseFee - a.commissionPerFranchise)}</span></p>
                  <p className="text-gray-600">Annual recurring per franchise = <span className="font-bold text-indigo-700">{fmt(a.franchiseMembershipPrice * 12 + a.gmvPerFranchiseMonthly * 12 * (a.royaltyRate + a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup + a.platformFeeRate))}</span> (software licenses + GMV income)</p>
                </div>
              </Section>
              <Section title="💰 Sales Commission Calculator" color="green">
                {(() => {
                  const commF = calcFranchises * a.commissionPerFranchise;
                  const commT1 = calcTier1 * a.commissionPerTier1;
                  const commT2 = calcTier2 * a.commissionPerTier2;
                  const commJV = calcJV * a.commissionPerJV;
                  const totalComm = commF + commT1 + commT2 + commJV;
                  // What those sales generate for the company annually
                  // Account for GMV ramp: avg ramp factor over 12 months
                  const rampAvg12 = Array.from({ length: 12 }, (_, i) => Math.min((i + 1) / a.gmvRampMonths, 1)).reduce((s, v) => s + v, 0) / 12;
                  const coRevFranchiseFees = calcFranchises * a.franchiseFee;
                  const coRevRecurringMo = calcTier1 * a.tier1Price + calcTier2 * a.tier2Price + calcJV * a.jvPrice + calcFranchises * a.franchiseMembershipPrice;
                  const coRevFranchiseGMVannual = calcFranchises * a.gmvPerFranchiseMonthly * 12 * rampAvg12;
                  const coRevJVGMVannual = calcJV * a.gmvPerJVMonthly * 12 * rampAvg12;
                  const coRevGMVannual = coRevFranchiseGMVannual + coRevJVGMVannual;
                  const coRevRoyalties = coRevGMVannual * a.royaltyRate;
                  const coRevMaterials = coRevGMVannual * a.materialPctOfGMV * a.materialAdoptionRate * a.materialMarkup;
                  const coTotalYear1 = coRevFranchiseFees + coRevRecurringMo * 12 + coRevRoyalties + coRevMaterials;
                  return (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500">If you sell this many in a year, here&apos;s what you&apos;ll earn and what it generates:</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600">Franchises</label>
                          <input type="number" min={0} value={calcFranchises} onChange={e => setCalcFranchises(parseInt(e.target.value) || 0)} className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-green-500 outline-none mt-0.5" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Tier 1</label>
                          <input type="number" min={0} value={calcTier1} onChange={e => setCalcTier1(parseInt(e.target.value) || 0)} className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-green-500 outline-none mt-0.5" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">Tier 2</label>
                          <input type="number" min={0} value={calcTier2} onChange={e => setCalcTier2(parseInt(e.target.value) || 0)} className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-green-500 outline-none mt-0.5" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600">JV</label>
                          <input type="number" min={0} value={calcJV} onChange={e => setCalcJV(parseInt(e.target.value) || 0)} className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-green-500 outline-none mt-0.5" />
                        </div>
                      </div>
                      <div className="bg-green-100 rounded-lg p-3 space-y-2 text-xs">
                        <p className="font-bold text-green-900 text-sm">Your Commission Earnings:</p>
                        <div className="grid grid-cols-2 gap-1 text-green-800">
                          <span>Franchises ({calcFranchises} × {fmt(a.commissionPerFranchise)})</span>
                          <span className="text-right font-bold">{fmt(commF)}</span>
                          <span>Tier 1 ({calcTier1} × {fmt(a.commissionPerTier1)})</span>
                          <span className="text-right font-bold">{fmt(commT1)}</span>
                          <span>Tier 2 ({calcTier2} × {fmt(a.commissionPerTier2)})</span>
                          <span className="text-right font-bold">{fmt(commT2)}</span>
                          <span>JV ({calcJV} × {fmt(a.commissionPerJV)})</span>
                          <span className="text-right font-bold">{fmt(commJV)}</span>
                        </div>
                        <div className="border-t border-green-300 pt-2 flex justify-between">
                          <span className="font-bold text-green-900">Total Commission:</span>
                          <span className="font-bold text-green-900 text-lg">{fmt(totalComm)}</span>
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3 space-y-2 text-xs">
                        <p className="font-bold text-blue-900 text-sm">What This Generates for HQ (Year 1):</p>
                        <div className="grid grid-cols-2 gap-1 text-blue-800">
                          <span>Franchise fees (upfront)</span>
                          <span className="text-right font-bold">{fmt(coRevFranchiseFees)}</span>
                          <span>Recurring memberships/yr</span>
                          <span className="text-right font-bold">{fmt(coRevRecurringMo * 12)}</span>
                          <span>Royalties/yr (on GMV)</span>
                          <span className="text-right font-bold">{fmt(coRevRoyalties)}</span>
                          <span>Material markup/yr</span>
                          <span className="text-right font-bold">{fmt(coRevMaterials)}</span>
                        </div>
                        <div className="border-t border-blue-300 pt-2 flex justify-between">
                          <span className="font-bold text-blue-900">Total HQ Revenue (Y1):</span>
                          <span className="font-bold text-blue-900 text-lg">{fmt(coTotalYear1)}</span>
                        </div>
                        {coTotalYear1 > 0 && <p className="text-blue-600 italic mt-1">Commission cost is {(totalComm / coTotalYear1 * 100).toFixed(1)}% of Y1 revenue — {totalComm / coTotalYear1 < 0.1 ? 'very efficient' : totalComm / coTotalYear1 < 0.2 ? 'reasonable' : 'watch this ratio'}</p>}
                        {a.gmvRampMonths > 1 && <p className="text-blue-500 italic mt-1">GMV adjusted for {a.gmvRampMonths}-month ramp (avg {(rampAvg12 * 100).toFixed(0)}% of steady state in Y1)</p>}
                      </div>
                    </div>
                  );
                })()}
              </Section>
            </div>
          </div>
        )}

        {/* ─── COMPARE TAB ─────────────────────────────────────────────── */}
        {activeTab === "compare" && (
          <div className="space-y-4 overflow-hidden">
            <div className="grid grid-cols-2 gap-4">
              {/* Side by Side KPIs */}
              <div className="bg-white rounded-xl border p-4 shadow-sm overflow-hidden">
                <h3 className="font-bold text-sm text-gray-800 mb-3">Scenario Comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ minWidth: 400 }}>
                    <thead>
                      <tr className="border-b-2 whitespace-nowrap">
                        <th className="text-left py-2 pr-2">Metric</th>
                        {scenarios.map((s, i) => <th key={i} className="text-right py-2 px-2 max-w-[120px]">
                          <div className="flex items-center justify-end gap-1 truncate">
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="truncate">{s.name}</span>
                          </div>
                        </th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Total Revenue", get: (r: any) => fmtM(r.totalRevenue) },
                        { label: "Total Profit", get: (r: any) => fmtM(r.totalProfit) },
                        { label: "End Mbrs (T1+T2)", get: (r: any) => r.lastRow.activeTier1 + r.lastRow.activeTier2 },
                        { label: "End JV Partners", get: (r: any) => r.lastRow.activeJV },
                        { label: "End Franchises", get: (r: any) => r.lastRow.activeFranchises },
                        { label: "Recurring/Mo", get: (r: any) => fmtK(r.lastRow.revMembership) },
                        { label: "GMV/Mo (end)", get: (r: any) => fmtK(r.lastRow.systemGMV) },
                        { label: "Break-Even", get: (r: any) => r.breakEvenMonth >= 0 ? "Mo " + (r.breakEvenMonth + 1) : "Never" },
                        { label: "Avg Mo Profit", get: (r: any) => fmtK(r.totalProfit / r.rows.length) },
                      ].map(metric => (
                        <tr key={metric.label} className="border-b whitespace-nowrap">
                          <td className="py-2 pr-2 font-medium text-gray-600">{metric.label}</td>
                          {results.map((r, i) => <td key={i} className="text-right py-2 px-2 font-medium">{metric.get(r)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cumulative Profit Overlay */}
              <div className="bg-white rounded-xl border p-4 shadow-sm overflow-hidden">
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
            <div className="bg-white rounded-xl border p-4 shadow-sm overflow-hidden">
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

            {/* ── EBITDA Valuation Calculator ── */}
            <div className="bg-white rounded-xl border p-4 shadow-sm overflow-hidden">
              <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-gray-800">Valuation Calculator</h3>
                  <p className="text-xs text-gray-500 mt-1">Trailing 12-month EBITDA at sale date × multiple</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-2 bg-purple-50 rounded-lg px-3 py-2 border border-purple-200">
                    <label className="text-xs font-medium text-purple-700 whitespace-nowrap">Sale Year:</label>
                    <select value={saleYear} onChange={e => setSaleYear(parseInt(e.target.value))}
                      className="text-sm font-bold border border-purple-300 rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none bg-white">
                      {Array.from({ length: 11 }, (_, i) => 2026 + i).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-200">
                    <label className="text-xs font-medium text-indigo-700 whitespace-nowrap">EBITDA Multiple:</label>
                    <input type="number" min={1} max={30} step={0.5} value={ebitdaMultiple}
                      onChange={e => setEbitdaMultiple(parseFloat(e.target.value) || 5)}
                      className="w-16 text-center text-sm font-bold border border-indigo-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                    <span className="text-xs text-indigo-600 font-medium">x</span>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${scenarios.length}, minmax(160px, 1fr))` }}>
                {scenarios.map((s, si) => {
                  const r = results[si];
                  const modelEndYear = r.years[r.years.length - 1]?.year ?? 2030;
                  const isBeyondModel = saleYear > modelEndYear;

                  // EBITDA at sale date
                  let saleEbitda: number;
                  let ebitdaSource: string;
                  if (isBeyondModel) {
                    saleEbitda = projectSaleYearEbitda(a, r.lastRow, modelEndYear, saleYear);
                    ebitdaSource = `Projected ${saleYear} (no new sales, churn continues)`;
                  } else {
                    const yearData = r.years.find(y => y.year === saleYear);
                    saleEbitda = yearData?.profit ?? 0;
                    ebitdaSource = `Actual ${saleYear} model data`;
                  }

                  const lastModelYear = r.years[r.years.length - 1];
                  const lastModelEbitda = lastModelYear?.profit ?? 0;

                  const conservativeVal = saleEbitda * (ebitdaMultiple - 1);
                  const avgVal = saleEbitda * ebitdaMultiple;
                  const highVal = saleEbitda * (ebitdaMultiple + 1);

                  let projFranchises = r.lastRow.activeFranchises;
                  let projJV = r.lastRow.activeJV;
                  if (isBeyondModel) {
                    const mChurnF = annualToMonthlyChurn(a.churnRateFranchise);
                    const mChurnJV = annualToMonthlyChurn(a.churnRateJV);
                    for (let m = 0; m < (saleYear - modelEndYear) * 12; m++) {
                      projFranchises = Math.max(0, projFranchises - Math.floor(projFranchises * mChurnF));
                      projJV = Math.max(0, projJV - Math.floor(projJV * mChurnJV));
                    }
                  }

                  return (
                    <div key={si} className="rounded-lg border-2 p-2 overflow-hidden" style={{ borderColor: s.color + '40' }}>
                      <div className="flex items-center gap-1.5 mb-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="font-bold text-xs text-gray-800 truncate">{s.name}</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-gray-500">
                          <div className="font-medium text-gray-700">{saleYear} EBITDA: <span className="font-bold text-gray-800">{fmtK(saleEbitda)}</span></div>
                          {isBeyondModel && <span className="text-[10px] text-purple-600">(projected)</span>}
                        </div>
                        {isBeyondModel && (
                          <div className="text-[9px] text-gray-400 leading-tight">
                            <div>vs {modelEndYear}: {fmtK(lastModelEbitda)} {saleEbitda > lastModelEbitda ? '📈' : saleEbitda < lastModelEbitda ? '📉' : '→'} {saleEbitda !== lastModelEbitda ? ((saleEbitda / lastModelEbitda - 1) * 100).toFixed(0) + '%' : 'flat'}</div>
                            <div>{projFranchises}F · {projJV}JV at sale</div>
                          </div>
                        )}
                        <div className="border-t pt-1.5 space-y-1">
                          <div className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
                            <div className="text-[9px] font-medium text-amber-700 uppercase tracking-wide">Conservative</div>
                            <div className="text-sm font-bold text-amber-700">{fmtM(conservativeVal)}</div>
                            <div className="text-[9px] text-amber-500">{fmtK(saleEbitda)} × {(ebitdaMultiple - 1).toFixed(1)}x</div>
                          </div>
                          <div className="rounded-md bg-blue-50 border border-blue-200 px-2 py-1.5">
                            <div className="text-[9px] font-medium text-blue-700 uppercase tracking-wide">Average</div>
                            <div className="text-sm font-bold text-blue-700">{fmtM(avgVal)}</div>
                            <div className="text-[9px] text-blue-500">{fmtK(saleEbitda)} × {ebitdaMultiple.toFixed(1)}x</div>
                          </div>
                          <div className="rounded-md bg-green-50 border border-green-200 px-2 py-1.5">
                            <div className="text-[9px] font-medium text-green-700 uppercase tracking-wide">High</div>
                            <div className="text-sm font-bold text-green-700">{fmtM(highVal)}</div>
                            <div className="text-[9px] text-green-500">{fmtK(saleEbitda)} × {(ebitdaMultiple + 1).toFixed(1)}x</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
              {saleYear > (results[0]?.years[results[0].years.length - 1]?.year ?? 2030) && (
                <p className="text-[10px] text-gray-400 mt-3 italic">
                  Projection assumes no new sales after model period. Locations fully ramped. Churn continues.
                </p>
              )}
            </div>

            {/* Annual Comparison Table */}
            <div className="bg-white rounded-xl border p-4 shadow-sm overflow-hidden">
              <h3 className="font-bold text-sm text-gray-800 mb-3">Annual P&L by Scenario</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap" style={{ minWidth: 850 }}>
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-2 px-2">Scenario</th>
                      <th className="text-left py-2 px-2">Year</th>
                      <th className="text-right py-2 px-1">Fran Fees</th>
                      <th className="text-right py-2 px-1">Mbr</th>
                      <th className="text-right py-2 px-1">Royalty</th>
                      <th className="text-right py-2 px-1 text-orange-700">Matl</th>
                      <th className="text-right py-2 px-1">Platform</th>
                      <th className="text-right py-2 px-1 font-bold bg-green-50">Revenue</th>
                      <th className="text-right py-2 px-1 font-bold bg-red-50">Cost</th>
                      <th className="text-right py-2 px-1 font-bold">EBITDA</th>
                      <th className="text-right py-2 px-1 text-amber-700">Tax</th>
                      <th className="text-right py-2 px-2 font-bold">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((s, si) => results[si].years.map((y, yi) => (
                      <tr key={`${si}-${yi}`} className={`border-b ${yi === 0 && si > 0 ? 'border-t-2 border-gray-400' : ''}`}>
                        {yi === 0 && <td rowSpan={results[si].years.length} className="py-2 px-2 font-bold align-top max-w-[100px]">
                          <div className="flex items-center gap-1 truncate">
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="truncate">{s.name}</span>
                          </div>
                        </td>}
                        <td className="py-2 px-2 font-medium">{y.year}</td>
                        <td className="text-right py-2 px-1">{fmtK(y.franchiseFees)}</td>
                        <td className="text-right py-2 px-1">{fmtK(y.membership)}</td>
                        <td className="text-right py-2 px-1">{fmtK(y.royalties)}</td>
                        <td className="text-right py-2 px-1 text-orange-600">{fmtK(y.materialMarkup)}</td>
                        <td className="text-right py-2 px-1">{fmtK(y.platformFees)}</td>
                        <td className="text-right py-2 px-1 font-bold bg-green-50">{fmtK(y.revenue)}</td>
                        <td className="text-right py-2 px-1 font-bold bg-red-50">{fmtK(y.cost)}</td>
                        <td className={`text-right py-2 px-1 font-bold ${y.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtK(y.profit)}</td>
                        <td className="text-right py-2 px-1 text-amber-600">{fmtK(y.tax)}</td>
                        <td className={`text-right py-2 px-2 font-bold ${y.netIncome >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmtK(y.netIncome)}</td>
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
