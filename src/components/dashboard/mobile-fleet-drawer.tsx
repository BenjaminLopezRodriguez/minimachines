"use client";

import { LogOut, Menu, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";

export function MobileFleetDrawer({
  display,
  email,
  signOutAction,
}: {
  display: string;
  email?: string | null;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="fixed bottom-5 right-5 z-40 inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-lg shadow-black/40 transition-opacity hover:opacity-90 md:hidden"
        >
          <Menu className="size-3.5" aria-hidden />
          menu
        </button>
      </DrawerTrigger>

      <DrawerContent className="mm-app mm-cursor-panel border-border">
        <DrawerHeader className="px-4 pb-2 pt-1 text-left">
          <DrawerTitle className="text-sm font-medium tracking-tight">
            Menu
          </DrawerTitle>
          <DrawerDescription className="truncate text-[12px]">
            {email ?? display}
          </DrawerDescription>
        </DrawerHeader>

        <nav className="flex flex-col gap-1 px-3 pb-2" aria-label="Actions">
          <DrawerClose asChild>
            <Button
              asChild
              id="new"
              variant="ghost"
              className="h-10 w-full justify-start gap-2.5 rounded-md px-3 text-[13px] font-medium text-foreground hover:bg-white/[0.04]"
            >
              <Link href="/dashboard#new">
                <Plus className="size-4 opacity-70" aria-hidden />
                New machine
              </Link>
            </Button>
          </DrawerClose>

          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <LogOut className="size-4 opacity-70" aria-hidden />
              Sign out
            </button>
          </form>
        </nav>

        <DrawerFooter className="pt-1">
          <DrawerClose asChild>
            <Button
              variant="outline"
              className="h-9 w-full rounded-md border-border bg-transparent text-[13px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            >
              Close
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
