export default function MetricCard({ title, value, subtitle, trend, dark = false }) {
  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : null;
  const trendColor =
    trend === "up"
      ? "text-red-400"
      : trend === "down"
      ? "text-green-400"
      : "";

  const bgClass = dark
    ? "bg-gray-800/70 border-gray-700"
    : "bg-white border-gray-200";

  return (
    <div className={`relative backdrop-blur-sm rounded-xl p-5 shadow-lg border ${bgClass}`}>
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{title}</h3>
      <div className="flex items-baseline mt-1">
        <p className={`text-3xl font-semibold ${dark ? "text-white" : "text-gray-800"}`}>
          {value}
        </p>
        {trendIcon && <span className={`ml-2 text-xl font-bold ${trendColor}`}>{trendIcon}</span>}
      </div>
      {subtitle && (
        <p className="text-xs text-gray-500 mt-1 flex items-center">
          <span className="inline-block w-1 h-1 rounded-full bg-gray-600 mr-2"></span>
          {subtitle}
        </p>
      )}
    </div>
  );
}