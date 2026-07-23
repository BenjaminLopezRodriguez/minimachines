"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { useWaitlistForm } from "~/hooks/use-waitlist-form";

export function WaitlistForm() {
  const { form, onSubmit, status, isSubmitting, reset } = useWaitlistForm();

  return (
    <div className="w-full max-w-md">
      <AnimatePresence mode="wait" initial={false}>
        {status === "success" ? (
          <motion.div
            key="success"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border border-signal/25 bg-signal/8 px-4 py-4 rounded-lg"
          >
            <p className="text-sm font-medium text-foreground">
              You&apos;re on the list.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll email you when early access opens.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 h-8 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              onClick={reset}
            >
              Add another email
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            <Form {...form}>
              <form
                onSubmit={onSubmit}
                noValidate
                className="flex flex-col gap-2 sm:flex-row sm:items-start"
              >
                {/* Honeypot: off-screen, skipped by AT and tab order. Bots fill it, humans don't. */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
                  {...form.register("website")}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-1">
                      <FormLabel className="sr-only">Email address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@company.com"
                          type="email"
                          autoComplete="email"
                          disabled={isSubmitting}
                          className="h-9 rounded-md border-border bg-card text-[13px] shadow-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 shrink-0 rounded-md px-3.5 text-[13px] font-medium"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Joining
                    </>
                  ) : (
                    "Get early access"
                  )}
                </Button>
              </form>
            </Form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
