"use client";

import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function TAIntervalButton() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const interval = searchParams.get("interval") || "1d";

    const toggleInterval = () => {
        const params = new URLSearchParams(searchParams.toString());
        if (interval === "1d") {
            params.set("interval", "4h");
        } else {
            params.delete("interval");
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return (
        <Button variant="secondary" onClick={toggleInterval} className="search-btn">
            {interval === "1d" ? "1 Day" : "4 Hours"}
        </Button>
    );
}
