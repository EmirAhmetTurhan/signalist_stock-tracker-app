'use client'

import {NAV_ITEMS} from "@/lib/constants";
import Link from "next/link";
import {usePathname} from "next/navigation";
import SearchCommand from "@/components/SearchCommand";

const NavItems = ({initialStocks}: { initialStocks: StockWithWatchlistStatus[]}) => {
    const pathname = usePathname()

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/';

        return pathname.startsWith(path);
    }
    return (
        <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium">
            {NAV_ITEMS.map(({href, label}) => {
                if (href === '/search') return (
                    <li key="search-trigger">
                        <SearchCommand
                            renderAs="text"
                            label="Search"
                            initialStocks={initialStocks}
                        />
                    </li>
                )

                // If user is on a stock details page, pass current symbol to T/A tab
                let effectiveHref = href;
                if (href === '/ta') {
                    const match = pathname.match(/\/stocks\/([^/]+)/i);
                    if (match?.[1]) {
                        const sym = decodeURIComponent(match[1]).toUpperCase();
                        effectiveHref = `/ta?symbol=${encodeURIComponent(sym)}`;
                    }
                }

                return <li key={href}>
                    <Link href={effectiveHref} className={`hover:text-yellow-500 transition-colors ${
                        isActive(href) ? 'text-gray-100' : ''
                    }`}>
                        {label}
                    </Link>
                </li>
            })}
        </ul>
    )
}
export default NavItems
