import { cn } from "@/lib/utils";
import { SortField, SortConfig } from "../types";

interface SortButtonProps {
    section: 'my' | 'discovered';
    field: SortField;
    label: string;
    currentSort: SortConfig;
    onToggleSort: (section: 'my' | 'discovered', field: SortField) => void;
}

export function SortButton({
    section,
    field,
    label,
    currentSort,
    onToggleSort,
}: SortButtonProps) {
    const isActive = currentSort.field === field;
    return (
        <button
            onClick={() => onToggleSort(section, field)}
            className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                isActive
                    ? "bg-gray-700 text-gray-200"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            )}
        >
            {label}
            {isActive && (
                <span className="ml-0.5">{currentSort.dir === 'desc' ? '↓' : '↑'}</span>
            )}
        </button>
    );
}
export default SortButton;
