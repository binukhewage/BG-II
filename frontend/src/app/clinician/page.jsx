"use client";

import { useState } from "react";
import {
  ShieldCheck,
  User,
  ArrowLeft,
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Zap,
  Heart,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------
// Urgency level config — drives all colour decisions
// ---------------------------------------------------
const URGENCY_CONFIG = {
  Stable: {
    badge:   "bg-emerald-900/30 text-emerald-400 border border-emerald-800/40",
    bar:     "bg-emerald-500",
    glow:    "shadow-[0_0_20px_rgba(52,211,153,0.2)]",
    ring:    "border-emerald-700/40",
    label:   "Stable",
    message: "Patient is currently stable. Continue routine monitoring.",
  },
  Watch: {
    badge:   "bg-amber-900/30 text-amber-400 border border-amber-800/40",
    bar:     "bg-amber-500",
    glow:    "shadow-[0_0_20px_rgba(251,191,36,0.2)]",
    ring:    "border-amber-700/40",
    label:   "Watch",
    message: "Early signs detected. Increase observation frequency.",
  },
  Concern: {
    badge:   "bg-orange-900/30 text-orange-400 border border-orange-800/40",
    bar:     "bg-orange-500",
    glow:    "shadow-[0_0_20px_rgba(251,146,60,0.25)]",
    ring:    "border-orange-700/40",
    label:   "Concern",
    message: "Clinical concern — urgent review recommended.",
  },
  Escalate: {
    badge:   "bg-red-900/30 text-red-400 border border-red-800/40",
    bar:     "bg-red-500",
    glow:    "shadow-[0_0_20px_rgba(248,113,113,0.3)]",
    ring:    "border-red-700/40",
    label:   "Escalate",
    message: "High deterioration risk — consider critical care escalation.",
  },
};

const NEWS2_COLOUR = {
  green:  { text: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-800/40" },
  yellow: { text: "text-amber-400",   bg: "bg-amber-900/20",   border: "border-amber-800/40" },
  orange: { text: "text-orange-400",  bg: "bg-orange-900/20",  border: "border-orange-800/40" },
  red:    { text: "text-red-400",     bg: "bg-red-900/20",     border: "border-red-800/40" },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ---------------------------------------------------
// Helpers
// ---------------------------------------------------
const fmt1 = (v) => (v == null ? "N/A" : Number(v).toFixed(1));
const fmt0 = (v) => (v == null ? "N/A" : Math.round(Number(v)).toString());


// ====================================================
// Main Page
// ====================================================
export default function ClinicianDashboard() {
  const [patientId, setPatientId] = useState("");
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  const fetchPatient = async () => {
    const id = patientId.trim();
    if (!id) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`${API_BASE}/clinician/patient/${id}`);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        setError(err.detail || `Server error ${res.status}`);
        setLoading(false);
        return;
      }

      setData(await res.json());
    } catch {
      setError("Cannot reach the server. Make sure the backend is running.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans p-4 md:p-8">

      {/* ------------------------------------------------ */}
      {/* Header                                           */}
      {/* ------------------------------------------------ */}
      <header className="max-w-6xl mx-auto mb-8">
        <div className="mb-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to BiasGuard Dashboard
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="text-indigo-400" size={24} />
              BiasGuard
              <span className="text-slate-500 font-light text-sm ml-1">Clinical Support Portal</span>
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              ICU Deterioration Early Warning &amp; Fairness-Aware Decision Support
            </p>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Patient ID (e.g. 149713)"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPatient()}
              className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-64 transition-all text-sm"
            />
            <button
              onClick={fetchPatient}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
            >
              <Activity size={15} />
              {loading ? "Analysing..." : "Assess Patient"}
            </button>
          </div>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="max-w-6xl mx-auto mb-6 flex items-center gap-3 bg-red-900/20 border border-red-800/50 text-red-300 px-5 py-4 rounded-xl text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* Dashboard                                        */}
      {/* ------------------------------------------------ */}
      {data && (() => {
        const dw     = data.deterioration_warning;
        const cs     = data.clinical_summary;
        const uc = URGENCY_CONFIG[dw?.urgency_level] || URGENCY_CONFIG.Watch;
        const n2c    = NEWS2_COLOUR[data.news2?.colour] || NEWS2_COLOUR.green;

        return (
          <main className="max-w-6xl mx-auto space-y-6">

            {/* ========================================== */}
            {/* ROW 1 — Urgency banner                     */}
            {/* ========================================== */}
            <div className={`rounded-2xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 ${uc.ring} ${uc.glow}`}>
              <div className="flex items-center gap-4">
                <div className={`text-4xl font-extrabold ${uc.badge.includes("emerald") ? "text-emerald-400" : uc.badge.includes("amber") ? "text-amber-400" : uc.badge.includes("orange") ? "text-orange-400" : "text-red-400"}`}>
                  {fmt0(dw.risk_percentage)}%
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${uc.badge}`}>
                      {dw.urgency_level}
                    </span>
                    <span className="text-xs text-slate-400">Deterioration Risk</span>
                  </div>
                  <p className="text-sm text-slate-300">{uc.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">Model Confidence</p>
                  <p className="font-bold text-white">{dw.confidence}%</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">Patient ID</p>
                  <p className="font-mono font-bold text-white">{data.patient_id}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">Group</p>
                  <p className="font-bold text-indigo-300 text-xs">{data.fairness_context.patient_group}</p>
                </div>
              </div>

              {/* Gauge bar */}
              <div className="w-full md:w-48">
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${uc.bar}`}
                    style={{ width: `${dw.risk_percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                  <span>Stable</span><span>Watch</span><span>Concern</span><span>Escalate</span>
                </div>
              </div>
            </div>

            {/* ========================================== */}
            {/* ROW 2 — Vitals + Patient profile           */}
            {/* ========================================== */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

              {/* Vitals */}
              <div className="md:col-span-8 space-y-4">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Heart size={14} /> Current Vitals
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <VitalCard label="Heart Rate"   value={fmt1(cs.heart_rate)}        unit="BPM"    alert={data.reference_flags?.heart_rate_high || data.reference_flags?.heart_rate_low} />
                  <VitalCard label="O₂ Sat"       value={fmt1(cs.oxygen_saturation)} unit="%"      alert={data.reference_flags?.oxygen_saturation_low} />
                  <VitalCard label="Blood Press."  value={fmt1(cs.blood_pressure)}    unit="mmHg"   alert={data.reference_flags?.blood_pressure_low || data.reference_flags?.blood_pressure_high} />
                  <VitalCard label="Glucose"       value={fmt1(cs.glucose)}           unit="mg/dL"  alert={data.reference_flags?.glucose_high || data.reference_flags?.glucose_low} />
                  <VitalCard label="Creatinine"    value={fmt1(cs.creatinine)}        unit="mg/dL"  alert={data.reference_flags?.creatinine_high} />
                  <VitalCard label="WBC"           value={fmt1(cs.white_blood_cells)} unit="×10³"   alert={data.reference_flags?.white_blood_cells_high || data.reference_flags?.white_blood_cells_low} />
                  <VitalCard label="BUN"           value={fmt1(cs.bun)}               unit="mg/dL"  alert={data.reference_flags?.bun_high} />
                  <VitalCard label="Age"           value={fmt0(cs.age)}               unit="yrs"    />
                </div>
              </div>

              {/* Patient profile */}
              <div className="md:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <User size={14} /> Patient Profile
                </h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Age</p>
                    <p className="font-semibold">{cs.age ?? "N/A"} yrs</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Status</p>
                    <p className="font-semibold">{cs.is_senior ? "Senior" : "Adult"}</p>
                  </div>
                </div>

                {/* BiasGuard active badge */}
                <div className="flex items-start gap-2 bg-indigo-900/20 border border-indigo-800/30 text-indigo-300 p-3 rounded-xl text-xs leading-relaxed">
                  <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>BiasGuard Active</strong> — bias mitigation applied for{" "}
                    {data.fairness_context.patient_group} patients.
                  </span>
                </div>

                {/* Group comparison */}
                <GroupComparisonBar fairness={data.fairness_context} />
              </div>
            </div>

            {/* ========================================== */}
            {/* ROW 3 — NEWS2 + SIRS + Interventions       */}
            {/* ========================================== */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* NEWS2 */}
              <div className={`rounded-2xl border p-5 ${n2c.bg} ${n2c.border}`}>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity size={13} />
                  <span className={n2c.text}>NEWS2 Score</span>
                </h3>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-4xl font-extrabold ${n2c.text}`}>{data.news2.total}</span>
                  <span className="text-xs text-slate-400">/ ~14</span>
                </div>
                <p className={`text-xs mb-4 ${n2c.text}`}>{data.news2.interpretation}</p>
                <div className="space-y-1.5">
                  {Object.entries(data.news2.components).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-slate-400">{k}</span>
                      <span className={`font-bold ${v > 0 ? n2c.text : "text-slate-500"}`}>
                        {v > 0 ? `+${v}` : "0"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-3 italic">
                  National Early Warning Score 2 — validated ICU early warning tool
                </p>
              </div>

              {/* SIRS */}
              <div className={`rounded-2xl border p-5 ${data.sirs.sepsis_alert ? "bg-red-900/10 border-red-800/40" : "bg-slate-900 border-slate-800"}`}>
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FlaskConical size={13} />
                  <span className={data.sirs.sepsis_alert ? "text-red-400" : "text-slate-300"}>
                    SIRS Criteria
                  </span>
                </h3>

                {data.sirs.sepsis_alert && (
                  <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/40 text-red-300 text-xs p-2.5 rounded-lg mb-3">
                    <AlertTriangle size={13} className="shrink-0" />
                    {data.sirs.message}
                  </div>
                )}

                <div className="space-y-2">
                  {Object.entries(data.sirs.criteria_all).map(([criterion, met]) => (
                    <div key={criterion} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{criterion}</span>
                      {typeof met === "boolean" ? (
                        <span className={`font-bold px-1.5 py-0.5 rounded ${met ? "text-red-400 bg-red-900/30" : "text-emerald-400 bg-emerald-900/20"}`}>
                          {met ? "Met" : "Clear"}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px] italic">{met}</span>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-[10px] text-slate-600 mt-3 italic">
                  SIRS: ≥2 criteria met may indicate systemic inflammation or early sepsis
                </p>
              </div>

              {/* Interventions */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Zap size={13} className="text-amber-400" />
                  Recommended Actions
                </h3>

                {data.interventions.length === 0 ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs bg-emerald-900/20 border border-emerald-800/30 p-3 rounded-lg">
                    <ShieldCheck size={14} />
                    All vitals within normal range. No immediate interventions flagged.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.interventions.map((iv, i) => (
                      <div key={i} className="text-xs bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-mono px-1.5 py-0.5 rounded text-[10px] font-bold ${iv.direction === "high" ? "bg-orange-900/40 text-orange-400" : "bg-blue-900/40 text-blue-400"}`}>
                            {iv.direction === "high" ? "▲ HIGH" : "▼ LOW"}
                          </span>
                          <span className="text-slate-300 font-medium capitalize">
                            {iv.vital.replace(/_/g, " ")}
                          </span>
                          <span className="text-slate-500 ml-auto">
                            {fmt1(iv.value)} {iv.unit}
                          </span>
                        </div>
                        <p className="text-slate-400 leading-relaxed">{iv.suggestion}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ========================================== */}
            {/* ROW 4 — Fairness context + Explainability  */}
            {/* ========================================== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Fairness panel — the BiasGuard centrepiece */}
              <FairnessPanel fairness={data.fairness_context} />

              {/* Explainability */}
              <ExplanationPanel
                explanation={data.explanation}
                urgencyLevel={dw.urgency_level}
              />
            </div>

          </main>
        );
      })()}
    </div>
  );
}


// ====================================================
// Group Comparison Bar
// Shows this patient's risk vs their group average
// ====================================================
function GroupComparisonBar({ fairness }) {
  const patientPct = fairness.patient_risk_pct || 0;
  const groupPct   = fairness.group_avg_risk_pct || 0;
  const delta      = fairness.patient_vs_group_delta || 0;
  const above      = delta > 0;

  return (
    <div className="text-xs space-y-2">
      <p className="text-slate-500 uppercase tracking-wider font-semibold">Risk vs Group Average</p>
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between mb-0.5">
            <span className="text-slate-400">This patient</span>
            <span className="font-bold text-white">{patientPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${patientPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-0.5">
            <span className="text-slate-400">Group avg ({fairness.patient_group})</span>
            <span className="font-bold text-slate-300">{groupPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-slate-500 rounded-full" style={{ width: `${groupPct}%` }} />
          </div>
        </div>
      </div>
      <p className={`font-medium ${above ? "text-orange-400" : "text-emerald-400"}`}>
        {above ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}pp {above ? "above" : "below"} group average
      </p>
    </div>
  );
}


// ====================================================
// Fairness Panel
// Core BiasGuard research contribution made visible
// ====================================================
function FairnessPanel({ fairness }) {
  const delta = fairness.patient_vs_group_delta || 0;
  const above = delta > 0;

  return (
    <div className="bg-slate-900 border border-indigo-900/50 rounded-2xl p-6 shadow-xl">
      <h3 className="text-sm font-bold text-indigo-300 uppercase tracking-wider mb-1 flex items-center gap-2">
        <ShieldCheck size={15} />
        BiasGuard Fairness Context
      </h3>
      <p className="text-xs text-slate-500 mb-5">
        How does this patient's risk compare to their demographic group?
        BiasGuard's bias-aware federated model ensures equitable predictions across groups.
      </p>

      {/* Group comparison visual */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">This Patient</p>
          <p className="text-2xl font-extrabold text-indigo-300">{fairness.patient_risk_pct}%</p>
          <p className="text-[10px] text-slate-500 mt-1">{fairness.patient_group}</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400 mb-1">Group Average</p>
          <p className="text-2xl font-extrabold text-slate-300">{fairness.group_avg_risk_pct}%</p>
          <p className="text-[10px] text-slate-500 mt-1">{fairness.patient_group}</p>
        </div>
      </div>

      {/* Delta indicator */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${above ? "bg-orange-900/10 border-orange-800/30 text-orange-300" : "bg-emerald-900/10 border-emerald-800/30 text-emerald-300"}`}>
        {above ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        <span>{fairness.interpretation}</span>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-indigo-400 bg-indigo-900/10 border border-indigo-800/20 p-2.5 rounded-lg">
        <ShieldCheck size={12} className="shrink-0" />
        Bias mitigation active — predictions adjusted by BiasGuard federated fairness layer.
      </div>
    </div>
  );
}


// ====================================================
// Explanation Panel — diverging bar chart
// ====================================================
function ExplanationPanel({ explanation, urgencyLevel }) {
  const maxImpact = Math.max(...explanation.map((e) => Math.abs(e.impact)), 0.001);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Activity size={15} className="text-indigo-400" />
          Why is risk <span className="text-indigo-300 ml-1">{urgencyLevel}?</span>
        </h3>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded border border-slate-700">
          Feature Contributions
        </span>
      </div>

      <div className="space-y-4">
        {explanation.map((e, i) => {
          const isPositive  = e.impact > 0;
          const barWidthPct = (Math.abs(e.impact) / maxImpact) * 44;

          return (
            <div key={i} className="group">
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize group-hover:text-indigo-300 transition-colors">
                    {e.feature.replace(/_/g, " ")}
                  </span>
                  {e.imputed && (
                    <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded border border-slate-700">
                      estimated
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {isPositive
                    ? <TrendingUp size={12} className="text-red-400" />
                    : <TrendingDown size={12} className="text-emerald-400" />
                  }
                  <span className={`font-mono ${isPositive ? "text-red-400" : "text-emerald-400"}`}>
                    {isPositive ? "+" : ""}{e.impact.toFixed(3)}
                  </span>
                  {e.value != null && (
                    <span className="text-slate-500">({Number(e.value).toFixed(1)})</span>
                  )}
                </div>
              </div>

              {/* Diverging bar */}
              <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-slate-600 z-10" />
                <div
                  className={`absolute top-0 h-full rounded-full transition-all duration-700 ${isPositive ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{
                    width: `${barWidthPct}%`,
                    left:  isPositive ? "50%" : `${50 - barWidthPct}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg flex gap-2 italic">
        <ChevronRight size={14} className="shrink-0 text-indigo-400 mt-0.5" />
        Red bars increase deterioration risk. Green bars are protective factors.
        Values in parentheses are the raw clinical readings.
      </p>
    </div>
  );
}


// ====================================================
// VitalCard
// ====================================================
function VitalCard({ label, value, unit, alert }) {
  return (
    <div className={`p-3.5 rounded-xl border transition-colors ${alert ? "bg-red-900/10 border-red-800/40" : "bg-slate-900 border-slate-800"}`}>
      <p className={`text-[10px] uppercase font-semibold mb-1 flex items-center gap-1 ${alert ? "text-red-400" : "text-slate-500"}`}>
        {label}
        {alert && <AlertTriangle size={10} />}
      </p>
      <p className={`text-lg font-bold ${alert ? "text-red-300" : "text-white"}`}>
        {value}
        <span className="text-xs font-normal text-slate-500 ml-1">{unit}</span>
      </p>
    </div>
  );
}