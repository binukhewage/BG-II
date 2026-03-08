"use client";

export default function FairnessAnalytics({ hospitals, mode }) {

  if (!hospitals || hospitals.length === 0) return null;

  // -----------------------------
  // Compute network averages
  // -----------------------------
  const avgSenior =
    hospitals.reduce((sum, h) => sum + (h.senior_rate || 0), 0) /
    hospitals.length;

  const avgNonSenior =
    hospitals.reduce((sum, h) => sum + (h.non_senior_rate || 0), 0) /
    hospitals.length;

  const dpGap = Math.abs(avgSenior - avgNonSenior);

  const seniorPercent = Math.round(avgSenior * 100);
  const nonSeniorPercent = Math.round(avgNonSenior * 100);
  const dpPercent = Math.round(dpGap * 100);

  const impactedGroup =
    avgSenior < avgNonSenior
      ? "Senior patients receive fewer positive predictions"
      : "Non-senior patients receive fewer positive predictions";

  // -----------------------------
  // Fairness status indicator
  // -----------------------------
  let fairnessStatus = "Fair";
  let statusColor = "text-emerald-400";

  if (dpPercent > 30) {
    fairnessStatus = "High Bias";
    statusColor = "text-red-400";
  } else if (dpPercent > 15) {
    fairnessStatus = "Moderate Bias";
    statusColor = "text-yellow-400";
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-800 shadow-xl">

      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider">
          Fairness Analytics ({mode === "bias" ? "BiasGuard" : "Baseline"})
        </h3>

        <span className={`text-xs font-semibold ${statusColor}`}>
          {fairnessStatus}
        </span>
      </div>


      {/* Comparison Bars */}

      <div className="space-y-5">

        {/* Senior group */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Senior Patients (≥65)</span>
            <span>{seniorPercent}%</span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all"
              style={{ width: `${seniorPercent}%` }}
            />
          </div>
        </div>


        {/* Non senior group */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Non-Senior Patients (&lt;65)</span>
            <span>{nonSeniorPercent}%</span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800">
            <div
              className="bg-blue-500 h-full rounded-full transition-all"
              style={{ width: `${nonSeniorPercent}%` }}
            />
          </div>
        </div>

      </div>


      {/* Demographic Parity Gap */}

      <div className="mt-6">

        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Demographic Parity Gap</span>
          <span>{dpPercent}%</span>
        </div>

        <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800">
          <div
            className="bg-orange-500 h-full rounded-full transition-all"
            style={{ width: `${dpPercent}%` }}
          />
        </div>

      </div>


      {/* Explanation */}

      <div className="mt-5 text-xs text-slate-400 border-t border-slate-800 pt-3">

        <p className="mb-1">
          ⚠ {impactedGroup}
        </p>

        <p>
          Demographic parity measures whether the model produces similar
          prediction rates across protected groups.
        </p>

      </div>

    </div>
  );
}