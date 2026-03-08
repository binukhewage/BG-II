export default function HospitalTable({ hospitals }) {
  if (!hospitals || hospitals.length === 0) return null;

  // ---- Compute network averages ----
  const avgDP =
    hospitals.reduce((sum, h) => sum + h.dp, 0) / hospitals.length;

  const avgEO =
    hospitals.reduce((sum, h) => sum + h.eo, 0) / hospitals.length;

  // ---- Sort by DP descending (worst first) ----
  const sortedHospitals = [...hospitals].sort((a, b) => b.dp - a.dp);

  // ---- Risk classification relative to network ----
  const getRiskLevel = (value, networkAvg) => {
    const deviation = value - networkAvg;

    if (deviation < -0.05) {
      return {
        label: "Below Network Bias",
        style:
          "bg-green-900/50 text-green-300 border border-green-700",
      };
    } else if (Math.abs(deviation) <= 0.05) {
      return {
        label: "Within Network Range",
        style:
          "bg-yellow-900/50 text-yellow-300 border border-yellow-700",
      };
    } else {
      return {
        label: "Above Network Bias",
        style:
          "bg-red-900/50 text-red-300 border border-red-700",
      };
    }
  };

  // ---- Bias direction (which group affected) ----
  const getBiasDirection = (gap) => {
    if (gap > 0) {
      return {
        label: "Senior patients disadvantaged",
        style:
          "bg-red-900/50 text-red-300 border border-red-700",
      };
    }

    if (gap < 0) {
      return {
        label: "Non-senior patients disadvantaged",
        style:
          "bg-orange-900/50 text-orange-300 border border-orange-700",
      };
    }

    return {
      label: "Balanced",
      style:
        "bg-green-900/50 text-green-300 border border-green-700",
    };
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700 shadow-xl">
      <h2 className="text-xl font-semibold text-white mb-2 flex items-center">
        <span className="w-1.5 h-6 bg-blue-500 rounded-full mr-3"></span>
        Institutional Bias Governance Panel
      </h2>

      <p className="text-sm text-gray-400 mb-6">
        Relative fairness assessment across federated institutions.
        Risk classification is computed against current network averages.
      </p>

      {/* Network Summary */}
      <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
          <p className="text-gray-400">Network Avg DP</p>
          <p className="text-white font-semibold text-lg">
            {avgDP.toFixed(3)}
          </p>
        </div>

        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
          <p className="text-gray-400">Network Avg EO</p>
          <p className="text-white font-semibold text-lg">
            {avgEO.toFixed(3)}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-sm">
              <th className="py-3">Rank</th>
              <th>Hospital</th>
              <th>AUC</th>
              <th>DP</th>
              <th>EO</th>
              <th>Bias Direction</th>
              <th>Bias Status</th>
              <th>Samples</th>
            </tr>
          </thead>

          <tbody>
            {sortedHospitals.map((h, index) => {
              const risk = getRiskLevel(h.dp, avgDP);
              const direction = getBiasDirection(h.dp_direction);
              const isWorst = index === 0;

              return (
                <tr
                  key={index}
                  className={`border-b border-gray-700 transition ${
                    isWorst
                      ? "bg-red-900/20"
                      : "hover:bg-gray-700/50"
                  }`}
                >
                  <td className="py-3 text-gray-400 font-semibold">
                    #{index + 1}
                  </td>

                  <td className="font-medium text-white">
                    {h.hospital}
                    {isWorst && (
                      <span className="ml-2 text-xs text-red-400">
                        (Highest Bias)
                      </span>
                    )}
                  </td>

                  <td className="font-semibold text-white">
                    {h.auc.toFixed(3)}
                  </td>

                  <td className="text-white">
                    {h.dp.toFixed(3)}
                  </td>

                  <td className="text-white">
                    {h.eo.toFixed(3)}
                  </td>

                  {/* Bias Direction */}
                  <td>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${direction.style}`}
                    >
                      {direction.label}
                    </span>
                  </td>

                  {/* Bias Status */}
                  <td>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${risk.style}`}
                    >
                      {risk.label}
                    </span>
                  </td>

                  <td className="text-gray-400">
                    {h.samples}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}