/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ITimeoutContext {
	/**
	 * Attaches timeout info to the callback context.
	 */
	bindTimeout(maxDurationMs: number, callback: () => void): void;
	/**
	 * Attaches timeout info to the callback context.
	 * Returns callback result as a promise.
	 */
	bindTimeoutAsync<T>(maxDurationMs: number, callback: () => Promise<T>): Promise<T>;
	/**
	 * Checks if the timeout has been exceeded.
	 * If exceeded, throws a 503 Timeout error
	 */
	checkTimeout(): void;
}

/**
 * Empty ITimeoutContext that binds nothing never throws.
 * Callbacks are still executed and returned.
 */
class NullTimeoutContext implements ITimeoutContext {
	bindTimeout(maxDurationMs: number, callback: () => void): void {
		callback();
	}
	async bindTimeoutAsync<T>(maxDurationMs: number, callback: () => Promise<T>): Promise<T> {
		return callback();
	}
	checkTimeout(): void {}
}
const nullTimeoutContext = new NullTimeoutContext();

// eslint-disable-next-line no-var
declare var global: typeof globalThis;
export const getGlobal = (): any => (typeof window !== "undefined" ? window : global);

export const getGlobalTimeoutContext = () =>
	(getGlobal()?.timeoutContext as ITimeoutContext | undefined) ?? nullTimeoutContext;

export const setGlobalTimeoutContext = (timeoutContext: ITimeoutContext) => {
	if (!getGlobal()) return;
	getGlobal().timeoutContext = timeoutContext;
};
