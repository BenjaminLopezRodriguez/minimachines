"use client";

/** Empty fleet preview — no fake VMs. */
export function VmPreview() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-[#141414] text-[#ededed] shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_18px_50px_-28px_rgb(0_0_0/0.55)] dark:bg-card">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-3.5 py-2.5">
        <span className="text-[12px] text-white/45">Runtime</span>
        <span className="text-[12px] text-white/35">Idle</span>
      </div>

      <div className="px-3.5 py-14 text-center">
        <p className="text-[13px] font-medium text-white/85">No machines yet</p>
        <p className="mx-auto mt-1.5 max-w-[16rem] text-[12px] text-white/40">
          Sign in to spin up a dedicated VM for your next agent session.
        </p>
      </div>

      <div className="border-t border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
        <p className="text-[12px] text-white/40">
          <span className="text-signal">→</span> isolated rootfs · persistent
          workspace
        </p>
      </div>
    </div>
  );
}
