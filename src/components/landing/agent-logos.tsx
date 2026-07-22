import Image from "next/image";

import { cn } from "~/lib/utils";

const agents = [
  { name: "OpenAI", src: "/logos/openai.svg" },
  { name: "Claude", src: "/logos/claude.svg" },
  { name: "Grok", src: "/logos/xai.svg" },
  { name: "Gemini", src: "/logos/gemini.svg" },
  { name: "Cursor", src: "/logos/cursor.svg" },
] as const;

export function AgentLogos({ className }: { className?: string }) {
  return (
    <ul
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:justify-start sm:gap-x-10",
        className,
      )}
    >
      {agents.map((agent) => (
        <li
          key={agent.name}
          className="text-muted-foreground flex items-center gap-2.5 text-sm"
        >
          <Image
            src={agent.src}
            alt=""
            width={18}
            height={18}
            className="opacity-70 invert dark:invert-0"
            unoptimized
          />
          <span className="font-medium tracking-tight text-foreground/80">
            {agent.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
