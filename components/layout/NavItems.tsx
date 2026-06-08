'use client'

import { memo } from 'react';
import {NAV_ITEMS} from "@/lib/constants";
import Link from "next/link";
import {usePathname} from "next/navigation";
import dynamic from "next/dynamic";

const SearchCommand = dynamic(() => import("@/components/layout/SearchCommand"), {
  ssr: false,
  loading: () => <span className="text-gray-400 hover:text-yellow-500 transition-colors cursor-pointer">Search</span>,
});

const NavItems = memo(function NavItems({initialStocks}: { initialStocks: StockWithWatchlistStatus[]}) {
    const pathname = usePathname()

    const isActive = (path: string) => {
        if (path === '/') return pathname === '/';

        return pathname.startsWith(path);
    }
    return (
        <nav aria-label="Main navigation">
            <ul className="flex flex-col sm:flex-row p-2 gap-3 sm:gap-10 font-medium" role="list">
                {NAV_ITEMS.map(({href, label}) => {
                    if (href === '/search') return (
                        <li key="search-trigger" role="listitem">
                            <SearchCommand
                                renderAs="text"
                                label="Search"
                                initialStocks={initialStocks}
                            />
                        </li>
                    )

                    let effectiveHref = href;
                    if (href === '/ta') {
                        const match = pathname.match(/\/stocks\/([^/]+)/i);
                        if (match?.[1]) {
                            const sym = decodeURIComponent(match[1]).toUpperCase();
                            effectiveHref = `/ta?symbol=${encodeURIComponent(sym)}`;
                        }
                    }

                    const active = isActive(href);
                    return <li key={href} role="listitem">
                        <Link
                            href={effectiveHref}
                            className={`hover:text-yellow-500 transition-colors ${active ? 'text-gray-100' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            aria-label={`${label} page`}
                        >
                            {label}
                        </Link>
                    </li>
                })}
            </ul>
        </nav>
    )
});
export default NavItems
