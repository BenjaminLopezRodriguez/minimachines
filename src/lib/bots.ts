import { z } from "zod";

export const botSchema = z.object({
  name: z.string().trim().min(1).max(80),
  instructions: z.string().trim().min(1).max(3000),
  machineId: z.string().min(1).max(64),
  provider: z.enum(["claude", "codex"]),
});
export type BotInput = z.infer<typeof botSchema>;
