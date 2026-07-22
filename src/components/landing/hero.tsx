import { DiffuseTypeText } from "~/components/ui/diffuse-type-text";
import { WaitlistForm } from "~/components/waitlist/waitlist-form";

import { VmPreview } from "./vm-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-14">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_70%_-10%,oklch(0.78_0.06_155/0.45),transparent_60%)] dark:bg-[radial-gradient(ellipse_90%_55%_at_70%_-10%,oklch(0.32_0.025_155/0.4),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.4] [background-image:linear-gradient(to_right,oklch(0_0_0/0.05)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0_0_0/0.05)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,oklch(1_0_0/0.035)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.035)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black_40%,transparent_95%)]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-16 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pb-20 lg:pt-20">
        <div>
          <DiffuseTypeText
            as="h1"
            startOnMount
            delay={120}
            speed={42}
            wave={4}
            variance={0.25}
            className="font-sans text-[2.75rem] leading-[0.95] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-[4.5rem]"
          >
            minimachines
          </DiffuseTypeText>

          <DiffuseTypeText
            as="p"
            startOnMount
            delay={700}
            speed={22}
            wave={3}
            className="mt-5 max-w-md text-xl leading-snug tracking-tight text-foreground/90 sm:text-2xl"
          >
            Dedicated VMs for the agents you love.
          </DiffuseTypeText>

          <DiffuseTypeText
            as="p"
            startOnMount
            delay={1600}
            speed={14}
            wave={4}
            variance={0.4}
            className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground"
          >
            Run the heavy compute of agentic software development in the cloud —
            Claude, Codex, Grok, Cursor, and more, each on their own machine.
          </DiffuseTypeText>

          <div
            id="waitlist"
            className="mm-fade-up mm-delay-3 mt-8 scroll-mt-28"
          >
            <WaitlistForm />
          </div>
        </div>

        <div className="mm-fade-up mm-delay-2 min-w-0 lg:justify-self-stretch">
          <VmPreview />
        </div>
      </div>
    </section>
  );
}
