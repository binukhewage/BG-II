"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

export default function TrainingChart({
  data,
  currentRound,
  totalRounds,
  loading,
  progressPercent,
  biasStatus,
  biasStatusColor,
  currentDpMitigated,
}) {
  // Custom tooltip styled for dark background
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3">
          <p className="text-slate-300 text-sm font-medium mb-2">Round {label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center text-xs mb-1">
              <span
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-400">{entry.name}:</span>
              <span className="ml-2 font-mono text-white">
                {entry.value.toFixed(3)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-800/70 shadow-xl">
      {/* Header with live engine info */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div className="flex items-center">
          <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-900/40 border border-blue-500/30 shadow-lg">
            <svg
              className="w-6 h-6 text-cyan-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center">
              Live Bias Detection Engine
              {loading && (
                <span className="ml-3 text-xs font-semibold bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded-full animate-pulse border border-emerald-800">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full mr-1 inline-block"></span>
                  ROUND {currentRound}/{totalRounds}
                </span>
              )}
            </h2>
            <p className="text-slate-400 text-xs mt-1">
              Dynamically comparing aggregation fairness against baseline.
            </p>
          </div>
        </div>
        <div className="mt-3 md:mt-0 text-right bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Framework Performance</p>
          <p className={`font-bold text-xl flex items-center justify-end ${biasStatusColor}`}>
            {biasStatus}
            {currentDpMitigated >= 0 ? (
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )}
          </p>
        </div>
      </div>

      {/* Progress bar (only when loading) */}
      {loading && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
            <span>Aggregating Weights & Calculating Penalties...</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(6,182,212,0.8)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Chart */}
      <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
        <span className="w-1.5 h-5 bg-blue-500 rounded-full mr-2"></span>
        Federated Training Progress
        {currentRound > 0 && (
          <span className="ml-3 text-xs font-normal bg-blue-900/50 text-blue-300 px-2 py-1 rounded-full border border-blue-800">
            Round {currentRound}
          </span>
        )}
      </h3>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
          <XAxis dataKey="round" stroke="#94A3B8" tick={{ fill: "#94A3B8", fontSize: 12 }} tickLine={{ stroke: "#475569" }} axisLine={{ stroke: "#475569" }} />
          <YAxis stroke="#94A3B8" tick={{ fill: "#94A3B8", fontSize: 12 }} tickLine={{ stroke: "#475569" }} axisLine={{ stroke: "#475569" }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ color: "#F1F5F9", fontSize: "12px", paddingBottom: "10px" }} />
          {currentRound > 0 && (
            <ReferenceLine x={currentRound} stroke="#60A5FA" strokeDasharray="3 3" strokeWidth={2} label={{ value: `Round ${currentRound}`, position: "top", fill: "#60A5FA", fontSize: 11 }} />
          )}
          <Line type="monotone" dataKey="avg_auc" name="AUC" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} />
          <Line type="monotone" dataKey="avg_dp" name="Demographic Parity" stroke="#EF4444" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#EF4444", stroke: "#fff", strokeWidth: 2 }} />
          <Line type="monotone" dataKey="avg_eo" name="Equal Opportunity" stroke="#10B981" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#10B981", stroke: "#fff", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}