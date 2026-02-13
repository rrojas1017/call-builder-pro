import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

interface ParsedValue {
  prefix: string;
  number: number;
  suffix: string;
  decimals: number;
  useCommas: boolean;
}

function parseValue(value: string): ParsedValue {
  const match = value.match(/^([<>]?)([0-9][0-9,]*\.?\d*)\s*(.*)$/);
  if (!match) return { prefix: "", number: 0, suffix: value, decimals: 0, useCommas: false };
  const [, prefix, numStr, suffix] = match;
  const useCommas = numStr.includes(",");
  const clean = numStr.replace(/,/g, "");
  const decimals = clean.includes(".") ? clean.split(".")[1].length : 0;
  return { prefix, number: parseFloat(clean), suffix, decimals, useCommas };
}

function formatNumber(n: number, decimals: number, useCommas: boolean): string {
  const fixed = n.toFixed(decimals);
  if (!useCommas) return fixed;
  const [int, dec] = fixed.split(".");
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec ? `${withCommas}.${dec}` : withCommas;
}

export function useCountUp(value: string, duration = 1.5, delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const { prefix, number, suffix, decimals, useCommas } = parseValue(value);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now() + delay * 1000;
    const dur = duration * 1000;
    let raf: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(elapsed / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = eased * number;
      setDisplay(`${prefix}${formatNumber(current, decimals, useCommas)}${suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, number, prefix, suffix, decimals, useCommas, duration, delay]);

  return { ref, display };
}
