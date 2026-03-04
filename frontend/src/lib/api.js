// src/lib/api.js

export async function startFederation() {
  const res = await fetch("http://127.0.0.1:8000/start-federation", {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error("Failed to start federation");
  }

  return res.json();
}