import 'server-only';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    try {
        const res = await fetch(url, {
            ...(revalidateSeconds !== undefined ? { next: { revalidate: revalidateSeconds } } : {}),
        });
        if (!res.ok) throw new Error(`fetchJSON failed: ${res.status} ${res.statusText}`);
        return (await res.json()) as T;
    } catch (error: any) {
        if (error?.code === 'ECONNRESET' || error?.message?.includes('aborted') || error?.cause?.code === 'ECONNRESET') {
            console.warn(`[API] Fetch aborted: ECONNRESET for ${url.split('?')[0]}`);
            return null as unknown as T;
        }
        throw error;
    }
}
