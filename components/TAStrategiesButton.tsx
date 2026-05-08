"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import CustomStrategyModal, {
    DeleteConfirmDialog,
    CustomStrategy,
    loadCustomStrategies,
    saveCustomStrategies,
    AVAILABLE_INDICATORS,
} from "@/components/CustomStrategyModal";

// ─── Sabit stratejiler ────────────────────────────────────────────────────────
const BUILT_IN_STRATEGIES = [
    {
        key: "rsi_cci_wt",
        label: "RSI + CCI + WaveTrend",
        description: "3 indikatör aynı yönde sinyal verdiğinde işlem yap",
        isBuiltIn: true,
    },
] as const;

// ─── Bileşen ──────────────────────────────────────────────────────────────────
const TAStrategiesButton = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const strategyParam = searchParams.get("strategy") || "";

    const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<CustomStrategy | null>(null);

    // LocalStorage'dan yükle
    useEffect(() => {
        setCustomStrategies(loadCustomStrategies());
    }, []);

    const toggle = (key: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (strategyParam === key) {
            params.delete("strategy");
        } else {
            params.set("strategy", key);
        }
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const handleCreated = (strategy: CustomStrategy) => {
        const updated = loadCustomStrategies();
        setCustomStrategies(updated);
        // Yeni oluşturulan stratejiyi otomatik seç
        toggle(strategy.key);
    };

    const handleDelete = (strategy: CustomStrategy, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setDeleteTarget(strategy);
    };

    const confirmDelete = () => {
        if (!deleteTarget) return;
        const updated = customStrategies.filter(s => s.key !== deleteTarget.key);
        saveCustomStrategies(updated);
        setCustomStrategies(updated);
        // Eğer silinen strateji aktifse, seçimi kaldır
        if (strategyParam === deleteTarget.key) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("strategy");
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
        setDeleteTarget(null);
    };

    const totalStrategies = BUILT_IN_STRATEGIES.length + customStrategies.length;

    return (
        <>
            {/* Strategies dropdown + "+" butonu yan yana */}
            <div className="flex items-center gap-1.5">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="secondary"
                            className={`search-btn ${strategyParam ? "border border-violet-500/60 text-violet-300" : ""}`}
                        >
                            Strategies
                            {strategyParam && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />}
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent className="text-gray-100 w-72">
                        {/* ── Hazır Stratejiler ── */}
                        <DropdownMenuLabel className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
                            Hazır Stratejiler
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-gray-800" />

                        {BUILT_IN_STRATEGIES.map((s) => (
                            <DropdownMenuCheckboxItem
                                key={s.key}
                                checked={strategyParam === s.key}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={() => toggle(s.key)}
                                className="flex flex-col items-start gap-0.5 py-2.5"
                            >
                                <span className="font-semibold text-gray-100">{s.label}</span>
                                <span className="text-[11px] text-gray-400 font-normal leading-tight">{s.description}</span>
                            </DropdownMenuCheckboxItem>
                        ))}

                        {/* ── Özel Stratejiler ── */}
                        {customStrategies.length > 0 && (
                            <>
                                <DropdownMenuSeparator className="bg-gray-800 mt-1" />
                                <DropdownMenuLabel className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                    Özel Stratejiler
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-gray-800" />

                                {customStrategies.map((s) => {
                                    const indLabels = s.indicators
                                        .map(key => AVAILABLE_INDICATORS.find(i => i.key === key)?.label ?? key)
                                        .join(" + ");

                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={s.key}
                                            checked={strategyParam === s.key}
                                            onSelect={(e) => e.preventDefault()}
                                            onCheckedChange={() => toggle(s.key)}
                                            className="flex items-start gap-0 py-2 pr-2 group"
                                        >
                                            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                                <span className="font-semibold text-gray-100 text-sm truncate">{s.name}</span>
                                                <span className="text-[10px] text-gray-500 font-normal leading-tight truncate">{indLabels}</span>
                                            </div>
                                            {/* Sil butonu */}
                                            <button
                                                onClick={(e) => handleDelete(s, e)}
                                                className="ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center
                                                    rounded-md opacity-0 group-hover:opacity-100
                                                    text-gray-600 hover:text-red-400 hover:bg-red-950/30
                                                    transition-all"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </DropdownMenuCheckboxItem>
                                    );
                                })}
                            </>
                        )}

                        {/* ── Yeni strateji kısayolu ── */}
                        <DropdownMenuSeparator className="bg-gray-800 mt-1" />
                        <button
                            onClick={() => setModalOpen(true)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-violet-400
                                hover:bg-violet-950/30 hover:text-violet-300
                                transition-colors rounded-b-md"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="font-medium">Yeni strateji oluştur...</span>
                        </button>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Hızlı "+" butonu */}
                <button
                    onClick={() => setModalOpen(true)}
                    title="Yeni özel strateji oluştur"
                    className="w-8 h-8 flex items-center justify-center rounded-lg
                        bg-violet-600/15 border border-violet-600/30 text-violet-400
                        hover:bg-violet-600/30 hover:border-violet-500/60 hover:text-violet-300
                        transition-all duration-150"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Oluştur Modalı */}
            <CustomStrategyModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onCreated={handleCreated}
            />

            {/* Sil Onay Dialogu */}
            {deleteTarget && (
                <DeleteConfirmDialog
                    strategyName={deleteTarget.name}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </>
    );
};

export default TAStrategiesButton;
