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

export default function TrainingChart({ data, currentRound }) {
  // Custom tooltip styled for dark background
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-3">
          <p className="text-gray-300 text-sm font-medium mb-2">Round {label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center text-xs mb-1">
              <span
                className="w-2 h-2 rounded-full mr-2"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-400">{entry.name}:</span>
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
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700 shadow-xl">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
        <span className="w-1.5 h-6 bg-blue-500 rounded-full mr-3"></span>
        Federated Training Progress
        {currentRound > 0 && (
          <span className="ml-3 text-xs font-normal bg-blue-900/50 text-blue-300 px-2 py-1 rounded-full border border-blue-800">
            Round {currentRound}
          </span>
        )}
      </h2>

      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#374151"
            opacity={0.5}
          />
          <XAxis
            dataKey="round"
            stroke="#9CA3AF"
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            tickLine={{ stroke: "#4B5563" }}
            axisLine={{ stroke: "#4B5563" }}
          />
          <YAxis
            stroke="#9CA3AF"
            tick={{ fill: "#9CA3AF", fontSize: 12 }}
            tickLine={{ stroke: "#4B5563" }}
            axisLine={{ stroke: "#4B5563" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{
              color: "#F9FAFB",
              fontSize: "12px",
              paddingBottom: "10px",
            }}
          />
          {/* Vertical line at current round */}
          {currentRound > 0 && (
            <ReferenceLine
              x={currentRound}
              stroke="#60A5FA"
              strokeDasharray="3 3"
              strokeWidth={2}
              label={{
                value: `Round ${currentRound}`,
                position: 'top',
                fill: '#60A5FA',
                fontSize: 11,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="avg_auc"
            name="AUC"
            stroke="#3B82F6"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="avg_dp"
            name="Demographic Parity"
            stroke="#EF4444"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: "#EF4444", stroke: "#fff", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="avg_eo"
            name="Equal Opportunity"
            stroke="#10B981"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 6, fill: "#10B981", stroke: "#fff", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}