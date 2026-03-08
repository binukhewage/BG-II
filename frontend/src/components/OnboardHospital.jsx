"use client";

import { useState } from "react";
import { onboardHospital, resetFederation } from "../lib/api";

export default function OnboardHospital({ refreshDashboard }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  setUploading(true);
  setMessage(null);

  try {
    const result = await onboardHospital(file);

    if (result.status === "approved") {

      setMessage(`Hospital ${result.hospital.id} successfully onboarded`);

      // 🔥 Update dashboard with new federation state
      refreshDashboard(result.federation_update);

    } else {

      setMessage(`Rejected: ${result.reason}`);

    }

  } catch (err) {
    setMessage("Onboarding failed");
  }

  setUploading(false);
};

  const handleReset = async () => {
    await resetFederation();
    setMessage("Federation reset to 5 core hospitals");
    refreshDashboard();
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-sm p-5 rounded-2xl border border-slate-800 shadow-xl">
      <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider mb-4">
        Hospital Onboarding
      </h3>

      <div className="flex flex-wrap gap-3">
        <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm border border-blue-400">
          {uploading ? "Uploading..." : "Upload Hospital CSV"}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleUpload}
          />
        </label>

        <button
          onClick={handleReset}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm border border-red-400"
        >
          Reset Federation
        </button>
      </div>

      {message && (
        <div className="mt-4 p-3 bg-slate-950 border border-cyan-600 rounded-lg text-cyan-300 text-sm">
          {message}
        </div>
      )}
    </div>
  );
}