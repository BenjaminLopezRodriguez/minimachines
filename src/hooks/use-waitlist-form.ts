"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { api } from "~/trpc/react";
import { waitlistFormSchema, type WaitlistFormValues } from "~/types/waitlist";

export function useWaitlistForm() {
  const [status, setStatus] = useState<"idle" | "success">("idle");

  const form = useForm<WaitlistFormValues>({
    resolver: zodResolver(waitlistFormSchema),
    defaultValues: { email: "", website: "" },
  });

  const joinWaitlist = api.waitlist.join.useMutation({
    // Optimistic submission: show the success state immediately, then roll
    // back and surface the error inline if the server rejects the request.
    onMutate: () => {
      setStatus("success");
    },
    onSuccess: () => {
      form.reset();
    },
    onError: (error) => {
      setStatus("idle");
      form.setError("email", { message: error.message });
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    joinWaitlist.mutate(values);
  });

  return {
    form,
    onSubmit,
    status,
    isSubmitting: joinWaitlist.isPending,
    reset: () => {
      setStatus("idle");
      joinWaitlist.reset();
    },
  };
}
