import { DiffuseTypeText } from "~/components/ui/diffuse-type-text";
import { WaitlistForm } from "~/components/waitlist/waitlist-form";

import { VmPreview } from "./vm-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_70%_-5%,rgb(91_124_153/0.14),transparent_55%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_70%_-5%,rgb(129_161_193/0.12),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:linear-gradient(to_right,rgb(20_20_20/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(20_20_20/0.04)_1px,transparent_1px)] dark:opacity-[0.35] dark:[background-image:linear-gradient(to_right,rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black_35%,transparent_92%)]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-16 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-14 lg:pb-20 lg:pt-20">
        <div>
          <DiffuseTypeText
            as="h1"
            startOnMount
            delay={280}
            speed={48}
            wave={4}
            variance={0.3}
            className="font-sans text-[2.75rem] leading-[0.95] font-medium tracking-[-0.04em] text-foreground sm:text-6xl lg:text-[4.25rem]"
          >
            minimachines
          </DiffuseTypeText>

          <DiffuseTypeText
            as="p"
            startOnMount
            delay={900}
            speed={26}
            wave={3}
            className="mt-5 max-w-md text-xl leading-snug tracking-tight text-foreground/90 sm:text-2xl"
          >
            Dedicated VMs for the agents you love.
          </DiffuseTypeText>

          <DiffuseTypeText
            as="p"
            startOnMount
            delay={1800}
            speed={16}
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
