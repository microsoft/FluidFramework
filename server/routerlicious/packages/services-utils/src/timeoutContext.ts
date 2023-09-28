/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RequestHandler } from "express";

export interface ITimeoutContextProperties {
	/**
	 * When the action started in milliseconds since epoch.
	 */
	startTime: number;
	/**
	 * How long the given action is allowed to take before timing out, in milliseconds.
	 */
	maxDurationMs: number;
}

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

export const getGlobalTimeoutContext = () =>
	(global.timeoutContext as ITimeoutContext | undefined) ?? nullTimeoutContext;

export const setGlobalTimeoutContext = (timeoutContext: ITimeoutContext) => {
	global.telemetryContext = timeoutContext;
};

/**
 * Express.js Middleware that binds TimeoutContext to the request for its lifetime.
 * Within the request flow, `getGlobalTimeoutContext().checkTimeout()` can then be called
 * strategically to terminate request processing early in case of timeout.
 */
export const bindTimeoutContext = (maxRequestDurationMs: number): RequestHandler => {
	return (req, res, next) => {
		const timeoutContext = getGlobalTimeoutContext();
		timeoutContext.bindTimeout(maxRequestDurationMs, () => next());
	};
};
