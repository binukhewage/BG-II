"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  ChevronRight,
  ShieldCheck,
  User,
  TrendingUp,
  TrendingDown,
  ArrowLeft, // Added for the back button
} from "lucide-react";
import Link from "next/link"; // Assuming you are using Next.js

export default function ClinicianDashboard() {
  const [patientId, setPatientId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPatient = async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/clinician/patient/${patientId}`,
      );
      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const format1 = (v) => {
    if (v === undefined || v === null) return "N/A";
    return Number(v).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans p-4 md:p-8">
      {/* Navigation & Header Section */}
      <header className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium group"
          >
            <ArrowLeft
              size={18}
              className="group-hover:-translate-x-1 transition-transform"
            />
            Back to Home
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="text-indigo-400" />
              BiasGuard{" "}
              <span className="text-slate-500 font-light text-sm ml-2">
                Clinical Portal v2.4
              </span>
            </h1>
            <p className="text-slate-400 text-sm">
              Predictive Mortality Analysis & Fairness-Aware Monitoring
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search Patient ID (e.g. 149713)"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-64 transition-all"
            />
            <button
              onClick={fetchPatient}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </div>
        </div>
      </header>

      {data && (
        <main className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-6 animate-in fade-in duration-500">
          {/* LEFT COLUMN: Risk & Summary */}
          <div className="md:col-span-4 space-y-6">
            {/* Risk Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4">
                <AlertCircle
                  className={
                    data.mortality_prediction.risk_level === "High"
                      ? "text-red-500"
                      : "text-amber-500"
                  }
                />
              </div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Mortality Risk Score
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-white">
                  {Math.round(data.mortality_prediction.risk_percentage)}%
                </span>
                <span
                  className={`text-sm font-bold px-2 py-1 rounded ${
                    data.mortality_prediction.risk_level === "High"
                      ? "bg-red-900/30 text-red-400"
                      : "bg-amber-900/30 text-amber-400"
                  }`}
                >
                  {data.mortality_prediction.risk_level} Risk
                </span>
              </div>

              {/* Visual Gauge Bar */}
              <div className="mt-6 w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    data.mortality_prediction.risk_percentage > 70
                      ? "bg-red-500"
                      : "bg-amber-500"
                  }`}
                  style={{
                    width: `${data.mortality_prediction.risk_percentage}%`,
                  }}
                />
              </div>
              <p className="mt-4 text-xs text-slate-500 italic">
                *This score represents the statistical likelihood of mortality
                within the current ICU stay.
              </p>
            </div>

            {/* Patient Info Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <User size={16} /> Patient Profile
              </h3>
              <div className="grid grid-cols-2 gap-y-4">
                <div>
                  <p className="text-xs text-slate-500">Age</p>
                  <p className="text-lg font-medium">
                    {data.clinical_summary.age} Years
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="text-lg font-medium">
                    {data.clinical_summary.is_senior ? "Senior" : "Adult"}
                  </p>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-800">
                  <p className="text-xs text-slate-500 mb-2">
                    ID: {data.patient_id}
                  </p>
                  <div className="flex items-center gap-2 text-xs bg-indigo-900/20 text-indigo-300 p-2 rounded border border-indigo-800/30">
                    <ShieldCheck size={14} />
                    BiasGuard Active: {data.fairness_context.patient_group}{" "}
                    Optimized
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Clinical Data & Explainability */}
          <div className="md:col-span-8 space-y-6">
            {/* Vitals Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <VitalCard
                label="Heart Rate"
                value={format1(data.clinical_summary.heart_rate)}
                unit="BPM"
              />

              <VitalCard
                label="O2 Sat"
                value={format1(data.clinical_summary.oxygen_saturation)}
                unit="%"
                alert={(data.clinical_summary.oxygen_saturation ?? 100) < 94}
              />

              <VitalCard
                label="Glucose"
                value={format1(data.clinical_summary.glucose)}
                unit="mg/dL"
              />

              <VitalCard
                label="BUN"
                value={format1(data.clinical_summary.bun)}
                unit="mg/dL"
              />
            </div>

            {/* AI Reasoning Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-white">
                  Why is the risk level {data.mortality_prediction.risk_level}?
                </h3>
                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                  Model Feature Contributions
                </span>
              </div>

              <div className="space-y-5">
                {data.explanation.map((e, i) => {
                  const isPositive = e.impact > 0;
                  return (
                    <div key={i} className="group">
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-sm font-medium capitalize group-hover:text-indigo-300 transition-colors">
                          {e.feature.replace("_", " ")}
                        </span>
                        <div className="flex items-center gap-1">
                          {isPositive ? (
                            <TrendingUp size={14} className="text-red-400" />
                          ) : (
                            <TrendingDown
                              size={14}
                              className="text-emerald-400"
                            />
                          )}
                          <span
                            className={`text-xs font-mono ${isPositive ? "text-red-400" : "text-emerald-400"}`}
                          >
                            {isPositive ? "+" : ""}
                            {e.impact.toFixed(3)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full flex overflow-hidden">
                        {!isPositive && (
                          <div
                            className="bg-transparent h-full"
                            style={{
                              width: `${50 - Math.min(Math.abs(e.impact) * 40, 50)}%`,
                            }}
                          />
                        )}
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${isPositive ? "bg-red-500" : "bg-emerald-500"}`}
                          style={{
                            width: `${Math.min(Math.abs(e.impact) * 40, 50)}%`,
                            marginLeft: isPositive ? "50%" : "0",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-6 text-sm text-slate-400 bg-slate-800/50 p-3 rounded-lg flex gap-3 italic">
                <ChevronRight className="shrink-0 text-indigo-400" />
                Note: Positive values increase predicted mortality risk, while
                negative values indicate factors that currently lower the risk.
              </p>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function VitalCard({ label, value, unit, alert }) {
  return (
    <div
      className={`p-4 rounded-xl border ${alert ? "bg-red-900/10 border-red-800/40" : "bg-slate-900 border-slate-800"}`}
    >
      <p className="text-xs text-slate-500 uppercase font-semibold mb-1">
        {label}
      </p>
      <p
        className={`text-xl font-bold ${alert ? "text-red-400" : "text-white"}`}
      >
        {value}{" "}
        <span className="text-xs font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );
}
