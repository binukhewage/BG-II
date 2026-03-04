"use client";

import { useState, useEffect } from "react";
import { startFederation } from "../lib/api";

import MetricCard from "../components/MetricCard";
import TrainingChart from "../components/TrainingChart";
import HospitalTable from "../components/HospitalTable";

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("bias");
  const [visibleRounds, setVisibleRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);

  const handleStart = async () => {
    setLoading(true);
    setVisibleRounds([]);
    setCurrentRound(0);
    setMode("bias"); // Reset to Bias-Aware view on new run

    const result = await startFederation();
    setData(result);

    const rounds = result.bias_aware.round_history;

    let i = 0;
    const interval = setInterval(() => {
      setVisibleRounds((prev) => [...prev, rounds[i]]);
      setCurrentRound(i + 1);
      i++;

      if (i >= rounds.length) {
        clearInterval(interval);
        setLoading(false);
      }
    }, 800);
  };

  useEffect(() => {
    if (data && !loading) {
      const selected = mode === "baseline" ? data.baseline : data.bias_aware;
      setVisibleRounds(selected.round_history);
      setCurrentRound(selected.round_history.length);
    }
  }, [mode, data, loading]);

  // ==========================================
  // LANDING PAGE (Hero Screen)
  // ==========================================
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="text-center max-w-3xl z-10">
          <div className="mb-6 inline-flex items-center justify-center p-4 bg-blue-900/30 rounded-full border border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
             <svg className="w-12 h-12 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          </div>
          <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-200 mb-4 tracking-tight">
            BiasGuard
          </h1>
          <p className="text-2xl text-slate-300 mb-2 font-light">Federated ICU Bias Monitoring System</p>
          <p className="text-sm text-cyan-400/80 mb-12 font-mono tracking-widest uppercase">Unified Framework: Real-Time Fairness & Privacy</p>
          <button
            onClick={handleStart}
            disabled={loading}
            className="group relative bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-10 py-5 rounded-full text-lg font-semibold shadow-[0_0_40px_rgba(6,182,212,0.4)] transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed border border-cyan-400/50"
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Establishing Secure Connections...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <svg className="w-6 h-6 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Initialize Secure Federation
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD MATH & STATE
  // ==========================================
  const selected = mode === "baseline" ? data.baseline : data.bias_aware;
  const currentIndex = visibleRounds.length > 0 ? visibleRounds.length - 1 : 0;
  
  // Cross-reference current round between both models
  const baselineCurrent = data.baseline.round_history[currentIndex] || data.baseline.round_history[0];
  const biasAwareCurrent = data.bias_aware.round_history[currentIndex] || data.bias_aware.round_history[0];
  
  // Calculate instantaneous Round-over-Round Delta for live animation
  const baselinePrevious = currentIndex > 0 ? data.baseline.round_history[currentIndex - 1] : baselineCurrent;
  const biasAwarePrevious = currentIndex > 0 ? data.bias_aware.round_history[currentIndex - 1] : biasAwareCurrent;
  
  const prevDpMitigated = baselinePrevious.avg_dp - biasAwarePrevious.avg_dp;
  const currentDpMitigated = baselineCurrent.avg_dp - biasAwareCurrent.avg_dp;
  const dpRoundDelta = currentDpMitigated - prevDpMitigated;

  const prevEoMitigated = baselinePrevious.avg_eo - biasAwarePrevious.avg_eo;
  const currentEoMitigated = baselineCurrent.avg_eo - biasAwareCurrent.avg_eo;
  const eoRoundDelta = currentEoMitigated - prevEoMitigated;

  const biasStatus = currentDpMitigated >= 0 ? "Bias Suppressed" : "Bias Increasing ⚠";
  const biasStatusColor = currentDpMitigated >= 0 ? "text-emerald-400" : "text-red-400";

  const totalRounds = selected.round_history.length;
  const progressPercent = (currentRound / totalRounds) * 100;
  const currentRoundData = selected.round_history[currentIndex];

  // Dynamic Privacy Config from Backend
  const privacy = data.privacy || { enabled: false, noise_scale: 0, clip_value: 0 };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 selection:bg-cyan-500/30">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-4xl md:text-4xl text-white mb-2 font-bold flex items-center gap-3">
              BiasGuard x
            </h1>
            <p className="text-cyan-400 font-mono text-sm tracking-wide">
              INTEGRATED REAL-TIME BIAS DETECTION & CRYPTOGRAPHIC PRIVACY
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-4">
            <div className="flex items-center bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-full border border-slate-700">
              <span className="relative flex h-3 w-3 mr-2">
                {loading && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${loading ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
              </span>
              <span className="text-sm font-medium text-slate-300">{loading ? "SYSTEM ACTIVE" : "TRAINING COMPLETE"}</span>
            </div>
            <button
              onClick={handleStart}
              disabled={loading}
              className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium border border-slate-600 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? "Training..." : "Restart Simulation"}
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6 bg-slate-900/60 p-1.5 rounded-2xl w-fit border border-slate-800">
          <button
            onClick={() => setMode("baseline")}
            disabled={loading}
            className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
              mode === "baseline" ? "bg-slate-700 text-white shadow-md border border-slate-600" : "text-slate-400 hover:text-slate-200"
            } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Standard FedAvg (Baseline)
          </button>
          <button
            onClick={() => setMode("bias")}
            disabled={loading}
            className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
              mode === "bias" ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] border border-cyan-500/50" : "text-slate-400 hover:text-slate-200"
            } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            BiasGuard Framework
          </button>
        </div>

        {/* Live Mitigation Engine Bar */}
        <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-2xl mb-6 border border-slate-800 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50 animate-[pulse_2s_ease-in-out_infinite]"></div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center">
               <div className="mr-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-900/40 border border-blue-500/30">
                 <svg className="w-7 h-7 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
               </div>
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center">
                  Live Bias Detection Engine
                  {loading && (
                    <span className="ml-4 text-xs font-semibold bg-emerald-900/50 text-emerald-400 px-3 py-1 rounded-full animate-pulse border border-emerald-800 flex items-center">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full mr-2"></span> ROUND {currentRound}/{totalRounds}
                    </span>
                  )}
                </h2>
                <p className="text-slate-400 text-sm mt-1 font-light">Dynamically comparing aggregation fairness against baseline.</p>
              </div>
            </div>
            <div className="mt-4 md:mt-0 text-right bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1 font-semibold">Framework Performance</p>
              <p className={`font-bold text-2xl flex items-center justify-end ${biasStatusColor}`}>
                {biasStatus}
                {currentDpMitigated >= 0 ? <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"></path></svg> : <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>}
              </p>
            </div>
          </div>
          {loading && (
            <div className="mt-6">
              <div className="flex justify-between text-xs text-slate-400 mb-2 font-mono">
                <span>Aggregating Weights & Calculating Penalties...</span>
                <span>{Math.round(progressPercent)}% COMPLETE</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(6,182,212,0.8)]" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          
          {/* Chart Panel */}
          <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4">Convergence & Fairness Trajectory</h2>
            <div className="h-[500px]">
              <TrainingChart data={visibleRounds.length > 0 ? visibleRounds : selected.round_history} />
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-5">
            
            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard title="Global AUC" value={currentRoundData.avg_auc.toFixed(3)} subtitle="Utility" dark />
              <MetricCard title="DP Score" value={currentRoundData.avg_dp.toFixed(3)} subtitle="Fairness Gap" dark />
              <MetricCard title="EO Score" value={currentRoundData.avg_eo.toFixed(3)} subtitle="Opportunity Gap" dark />
              <MetricCard title="Active Nodes" value={data.active_hospitals} subtitle="Participating" dark />
            </div>

            {/* REAL-TIME BIAS CORRECTION EFFECT PANEL */}
            {mode === "bias" && (
              <div className="bg-blue-900/20 backdrop-blur-sm p-5 rounded-2xl shadow-xl border border-blue-800/50 relative overflow-hidden">
                {loading && <div className="absolute top-0 bottom-0 left-[-100%] w-1/2 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent skew-x-[-20deg] animate-[shimmer_2s_infinite]"></div>}
                
                <div className="flex justify-between items-center mb-4 relative z-10">
                  <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center">
                    <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full mr-3 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse"></span>
                    Live Mitigation Impact
                  </h3>
                  {loading && <span className="text-[10px] font-mono text-cyan-400 bg-cyan-900/40 px-2 py-0.5 rounded border border-cyan-700/50 animate-pulse">PROCESSING</span>}
                </div>
                
                <div className="space-y-5 relative z-10">
                  {/* DP Mitigation Block */}
                  <div>
                    <div className="flex justify-between items-end mb-1.5">
                      <span className="text-xs text-slate-300 font-medium">Demographic Parity Suppressed</span>
                      <div className="text-right flex items-center">
                        {loading && dpRoundDelta > 0.0001 && (
                          <span className="mr-2 text-[10px] font-mono text-emerald-400 bg-emerald-900/40 px-1 py-0.5 rounded animate-fade-in-up border border-emerald-800/50">
                            Δ +{dpRoundDelta.toFixed(4)}
                          </span>
                        )}
                        <span className={`text-lg font-bold leading-none ${currentDpMitigated >= 0 ? "text-cyan-400" : "text-red-400"}`}>
                          {currentDpMitigated >= 0 ? "+" : ""}{currentDpMitigated.toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full relative transition-all duration-700 ease-out" 
                        style={{ width: `${Math.max(5, Math.min(currentDpMitigated * 500, 100))}%` }} 
                      >
                         {loading && <div className="absolute inset-0 bg-white/20 animate-[pulse_1s_infinite]"></div>}
                      </div>
                    </div>
                  </div>

                  {/* EO Mitigation Block */}
                  <div>
                    <div className="flex justify-between items-end mb-1.5">
                      <span className="text-xs text-slate-300 font-medium">Equal Opportunity Suppressed</span>
                      <div className="text-right flex items-center">
                        {loading && eoRoundDelta > 0.0001 && (
                          <span className="mr-2 text-[10px] font-mono text-emerald-400 bg-emerald-900/40 px-1 py-0.5 rounded animate-fade-in-up border border-emerald-800/50">
                            Δ +{eoRoundDelta.toFixed(4)}
                          </span>
                        )}
                         <span className={`text-lg font-bold leading-none ${currentEoMitigated >= 0 ? "text-cyan-400" : "text-red-400"}`}>
                          {currentEoMitigated >= 0 ? "+" : ""}{currentEoMitigated.toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full relative transition-all duration-700 ease-out" 
                        style={{ width: `${Math.max(5, Math.min(currentEoMitigated * 500, 100))}%` }} 
                      >
                         {loading && <div className="absolute inset-0 bg-white/20 animate-[pulse_1s_infinite]"></div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PRIVACY PRESERVATION PANEL */}
            <div className="bg-slate-900/60 backdrop-blur-sm p-5 rounded-2xl shadow-xl border border-slate-800 relative overflow-hidden group">
              <div className="absolute top-[-20px] right-[-20px] p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-32 h-32 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
              </div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center">
                <span className={`w-2.5 h-2.5 rounded-full mr-3 ${privacy.enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></span>
                Cryptographic Privacy Engine
              </h3>
              <div className="space-y-2 relative z-10">
                <div className="flex justify-between items-center bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
                  <span className="text-xs text-slate-400 font-mono">Differential Privacy (DP)</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${privacy.enabled ? 'text-emerald-400 bg-emerald-900/40 border-emerald-800/60' : 'text-red-400 bg-red-900/40 border-red-800/60'}`}>
                    {privacy.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                {privacy.enabled && (
                  <>
                    <div className="flex justify-between items-center bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-xs text-slate-400 font-mono">Noise Scale (σ)</span>
                      <span className="text-xs font-bold text-white bg-slate-800 px-2 py-1 rounded">{privacy.noise_scale}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
                      <span className="text-xs text-slate-400 font-mono">Gradient Clip Value (C)</span>
                      <span className="text-xs font-bold text-white bg-slate-800 px-2 py-1 rounded">{privacy.clip_value}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Hospital Bias Table */}
        {mode === "bias" && !loading && (
          <div className="bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-800">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
               <svg className="w-6 h-6 mr-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
               Dynamic Node Aggregation Penalties
            </h2>
            <HospitalTable hospitals={data.bias_aware.hospital_metrics} />
          </div>
        )}
      </div>
    </div>
  );
}