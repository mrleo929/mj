"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  JIANG_COUNT_MAX,
  JIANG_COUNT_MIN,
} from "@/lib/games/jiang-count";

const ITEM_H = 48;
const SIDE_ROWS = 2;
const PAD = SIDE_ROWS * ITEM_H;
const VIEW_H = (SIDE_ROWS * 2 + 1) * ITEM_H;

function buildItems(): (number | null)[] {
  return [
    null,
    ...Array.from(
      { length: JIANG_COUNT_MAX - JIANG_COUNT_MIN + 1 },
      (_, i) => JIANG_COUNT_MIN + i,
    ),
  ];
}

function labelFor(v: number | null) {
  if (v === null) return "不限";
  return String(v);
}

type WheelProps = {
  initialValue: number | null;
  onChange: (v: number | null) => void;
};

function JiangCountWheel({ initialValue, onChange }: WheelProps) {
  const items = useMemo(() => buildItems(), []);
  const initialIndex = Math.max(
    0,
    items.findIndex((x) => x === initialValue),
  );

  const [index, setIndex] = useState(initialIndex);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const snapToNearest = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const list = itemsRef.current;
    const i = Math.round(el.scrollTop / ITEM_H);
    const c = Math.max(0, Math.min(list.length - 1, i));
    const target = c * ITEM_H;
    if (Math.abs(el.scrollTop - target) > 0.5) {
      el.scrollTo({ top: target, behavior: "smooth" });
    }
    setIndex(c);
    onChange(list[c]);
  }, [onChange]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = initialIndex * ITEM_H;
    setIndex(initialIndex);
    onChange(itemsRef.current[initialIndex]);
  }, [initialIndex, onChange]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const list = itemsRef.current;
      const i = Math.round(el.scrollTop / ITEM_H);
      const c = Math.max(0, Math.min(list.length - 1, i));
      setIndex(c);
      onChange(list[c]);

      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        snapTimerRef.current = null;
        snapToNearest();
      }, 140);
    };

    const onScrollEnd = () => {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
      snapToNearest();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd);
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
    };
  }, [onChange, snapToNearest]);

  const list = itemsRef.current;

  return (
    <div
      className="relative w-full touch-pan-y"
      style={{ height: VIEW_H }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 z-10 border-y border-emerald-400/45 bg-emerald-500/[0.06] dark:bg-emerald-400/10"
        style={{ top: PAD, height: ITEM_H }}
      />
      <div
        ref={scrollerRef}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ paddingTop: PAD, paddingBottom: PAD }}>
          {list.map((n, i) => (
            <div
              key={`${n ?? "x"}-${i}`}
              className="flex snap-center items-center justify-center text-lg tabular-nums"
              style={{ height: ITEM_H }}
            >
              <span
                className={
                  i === index
                    ? "font-semibold text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }
              >
                {n === null ? "不限" : n}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type Props = {
  name: string;
  defaultValue?: number | null;
};

export function JiangCountPicker({ name, defaultValue }: Props) {
  const [value, setValue] = useState<number | null>(() => defaultValue ?? null);
  const [open, setOpen] = useState(false);
  const [tempValue, setTempValue] = useState<number | null>(null);
  const [wheelKey, setWheelKey] = useState(0);

  useEffect(() => {
    setValue(defaultValue ?? null);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTempValue(value);
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, value]);

  const openModal = () => {
    setTempValue(value);
    setWheelKey((k) => k + 1);
    setOpen(true);
  };

  const commit = () => {
    setValue(tempValue);
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      <input
        type="hidden"
        name={name}
        value={value === null ? "" : String(value)}
      />
      <button
        type="button"
        onClick={openModal}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-zinc-300 bg-white px-4 py-3 text-left text-base shadow-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:active:bg-zinc-900"
      >
        <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
          {labelFor(value)}
        </span>
        <span className="text-zinc-400 dark:text-zinc-500" aria-hidden>
          ▼
        </span>
      </button>
      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        點一下欄位，再上下滑選數字
      </p>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="關閉"
            onClick={commit}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="jiang-count-sheet-title"
            className="relative z-10 max-h-[min(85vh,520px)] rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <h2
                id="jiang-count-sheet-title"
                className="text-base font-semibold text-zinc-900 dark:text-zinc-50"
              >
                選擇將數
              </h2>
              <button
                type="button"
                onClick={commit}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white active:bg-emerald-700"
              >
                完成
              </button>
            </div>
            <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <JiangCountWheel
                key={wheelKey}
                initialValue={value}
                onChange={setTempValue}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
