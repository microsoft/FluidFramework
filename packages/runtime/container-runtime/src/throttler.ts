/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IThrottler {
    /**
     * Computes what the throttle delay should be, and records an attempt
     * which will be used for calculating future attempt delays.
     */
    getDelay(): number;
}

/**
 * Used to give increasing delay times for throttling a single functionality.
 * Delay is based on previous attempts within specified time window, subtracting delay time.
 */
export class Throttler implements IThrottler {
    private startTimes: number[] = [];

    /**
     * Gets all attempt start times after compensating for the delay times
     * by adding the delay times to the actual times.
     */
    public getAttempts(): readonly number[] {
        return [ ...this.startTimes ];
    }

    /**
     * Number of attempts that occurred within the sliding window as of
     * the most recent delay computation.
     */
    public get numAttempts() {
        return this.startTimes.length;
    }

    /**
     * Latest attempt time after compensating for the delay time itself
     * by adding the delay time to the actual time.
     */
    public get latestAttemptTime() {
        return this.startTimes.length > 0 ? this.startTimes[this.startTimes.length - 1] : undefined;
    }

    constructor(
        /** Width of sliding delay window in milliseconds. */
        private readonly delayWindowMs: number,
        /** Maximum delay allowed in milliseconds. */
        private readonly maxDelayMs: number,
        /**
         * Delay function used to calculate what the delay should be.
         * The input is the number of attempts that occurred within the sliding window.
         * The result is the calculated delay in milliseconds.
         */
        private readonly delayFn: (numAttempts: number) => number,
    ) { }

    public getDelay() {
        const now = Date.now();

        // Remove all attempts that have already fallen out of the window.
        this.startTimes = this.startTimes.filter((t) => (now - t) < this.delayWindowMs);

        // Compute delay, but do not exceed the specified max delay.
        const delayMs = Math.min(this.delayFn(this.startTimes.length), this.maxDelayMs);

        // Record this attempt start time.
        this.startTimes.push(now);

        // Account for the delay time, by effectively removing it from the delay window.
        this.startTimes = this.startTimes.map((t) => t + delayMs);

        if (delayMs === this.maxDelayMs) {
            // We hit max delay, so adding more won't affect anything.
            // Shift off oldest time to stop this array from growing forever.
            this.startTimes.shift();
        }

        return delayMs;
    }
}
