"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Props ─────────────────────────────────────────────────────────────────────
interface TAGlassDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    width?: string;
    disableBodyScroll?: boolean;
}

// ─── Bileşen ───────────────────────────────────────────────────────────────────
export default function TAGlassDialog({
    open,
    onOpenChange,
    title,
    icon,
    children,
    footer,
    className,
    width = "max-w-2xl",
    disableBodyScroll,
}: TAGlassDialogProps) {
    // ESC tuşu ile kapatma
    React.useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChange(false);
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [open, onOpenChange]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Blurred overlay */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => onOpenChange(false)}
            />

            {/* Glass dialog */}
            <div
                className={cn(
                    "relative z-10 w-full",
                    width,
                    "mx-4",
                    // Dark glassmorphism
                    "bg-[rgba(20,20,20,0.92)]",
                    "backdrop-blur-xl",
                    "border border-white/10",
                    "shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
                    "rounded-xl",
                    // Animation
                    "animate-in fade-in zoom-in-95 duration-200",
                    className
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div className="flex items-center gap-2.5">
                        {icon && (
                            <span className="text-lg opacity-70">{icon}</span>
                        )}
                        <h2 className="text-base font-semibold text-gray-100 tracking-tight">
                            {title}
                        </h2>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg
                            text-gray-400 hover:text-gray-200 hover:bg-white/10
                            transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className={cn(
                    "px-5 py-4",
                    !disableBodyScroll && "max-h-[65vh] overflow-y-auto premium-scrollbar",
                    disableBodyScroll && "max-h-[75vh] md:max-h-[80vh] overflow-y-auto premium-scrollbar"
                )}>
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="px-5 py-3 border-t border-white/10 bg-white/5 rounded-b-xl">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
