import React from "react";
import { Trash2 } from "lucide-react";

interface DeleteConfirmProps {
    strategyName: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export default function DeleteConfirmDialog({ strategyName, onConfirm, onCancel }: DeleteConfirmProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative z-10 w-80 mx-4 rounded-xl border border-red-900/50 bg-[#13101f] p-5 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-red-900/20 border border-red-800/40 flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-red-400" />
                    </div>
                    <div>
                        <div className="text-sm font-semibold text-red-200">Delete Strategy</div>
                        <div className="text-[11px] text-gray-500">This action cannot be undone</div>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mb-4">
                    Are you sure you want to delete <span className="text-gray-200 font-medium">"{strategyName}"</span>?
                </p>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors border border-white/8">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold text-red-200 bg-red-900/30 hover:bg-red-900/50 border border-red-800/40 transition-colors">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
