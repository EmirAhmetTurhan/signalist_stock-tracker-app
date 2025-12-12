export type NetVolumeInput = {
    time: number; // UTCTimestamp
    open: number;
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
        const { open, close, volume } = candles[i];

        let netVol = 0;

        if (close > open) {
            netVol = volume;
        } else if (close < open) {
            netVol = -volume;
        }

        out.push({
            time: candles[i].time,
            value: netVol
        });
    }

    return out;
}