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

	/**
	 * Number of attempts that occurred within the sliding window as of
	 * the most recent delay computation.
	 */
	readonly numAttempts: number;

	/**
	 * Width of sliding delay window in milliseconds.
	 */
	readonly delayWindowMs: number;
	/**
	 * Maximum delay allowed in milliseconds.
	 */
	readonly maxDelayMs: number;
	/**
	 * Delay function used to calculate what the delay should be.
	 * The input is the number of attempts that occurred within the sliding window.
	 * The result is the calculated delay in milliseconds.
	 */
	readonly delayFn: (numAttempts: number) => number;
}

/**
 * Used to give increasing delay times for throttling a single functionality.
 * Delay is based on previous attempts within specified time window, subtracting delay time.
 */
export class Throttler implements IThrottler {
	private startTimes: number[] = [];

	public get numAttempts(): number {
		return this.startTimes.length;
	}

	/**
	 * Gets all attempt start times after compensating for the delay times
	 * by adding the delay times to the actual times.
	 */
	public getAttempts(): readonly number[] {
		return [...this.startTimes];
	}

	/**
	 * Latest attempt time after compensating for the delay time itself
	 * by adding the delay time to the actual time.
	 */
	public get latestAttemptTime(): number | undefined {
		return this.startTimes.length > 0
			? this.startTimes[this.startTimes.length - 1]
			: undefined;
	}

	constructor(
		/**
		 * Width of sliding delay window in milliseconds.
		 */
		public readonly delayWindowMs: number,
		/**
		 * Maximum delay allowed in milliseconds.
		 */
		public readonly maxDelayMs: number,
		/**
		 * Delay function used to calculate what the delay should be.
		 * The input is the number of attempts that occurred within the sliding window.
		 * The result is the calculated delay in milliseconds.
		 */
		public readonly delayFn: (numAttempts: number) => number,
	) {}

	public getDelay(): number {
		const now = Date.now();

		const latestAttemptTime = this.latestAttemptTime;
		if (latestAttemptTime !== undefined) {
			// If getDelay was called sooner than the most recent delay,
			// subtract the remaining time, since we previously added it.
			const earlyMs = latestAttemptTime - now;
			if (earlyMs > 0) {
				this.startTimes = this.startTimes.map((t) => t - earlyMs);
			}
		}

		// Remove all attempts that have already fallen out of the window.
		this.startTimes = this.startTimes.filter((t) => now - t < this.delayWindowMs);

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

/**
 * Helper function to generate simple exponential throttle functions.
 * f(n) = [coefficient] x ([multiplier]^n) + [flatOffset]
 * where n = number of attempts, and f(n) = delay time in milliseconds.
 * If not provided, coefficient will default to 1, multiplier to 2,
 * minimum delay to 0, and the offset to 0, yielding:
 * 0 ms, 2 ms, 4 ms, 8 ms, ..., 2^n ms
 * where M = multiplier; an exponential back-off.
 * Use initialDelay to decide what should happen when numAttempts is 0,
 * leave it undefined to not special case.
 */
export const formExponentialFn =
	({
		multiplier = 2,
		coefficient = 1,
		offset = 0,
		initialDelay = undefined as number | undefined,
	} = {}): IThrottler["delayFn"] =>
	(numAttempts) =>
		Math.max(
			0,
			numAttempts <= 0 && initialDelay !== undefined
				? initialDelay
				: coefficient * Math.pow(multiplier, numAttempts) + offset,
		);

/**
 * f(n) = C x (B^(n+A)) + F = (C x B^A) x B^n + F
 */
export const formExponentialFnWithAttemptOffset = (
	attemptOffset: number,
	{
		multiplier = 2,
		coefficient = 1,
		offset = 0,
		initialDelay = undefined as number | undefined,
	} = {},
): IThrottler["delayFn"] =>
	formExponentialFn({
		multiplier,
		coefficient: coefficient * Math.pow(multiplier, attemptOffset),
		offset,
		initialDelay,
	});

/**
 * Helper function to generate simple linear throttle functions.
 * f(n) = [coefficient] x n + [flatOffset]
 * where n = number of attempts, and f(n) = delay time in milliseconds.
 * If not provided, coefficient will default to 1, and offset to 0, yielding:
 * 0 ms, 1 ms, 2 ms, 3 ms, ..., n ms delays; a linear back-off.
 */
export const formLinearFn =
	({ coefficient = 1, offset = 0 } = {}): IThrottler["delayFn"] =>
	(numAttempts) =>
		Math.max(0, coefficient * numAttempts + offset);

/**
 * f(n) = C x (n+A) + F = C x n + (C x A + F)
 */
export const formLinearFnWithAttemptOffset = (
	attemptOffset: number,
	{ coefficient = 1, offset = 0 } = {},
): IThrottler["delayFn"] =>
	formLinearFn({
		coefficient,
		offset: coefficient * attemptOffset + offset,
	});
