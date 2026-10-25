"use client";
import { useEffect, useState } from "react";
export function AnalyticsPreferences() {
  const [disabled, setDisabled] = useState(true);
  useEffect(() => {
    try {
      setDisabled(localStorage.getItem("mm-analytics-disabled") === "true");
    } catch {}
  }, []);
  return (
    <div>
      <p>
        Analytics on this browser: <strong>{disabled ? "Off" : "On"}</strong>.
        We also respect Do Not Track and Global Privacy Control.
      </p>
      <button
        className="mm-bot-button mm-bot-button-secondary"
        onClick={() => {
          const next = !disabled;
          try {
            localStorage.setItem("mm-analytics-disabled", String(next));
            setDisabled(next);
          } catch {
            setDisabled(true);
          }
        }}
      >
        {disabled ? "Allow anonymous analytics" : "Turn off analytics"}
      </button>
    </div>
  );
}
