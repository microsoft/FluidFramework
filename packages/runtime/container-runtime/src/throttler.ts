/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Used to give increasing delay times for throttling a single functionality.
 * Delay is based on previous attempts within specified time window, ignoring actual delay time.
 */
 export class Throttler {
    private startTimes: number[] = [];
    constructor(
        private readonly delayWindowMs: number,
        private readonly maxDelayMs: number,
        private readonly delayFunction: (n: number) => number,
    ) { }

    public get attempts() {
        return this.startTimes.length;
    }

    public getDelay() {
        const now = Date.now();
        this.startTimes = this.startTimes.filter((t) => now - t < this.delayWindowMs);
        const delayMs = Math.min(this.delayFunction(this.startTimes.length), this.maxDelayMs);
        this.startTimes.push(now);
        this.startTimes = this.startTimes.map((t) => t + delayMs); // account for delay time
        if (delayMs === this.maxDelayMs) {
            // we hit max delay so adding more won't affect anything
            // shift off oldest time to stop this array from growing forever
            this.startTimes.shift();
        }

        return delayMs;
    }
}
