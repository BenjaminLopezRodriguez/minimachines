"use client";

import { useEffect, useState } from "react";

import { api } from "~/trpc/react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const wrap: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  padding: 24,
  fontFamily: "system-ui, sans-serif",
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PagerEnroll() {
  const subscribe = api.push.subscribe.useMutation();
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [supported, setSupported] = useState(true);
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (ok) void navigator.serviceWorker.register("/sw.js");
    const isIos = /iph|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isIos && !standalone) setNeedsInstall(true);
  }, []);

  const enable = async () => {
    setStatus("working");
    setMsg("");
    try {
      if (!VAPID) throw new Error("Push is not configured on this server.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifications were blocked.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource,
      });
      const j = sub.toJSON();
      if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) {
        throw new Error("Subscription was incomplete.");
      }
      await subscribe.mutateAsync({
        endpoint: j.endpoint,
        keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
        ua: navigator.userAgent.slice(0, 256),
      });
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "Failed to enable.");
    }
  };

  return (
    <main style={wrap}>
      <h2 style={{ marginTop: 0 }}>Agent Pager</h2>
      <p style={{ color: "#666" }}>
        Get paged on your lock screen when an agent needs you.
      </p>

      {!supported ? (
        <p>This browser doesn&apos;t support push notifications.</p>
      ) : needsInstall ? (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: "#f4f4f5",
            fontSize: 15,
            lineHeight: 1.5,
          }}
        >
          <strong>One step first (iPhone):</strong> tap the <em>Share</em> icon →{" "}
          <em>Add to Home Screen</em>, open minimachines from that icon, then come
          back here and enable.
        </div>
      ) : status === "done" ? (
        <p style={{ fontSize: 16 }}>Notifications on ✓ You&apos;ll get paged here.</p>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={status === "working"}
          style={{
            width: "100%",
            padding: 14,
            fontSize: 16,
            fontWeight: 600,
            color: "#fff",
            background: "#111",
            border: 0,
            borderRadius: 8,
          }}
        >
          {status === "working" ? "Enabling…" : "Enable notifications"}
        </button>
      )}

      {status === "error" ? (
        <p style={{ color: "#c00", marginTop: 12 }} role="alert">
          {msg}
        </p>
      ) : null}
    </main>
  );
}
