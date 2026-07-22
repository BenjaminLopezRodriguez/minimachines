import { z } from "zod";

export const waitlistFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
});

export type WaitlistFormValues = z.infer<typeof waitlistFormSchema>;
