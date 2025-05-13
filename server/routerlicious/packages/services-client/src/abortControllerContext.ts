/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Binds and tracks abort controller info through a given codepath.
 * The abort controller can be checked manually to stop exit out of the codepath if the abort signal has been triggered.
 *
 * @internal
 */
export interface IAbortControllerContext {
	/**
	 * Attaches abort controller info to the callback context.
	 */
	bindAbortController(abortController: AbortController, callback: () => void): void;

	/**
	 * Attaches abort controller info to the callback context.
	 * Returns callback result as a promise.
	 */
	bindAbortControllerAsync<T>(
		abortController: AbortController,
		callback: () => Promise<T>,
	): Promise<T>;

	/**
	 * Returns the abort controller associated with the current context.
	 */
	getAbortController(): AbortController | undefined;
}

/**
 * Empty IAbortControllerContext that binds nothing never throws.
 * Callbacks are still executed and returned.
 */
class NullAbortControllerContext implements IAbortControllerContext {
	bindAbortController(abortController: AbortController, callback: () => void): void {
		callback();
	}
	async bindAbortControllerAsync<T>(
		abortController: AbortController,
		callback: () => Promise<T>,
	): Promise<T> {
		return callback();
	}
	getAbortController(): AbortController | undefined {
		return undefined;
	}
}
const nullAbortControllerContext = new NullAbortControllerContext();

// eslint-disable-next-line no-var
declare var global: typeof globalThis;
export const getGlobal = (): any => (typeof window !== "undefined" ? window : global);

/**
 * Retrieves the global IAbortControllerContext instance if available.
 * If not available, returns a NullAbortControllerContext instance which behaves as a no-op.
 *
 * @internal
 */
export const getGlobalAbortControllerContext = () =>
	(getGlobal()?.abortControllerContext as IAbortControllerContext | undefined) ??
	nullAbortControllerContext;

/**
 * Sets the global IAbortControllerContext instance.
 *
 * @internal
 */
export const setGlobalAbortControllerContext = (
	abortControllerContext: IAbortControllerContext,
) => {
	if (!getGlobal()) return;
	getGlobal().abortControllerContext = abortControllerContext;
};
