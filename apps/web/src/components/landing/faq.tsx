"use client";

import { useState } from "react";

interface QA {
  q: string;
  a: string;
}

/** A minimal, accessible accordion for the landing FAQ. */
export function Faq({ items }: { items: readonly QA[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="font-medium text-white">{item.q}</span>
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/15 text-white/70 transition-transform duration-300 ${
                  isOpen ? "rotate-45" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="px-6 pb-6 text-sm leading-relaxed text-white/55">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
