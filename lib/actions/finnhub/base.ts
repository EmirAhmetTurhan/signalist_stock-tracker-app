import 'server-only';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    const res = await fetch(url, {
        ...(revalidateSeconds !== undefined ? { next: { revalidate: revalidateSeconds } } : {}),
    });
    if (!res.ok) throw new Error(`fetchJSON failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
}
