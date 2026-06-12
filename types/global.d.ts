declare global {
    type SignInFormData = {
        email: string;
        password: string;
    };

    type SignUpFormData = {
        fullName: string;
        email: string;
        password: string;
        country: string;
        investmentGoals: string;
        riskTolerance: string;
        preferredIndustry: string;
    };

    type CountrySelectProps = {
        name: string;
        label: string;
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FormInputProps = {
        name: string;
        label: string;
        placeholder: string;
        type?: string;
        register: UseFormRegister;
        error?: FieldError;
        validation?: RegisterOptions;
        disabled?: boolean;
        value?: string;
    };

    type Option = {
        value: string;
        label: string;
    };

    type SelectFieldProps = {
        name: string;
        label: string;
        placeholder: string;
        options: readonly Option[];
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FooterLinkProps = {
        text: string;
        linkText: string;
        href: string;
    };

    type SearchCommandProps = {
        renderAs?: 'button' | 'text';
        label?: string;
        initialStocks: StockWithWatchlistStatus[];
    };

    type WelcomeEmailData = {
        email: string;
        name: string;
        intro: string;
    };

    type User = {
        id: string;
        name: string;
        email: string;
        image?: string | null;
    };

    type Stock = {
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    };

    type StockWithWatchlistStatus = Stock & {
        isInWatchlist: boolean;
    };

    type FinnhubSearchResult = {
        symbol: string;
        description: string;
        displaySymbol?: string;
        type: string;
    };

    type FinnhubSearchResponse = {
        count: number;
        result: FinnhubSearchResult[];
    };

    type StockDetailsPageProps = {
        params: Promise<{
            symbol: string;
        }>;
    };

    type WatchlistButtonProps = {
        symbol: string;
        company: string;
        isInWatchlist: boolean;
        showTrashIcon?: boolean;
        type?: 'button' | 'icon';
        onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
        className?: string;
        strokeWidth?: number;
    };

    type QuoteData = {
        c?: number;
        dp?: number;
    };

    type ProfileData = {
        name?: string;
        marketCapitalization?: number;
    };

    type FinancialsData = {
        metric?: { [key: string]: number };
    };

    type SelectedStock = {
        symbol: string;
        company: string;
        currentPrice?: number;
    };

    type WatchlistTableProps = {
        watchlist: StockWithData[];
    };

    type StockWithData = {
        userId: string;
        symbol: string;
        company: string;
        addedAt: Date;
        currentPrice?: number;
        changePercent?: number;
        highPrice?: number;
        lowPrice?: number;
        openPrice?: number;
        prevClose?: number;
        priceFormatted?: string;
        changeFormatted?: string;
        marketCap?: string;
        peRatio?: string;
    };

    type AlertsListProps = {
        alertData: Alert[] | undefined;
    };

    type MarketNewsArticle = {
        id: number;
        headline: string;
        summary: string;
        source: string;
        url: string;
        datetime: number;
        category: string;
        related: string;
        image?: string;
    };

    type WatchlistNewsProps = {
        news?: MarketNewsArticle[];
    };

    type SearchCommandProps = {
        open?: boolean;
        setOpen?: (open: boolean) => void;
        renderAs?: 'button' | 'text';
        buttonLabel?: string;
        buttonVariant?: 'primary' | 'secondary';
        className?: string;
    };

    type AlertData = {
        symbol: string;
        company: string;
        alertName: string;
        alertType: 'upper' | 'lower';
        threshold: string;
    };

    type AlertModalProps = {
        alertId?: string;
        alertData?: AlertData;
        action?: string;
        open: boolean;
        setOpen: (open: boolean) => void;
    };

    type RawNewsArticle = {
        id: number;
        headline?: string;
        summary?: string;
        source?: string;
        url?: string;
        datetime?: number;
        image?: string;
        category?: string;
        related?: string;
    };

    type Alert = {
        id: string;
        symbol: string;
        company: string;
        alertName: string;
        currentPrice: number;
        alertType: 'upper' | 'lower';
        threshold: number;
        changePercent?: number;
    };

    // Lightweight Charts types (simplified)
    type UTCTimestamp = number;
    type CandleDataPoint = {
        time: UTCTimestamp;
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
        synthetic?: boolean;
    };

    // ---- Paper Trading Types ----
    type PaperTradeSide = 'BUY' | 'SELL';
    type TriggerSource = 'manual' | 'ai_proposal' | 'strategy' | 'limit_order' | 'stop_loss' | 'take_profit' | 'corporate_action';
    type PositionStatus = 'open' | 'closed' | 'delisted';
    type TradeStatus = 'executed' | 'failed' | 'reversed';

    type WalletSnapshot = {
        cashBalance: number;
        reservedBalance: number;
        initialBalance: number;
        buyingPower: number;
        resetCount: number;
    };

    type PortfolioPosition = {
        id: string;
        symbol: string;
        quantity: number;
        avgEntryPrice: number;
        totalCostBasis: number;
        realizedPnlToDate: number;
        currentPrice: number;
        marketValue: number;
        unrealizedPnl: number;
        unrealizedPnlPercent: number;
        openedAt: string;
        lastTradeAt: string;
    };

    type PortfolioTrade = {
        id: string;
        symbol: string;
        side: PaperTradeSide;
        quantity: number;
        fillPrice: number;
        notional: number;
        fees: number;
        realizedPnl: number | null;
        triggerSource: TriggerSource;
        status: TradeStatus;
        executedAt: string;
        createdAt: string;
    };

    type PortfolioSummaryData = {
        wallet: WalletSnapshot;
        positions: PortfolioPosition[];
        totalEquity: number;
        totalUnrealizedPnl: number;
        totalUnrealizedPnlPercent: number;
        totalRealizedPnl: number;
        totalReturn: number;
        totalReturnPercent: number;
        dayPnl: number;
    };

    type ManualTradeInput = {
        symbol: string;
        side: PaperTradeSide;
        quantity: number;
    };
}

export { };