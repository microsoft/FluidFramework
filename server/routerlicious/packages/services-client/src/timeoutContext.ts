/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Binds and tracks timeout info through a given codepath.
 * The timeout can be checked manually to stop exit out of the codepath if the timeout has been exceeded.
 *
 * @internal
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

/**
 * Retrieves the global ITimeoutContext instance if available.
 * If not available, returns a NullTimeoutContext instance which behaves as a no-op.
 *
 * @internal
 */
export const getGlobalTimeoutContext = () =>
	(getGlobal()?.timeoutContext as ITimeoutContext | undefined) ?? nullTimeoutContext;

/**
 * Sets the global ITimeoutContext instance.
 *
 * @internal
 */
export const setGlobalTimeoutContext = (timeoutContext: ITimeoutContext) => {
	if (!getGlobal()) return;
	getGlobal().timeoutContext = timeoutContext;
};
