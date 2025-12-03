"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

const TAResolutionToggle = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tf = (searchParams.get("tf") || "1d").toLowerCase();
  const symbol = searchParams.get("symbol") || "";
  const ind = searchParams.get("ind") || "";

  const is1D = tf !== "1h"; // default to 1d
  const is1H = tf === "1h";

  const buildUrl = useMemo(() => {
    return (nextTf: string) => {
      const params = new URLSearchParams();
      if (symbol) params.set("symbol", symbol);
      if (ind) params.set("ind", ind);
      if (nextTf && nextTf !== "1d") params.set("tf", nextTf); // omit default
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    };
  }, [pathname, symbol, ind]);

  const setTf = (nextTf: "1d" | "1h") => {
    const url = buildUrl(nextTf);
    router.replace(url);
  };

  return (
    <div className="inline-flex rounded-md overflow-hidden border border-gray-700">
      <Button
        variant={is1D ? "default" : "secondary"}
        className={`px-3 py-1 h-8 ${is1D ? "bg-gray-100 text-black" : "bg-transparent text-gray-200"}`}
        onClick={() => setTf("1d")}
      >
        1D
      </Button>
      <Button
        variant={is1H ? "default" : "secondary"}
        className={`px-3 py-1 h-8 ${is1H ? "bg-gray-100 text-black" : "bg-transparent text-gray-200"}`}
        onClick={() => setTf("1h")}
      >
        1H
      </Button>
    </div>
  );
};

export default TAResolutionToggle;
