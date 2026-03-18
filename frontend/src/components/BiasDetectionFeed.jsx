"use client";

import { useEffect, useRef, useState } from "react";

export default function BiasDetectionFeed({
  roundHistory    = [],
  baselineHistory = [],
  hospitalMetrics = [],
  loading         = false,
  mode            = "bias",
}) {
  const feedRef    = useRef(null);
  const [events, setEvents] = useState([]);
  const prevLenRef = useRef(0);

  useEffect(() => {
    if (!roundHistory || roundHistory.length === 0) {
      setEvents([]);
      prevLenRef.current = 0;
      return;
    }
    const newRounds = roundHistory.slice(prevLenRef.current);
    if (newRounds.length === 0) return;

    setEvents((prev) => {
      let idx = prev.length;
      const newEvents = newRounds.flatMap((r) => {
        const evts = [];
        const severity =
          r.avg_dp > 0.3  ? "critical" :
          r.avg_dp > 0.1  ? "high"     :
          r.avg_dp > 0.05 ? "moderate" : "low";

        evts.push({
          id: `r${r.round}-start-${idx++}`, type: "round", round: r.round,
          message: `Round ${r.round} complete`,
          detail:  `AUC ${r.avg_auc?.toFixed(3)} · DP ${(r.avg_dp*100).toFixed(1)}% · EO ${(r.avg_eo*100).toFixed(1)}%`,
          dp: r.avg_dp, severity,
        });

        if (r.rejected_count > 0) {
          evts.push({
            id: `r${r.round}-reject-${idx++}`, type: "rejection", round: r.round,
            message: `${r.rejected_count} node${r.rejected_count > 1 ? "s" : ""} hard-rejected`,
            detail:  `Bias exceeded threshold — excluded from aggregation`,
            dp: r.avg_dp,
          });
        }

        evts.push({
          id: `r${r.round}-detect-${idx++}`, type: "detection", round: r.round,
          message: `Bias ${severity.toUpperCase()} — correction applied`,
          detail:  `DP ${(r.avg_dp*100).toFixed(1)}% · Inverse penalty weighting active`,
          dp: r.avg_dp, severity,
        });

        return evts;
      });
      return [...prev, ...newEvents];
    });

    prevLenRef.current = roundHistory.length;
  }, [roundHistory]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  useEffect(() => {
    if (loading && roundHistory.length === 0) { setEvents([]); prevLenRef.current = 0; }
  }, [loading, roundHistory.length]);

  const totalRejections     = roundHistory.reduce((s, r) => s + (r.rejected_count || 0), 0);
  const roundsWithRejection = roundHistory.filter(r => (r.rejected_count||0) > 0).length;
  const firstDP   = roundHistory[0]?.avg_dp ?? null;
  const latestDP  = roundHistory[roundHistory.length - 1]?.avg_dp ?? null;
  const dpReduction = firstDP && latestDP ? ((firstDP - latestDP) / firstDP * 100).toFixed(1) : null;

  // Baseline only runs 20 rounds. For post-onboarding rounds (21+),
  // use the baseline's final round value as the fixed reference point.
  // This is correct — baseline finished at round 20, BiasGuard continues.
  const baselineFinal = baselineHistory[baselineHistory.length - 1] ?? null;

  const comparisonData = roundHistory.map((r, i) => {
    // Use exact baseline round if available, otherwise use baseline final
    const base = baselineHistory[i] ?? baselineFinal;
    return {
      round:    r.round,
      bgDP:     r.avg_dp,
      baseDP:   base?.avg_dp ?? null,
      bgAUC:    r.avg_auc,
      baseAUC:  base?.avg_auc ?? null,
      diff:     base ? base.avg_dp - r.avg_dp : null,
      rejected: r.rejected_count || 0,
      isPostOnboard: i >= baselineHistory.length,
    };
  });

  const bestDiffRound = comparisonData.reduce((best, r) =>
    r.diff !== null && r.diff > (best?.diff ?? -Infinity) ? r : best, null);

  const dpColor  = (dp) => dp > 0.3 ? "text-red-400" : dp > 0.1 ? "text-orange-400" : dp > 0.05 ? "text-yellow-400" : "text-emerald-400";
  const dpBadge  = (dp) => dp > 0.3 ? "bg-red-900/60 text-red-300" : dp > 0.1 ? "bg-orange-900/60 text-orange-300" : dp > 0.05 ? "bg-yellow-900/60 text-yellow-300" : "bg-emerald-900/60 text-emerald-300";
  const sevText  = (s)  => s === "critical" ? "text-red-300" : s === "high" ? "text-orange-300" : s === "moderate" ? "text-yellow-300" : "text-emerald-300";
  const sevBg    = (s)  => s === "critical" ? "bg-red-950/50 border-red-900/60" : s === "high" ? "bg-orange-950/40 border-orange-900/50" : s === "moderate" ? "bg-yellow-950/30 border-yellow-900/40" : "bg-emerald-950/20 border-emerald-900/30";

  if (mode !== "bias") return null;

  return (
    <div className="bg-slate-900/70 backdrop-blur-sm rounded-2xl border border-slate-800/70 shadow-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            {loading && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${loading ? "bg-red-500" : "bg-slate-600"}`} />
          </div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Live Bias Detection &amp; Correction Engine
          </h3>
          {loading && (
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-900/30 px-2 py-0.5 rounded border border-cyan-800/50 animate-pulse">ACTIVE</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-900/50 px-3 py-1 rounded-full">
            <span className="text-red-400">⛔</span>
            <span className="text-red-300 font-bold">{totalRejections}</span>
            <span className="text-slate-500">rejections</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 px-3 py-1 rounded-full">
            <span className="text-cyan-400">◉</span>
            <span className="text-cyan-300 font-bold">{roundHistory.length}</span>
            <span className="text-slate-500">rounds</span>
          </div>
          {dpReduction && (
            <div className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1 rounded-full">
              <span className="text-emerald-400">↓</span>
              <span className="text-emerald-300 font-bold">{dpReduction}%</span>
              <span className="text-slate-500">DP reduced</span>
            </div>
          )}
          {bestDiffRound && (
            <div className="flex items-center gap-1.5 bg-blue-950/40 border border-blue-900/50 px-3 py-1 rounded-full">
              <span className="text-blue-400">★</span>
              <span className="text-blue-300 font-bold">R{bestDiffRound.round}</span>
              <span className="text-slate-500">peak separation</span>
            </div>
          )}
        </div>
      </div>

      {/* Three panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/60">

        {/* Panel 1 — Event log */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-800/40 bg-slate-950/20">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Detection Log</p>
          </div>
          <div ref={feedRef} className="h-72 overflow-y-auto px-4 py-3 space-y-1.5" style={{fontFamily:"monospace"}}>
            {events.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs text-center px-4">
                {loading ? "Waiting for round 1..." : "Run federation to see live detection events"}
              </div>
            ) : (
              events.map((evt) => (
                <div key={evt.id} className={`flex items-start gap-2 py-1.5 px-2.5 rounded-lg text-xs border ${
                  evt.type === "rejection" ? "bg-red-950/40 border-red-900/50" :
                  evt.severity ? sevBg(evt.severity) : "bg-slate-800/30 border-slate-700/30"
                }`}>
                  <span className="flex-shrink-0 mt-0.5">
                    {evt.type === "rejection" ? "⛔" :
                     evt.severity === "low" ? "✅" : evt.severity === "moderate" ? "🟡" :
                     evt.severity === "high" ? "🟠" : evt.severity === "critical" ? "🔴" : "📡"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-slate-500 text-[10px]">R{evt.round}</span>
                      <span className={`font-semibold text-[11px] ${evt.type === "rejection" ? "text-red-300" : evt.severity ? sevText(evt.severity) : "text-slate-300"}`}>
                        {evt.message}
                      </span>
                    </div>
                    <p className="text-slate-500 text-[10px] truncate">{evt.detail}</p>
                  </div>
                  {evt.dp !== undefined && (
                    <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono ${dpBadge(evt.dp)}`}>
                      {(evt.dp*100).toFixed(1)}%
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2 — Round comparison table */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-800/40 bg-slate-950/20">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">BiasGuard vs Baseline — Per Round</p>
          </div>
          <div className="h-72 overflow-y-auto">
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-slate-950/90 backdrop-blur">
                <tr className="text-slate-500 text-[10px]">
                  <th className="text-left px-4 py-2">Rnd</th>
                  <th className="text-right px-2 py-2">Base DP</th>
                  <th className="text-right px-2 py-2">BG DP</th>
                  <th className="text-right px-2 py-2">Diff</th>
                  <th className="text-right px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-slate-600 py-8 text-[11px]">No data yet</td></tr>
                ) : (
                  comparisonData.map((r, i) => {
                    const better = r.diff !== null && r.diff > 0;
                    return (
                      <tr key={`row-${r.round}-${i}`} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-1.5 text-slate-400">
                          {r.round}
                          {r.round === bestDiffRound?.round && <span className="ml-1 text-blue-400 text-[9px]">★</span>}
                          {r.isPostOnboard && <span className="ml-1 text-cyan-600 text-[9px]">+</span>}
                        </td>
                        <td className={`text-right px-2 py-1.5 ${dpColor(r.baseDP)}`}>
                          {r.baseDP !== null ? (r.baseDP*100).toFixed(1)+"%" : "—"}
                          {r.isPostOnboard && r.baseDP !== null && (
                            <span className="block text-[8px] text-slate-600">final</span>
                          )}
                        </td>
                        <td className={`text-right px-2 py-1.5 font-semibold ${dpColor(r.bgDP)}`}>
                          {(r.bgDP*100).toFixed(1)}%
                        </td>
                        <td className={`text-right px-2 py-1.5 font-semibold ${better ? "text-emerald-400" : "text-red-400"}`}>
                          {r.diff !== null ? `${better?"↓":"↑"}${Math.abs(r.diff*100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="text-right px-4 py-1.5">
                          {r.rejected > 0
                            ? <span className="text-red-400 text-[10px]">⛔ {r.rejected}</span>
                            : <span className="text-slate-600 text-[10px]">penalised</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel 3 — Node status */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-800/40 bg-slate-950/20">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Node Status — Last Round</p>
          </div>
          <div className="h-72 px-4 py-3 space-y-3 overflow-y-auto">
            {hospitalMetrics.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-600 text-xs">Waiting for hospital data...</div>
            ) : (
              <>
                {hospitalMetrics.map((h, i) => {
                  const rejected = h.rejected || false;
                  const weight   = h.fairness_weight ?? 1;
                  const dpPct    = h.dp * 100;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${rejected ? "bg-red-400" : weight < 0.15 ? "bg-orange-400" : "bg-emerald-400"}`} />
                          <span className="text-slate-300 font-mono">{h.hospital?.replace(".csv","") ?? `Node ${i+1}`}</span>
                          {rejected && <span className="text-[9px] text-red-400 font-bold border border-red-800/60 px-1 rounded">REJECTED</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className={dpColor(h.dp)}>DP {dpPct.toFixed(1)}%</span>
                          {!rejected && <span className="text-slate-500">w={weight.toFixed(2)}</span>}
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${rejected ? "bg-red-500" : dpPct > 10 ? "bg-orange-500" : dpPct > 5 ? "bg-yellow-500" : "bg-emerald-500"}`}
                          style={{width:`${Math.min(dpPct*3,100)}%`}} />
                      </div>
                      {!rejected && (
                        <div className="h-1 w-full bg-slate-800/50 rounded-full overflow-hidden">
                          <div className="h-full bg-cyan-500/50 rounded-full transition-all duration-700" style={{width:`${weight*100}%`}} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {roundsWithRejection > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800/40">
                    <p className="text-[10px] text-slate-500 font-mono leading-relaxed">
                      Rejection fired in <span className="text-red-400">{roundsWithRejection}</span> of <span className="text-cyan-400">{roundHistory.length}</span> rounds — biased nodes excluded from global aggregation.
                    </p>
                  </div>
                )}
                {bestDiffRound && (
                  <div className="pt-1">
                    <p className="text-[10px] text-slate-500 font-mono">
                      Peak advantage R<span className="text-blue-400">{bestDiffRound.round}</span>: <span className="text-emerald-400">{(bestDiffRound.diff*100).toFixed(1)}% lower DP</span> than baseline.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-2.5 border-t border-slate-800/40 bg-slate-950/30 flex items-center justify-between">
        <p className="text-[10px] text-slate-500 font-mono">
          Two-layer correction: gradient-level fairness loss + round-level aggregation penalty
        </p>
        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
          <span>✅ Low &lt;5%</span>
          <span>🟡 Moderate 5–10%</span>
          <span>🟠 High 10–30%</span>
          <span>🔴 Critical &gt;30%</span>
        </div>
      </div>
    </div>
  );
}