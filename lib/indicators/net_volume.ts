export type NetVolumeInput = {
    time: number; // UTCTimestamp
    close: number;
    volume: number;
};

export type NetVolumePoint = {
    time: number;
    value: number;
};

export function computeNetVolume(candles: NetVolumeInput[]): NetVolumePoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const out: NetVolumePoint[] = [];

    for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
            out.push({ time: candles[i].time, value: 0 });
            continue;
        }

        const currentClose = candles[i].close;
        const prevClose = candles[i - 1].close;
        const vol = candles[i].volume;

        let netVol = 0;

        if (currentClose > prevClose) {
            netVol = vol;
        } else if (currentClose < prevClose) {
            netVol = -vol;
        }

        out.push({
            time: candles[i].time,
            value: netVol
        });
    }

    return out;
}