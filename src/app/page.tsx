import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 flex items-center justify-center p-8">
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-white mb-2">The Fence Company</h1>
        <p className="text-indigo-200 text-lg mb-10">Financial Planning & Analysis</p>
        <div className="grid grid-cols-2 gap-6">
          <Link href="/franchise" className="group bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 hover:bg-white/20 transition-all shadow-lg hover:shadow-xl">
            <div className="text-3xl mb-3">📊</div>
            <h2 className="text-xl font-bold text-white mb-2">Franchise Growth Planner</h2>
            <p className="text-indigo-200 text-sm">Model franchise expansion scenarios, membership tiers, and revenue forecasting</p>
          </Link>
          <Link href="/budget" className="group bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-8 hover:bg-white/20 transition-all shadow-lg hover:shadow-xl">
            <div className="text-3xl mb-3">💰</div>
            <h2 className="text-xl font-bold text-white mb-2">2026 Budget Dashboard</h2>
            <p className="text-indigo-200 text-sm">Overhead analysis, crew planning, product mix, and monthly P&L projections</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
