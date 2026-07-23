import { z } from "zod";

export const waitlistFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  // Honeypot: hidden from humans, tempting to bots. Real users leave it empty.
  website: z.string().optional(),
});

export type WaitlistFormValues = z.infer<typeof waitlistFormSchema>;
