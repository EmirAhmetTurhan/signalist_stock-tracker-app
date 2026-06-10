"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";

// SPRINT 3: 1wk kaldırıldı — sadece 4h ve 1d destekleniyor.
const INTERVAL_OPTIONS = [
    { value: "1d", label: "1 Day" },
    { value: "4h", label: "4 Hours" },
] as const;

export default function TAIntervalButton() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const interval = searchParams.get("interval") || "1d";
    const [currentLabel, setCurrentLabel] = useState("1 Day");

    useEffect(() => {
        const opt = INTERVAL_OPTIONS.find((o) => o.value === interval);
        setCurrentLabel(opt?.label || "1 Day");
    }, [interval]);

    const selectInterval = (value: string) => {
        if (value === interval) return; // no-op if same

        const params = new URLSearchParams(searchParams.toString());
        if (value === "1d") {
            params.delete("interval");
        } else {
            params.set("interval", value);
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="secondary" className="search-btn min-w-[100px]">
                    {currentLabel}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="text-gray-200 min-w-[120px] bg-gray-900 border-gray-700">
                {INTERVAL_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                        key={opt.value}
                        onClick={() => selectInterval(opt.value)}
                        className={interval === opt.value ? "bg-yellow-500/10 font-semibold text-yellow-400" : ""}
                    >
                        {opt.label}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
