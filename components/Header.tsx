import Link from "next/link";
import Image from "next/image";
import NavItems from "@/components/NavItems";
import UserDropdown from "@/components/UserDropdown";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import { getWatchlistSymbolsByEmail } from "@/lib/actions/watchlist.actions";

const Header = async ({ user }: { user: User}) => {
    const initialStocks = await searchStocks();

    // Mark stocks that are already in the user's watchlist so the star is yellow
    const symbols = await getWatchlistSymbolsByEmail(user.email);
    const set = new Set((symbols || []).map((s) => s.toUpperCase()));
    const initialStocksWithStatus: StockWithWatchlistStatus[] = (initialStocks || []).map((s) => ({
        ...s,
        isInWatchlist: set.has(s.symbol?.toUpperCase?.() || s.symbol),
    }))

    return (
        <header className="sticky top-0 header">
            <div className="container header-wrapper">
                <Link href="/">
                    <Image src="/assets/icons/logo.svg" alt="Signalist logo" width={140} height={32} className="h-8 w-auto cursor-pointer"/>
                </Link>
                <nav className="hidden sm:block">
                    <NavItems initialStocks={initialStocksWithStatus}/>
                </nav>

                <UserDropdown user={user} initialStocks={initialStocksWithStatus}/>
            </div>
        </header>
    )
}
export default Header
