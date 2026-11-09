// PROTOTYPE: throwaway variant switcher for UI prototypes. Never ship.
import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );
  const step = (delta: number) =>
    onChange(variants[(index + delta + variants.length) % variants.length].key);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-1 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <button
        onClick={() => step(-1)}
        className="rounded-full p-1 hover:bg-white/15"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center font-medium">
        {variants[index].key} ({variants[index].name})
      </span>
      <button
        onClick={() => step(1)}
        className="rounded-full p-1 hover:bg-white/15"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
