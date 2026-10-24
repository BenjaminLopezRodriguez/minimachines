"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/** Keep desktop tools visible; reveal secondary tools on demand on a phone. */
export function MobileDisclosure({
  title,
  description,
  children,
  open,
  onOpenChange,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const expanded = open ?? internalOpen;
  const id = useId();
  return (
    <div className="mm-progressive" data-open={expanded}>
      <button
        className="mm-progressive-trigger"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => (onOpenChange ?? setInternalOpen)(!expanded)}
      >
        <span>
          <strong>{title}</strong>
          {description && <small>{description}</small>}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      <div id={id} className="mm-progressive-content">
        {children}
      </div>
    </div>
  );
}
