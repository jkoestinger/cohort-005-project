// PROTOTYPE: floating variant switcher for throwaway UI prototypes.
// ←/→ (or the arrows) cycle `?variant=`; never rendered in production.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  info,
}: {
  variants: { key: string; name: string }[];
  current: string;
  info?: React.ReactNode;
}) {
  const [, setSearchParams] = useSearchParams();
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    try {
      localStorage.setItem("prototype-variant", next.key);
    } catch {}
    setSearchParams(
      (p) => {
        p.set("variant", next.key);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-fuchsia-500">
      <div className="flex items-center gap-2">
        <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/15" title="Previous (←)">
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-mono">
          {variants[index].key} <span className="text-white/70">({variants[index].name})</span>
        </span>
        <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/15" title="Next (→)">
          <ChevronRight className="size-4" />
        </button>
        {info && <span className="border-l border-white/20 pl-3 pr-2 font-mono text-xs text-white/80">{info}</span>}
      </div>
    </div>
  );
}
