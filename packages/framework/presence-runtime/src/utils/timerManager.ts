/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Wrapper around setTimeout to track whether the timeout has expired or not.
 */
export class TimerManager {
	private _timeoutId: number | undefined;
	private _startTime = 0;

	public get startTime(): number {
		return this._startTime;
	}

	private _delay: number = 0;

	public get delay(): number {
		return this._delay;
	}

	private _expired: boolean = true;

	/**
	 * Whether the timer has expired or not.
	 *
	 * @returns True if the timer has expired; false otherwise.
	 */
	public hasExpired(): boolean {
		return this._expired;
	}

	/**
	 * Schedules a callback to be triggered after a delay.
	 *
	 * @param callback - A callback to execute after a delay.
	 * @param delay - The time to wait before executing the callback, in milliseconds.
	 */
	public setTimeout(callback: () => void, delay: number): void {
		this.clearTimeout(); // Clear any existing timeout
		this._startTime = Date.now();
		this._delay = delay;
		this._expired = false;
		this._timeoutId = setTimeout(() => {
			this._expired = true;
			callback();
		}, delay);
	}

	/**
	 * Clear any pending timer. Also marks the timer as expired.
	 */
	public clearTimeout(): void {
		if (this._timeoutId !== undefined) {
			clearTimeout(this._timeoutId);
			this._timeoutId = undefined;
			this._expired = true;
		}
	}

	/**
	 * The time when this timer will expire/trigger. If the timer has expired, returns 0.
	 */
	public get expireTime(): number {
		return this.hasExpired() ? 0 : this.startTime + this.delay;
	}
}
