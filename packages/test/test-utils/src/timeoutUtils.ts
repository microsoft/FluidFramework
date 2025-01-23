/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, Deferred } from "@fluidframework/core-utils/internal";
import type * as Mocha from "mocha";

const timeBuffer = 15; // leave 15 ms leeway for finish processing

// TestTimeout class that manages tracking of test timeout. It creates a timer when timeout is in effect,
// and provides a promise that will be rejected some time (as defined by `timeBuffer`) before the test timeout happens.
// This will ensure that async awaits in tests do not end up timing out the tests but resolve / reject
// before that happens.
// Once rejected, a new TestTimeout object will be create for the timeout.
class TestTimeout {
	private timeout: number = 0;
	private timer: NodeJS.Timeout | undefined;
	private readonly deferred: Deferred<void>;
	private rejected = false;

	private static instance: TestTimeout = new TestTimeout();
	public static reset(runnable: Mocha.Runnable) {
		TestTimeout.clear();
		TestTimeout.instance.resetTimer(runnable);
	}

	public static clear() {
		if (TestTimeout.instance.rejected) {
			TestTimeout.instance = new TestTimeout();
		} else {
			TestTimeout.instance.clearTimer();
		}
	}

	public static getInstance() {
		return TestTimeout.instance;
	}

	public async getPromise() {
		return this.deferred.promise;
	}

	public getTimeout() {
		return this.timeout;
	}

	private constructor() {
		this.deferred = new Deferred();
		// Ignore rejection for timeout promise if no one is waiting for it.
		this.deferred.promise.catch(() => {});
	}

	private resetTimer(runnable: Mocha.Runnable) {
		assert(!this.timer, "clearTimer should have been called before reset");
		assert(!this.deferred.isCompleted, "can't reset a completed TestTimeout");

		// Check the test timeout setting
		const timeoutFromMochaTest = runnable.timeout();
		if (!(Number.isFinite(timeoutFromMochaTest) && timeoutFromMochaTest > 0)) {
			return;
		}

		// subtract a buffer
		this.timeout = Math.max(timeoutFromMochaTest - timeBuffer, 1);

		// Set up timer to reject near the test timeout.
		this.timer = setTimeout(() => {
			this.deferred.reject(this);
			this.rejected = true;
		}, this.timeout);
	}
	private clearTimer() {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}
}

// Only register if we are running with mocha-test-setup loaded (that package is what sets globalThis.getMochaModule).
if (globalThis.getMochaModule !== undefined) {
	// Patch the private methods resetTimeout and clearTimeout on Mocha's runnable objects so we can do the appropriate
	// calls in TestTimeout above when the Mocha methods are called.
	// These are not part of the public API so if Mocha changes how it works, this could break.
	// See https://github.com/mochajs/mocha/blob/8d0ca3ed77ba8a704b2aa8b58267a084a475a51b/lib/runnable.js#L234.
	const mochaModule = globalThis.getMochaModule() as typeof Mocha;
	const runnablePrototype = mochaModule.Runnable.prototype;
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const oldResetTimeoutFunc = runnablePrototype.resetTimeout;
	runnablePrototype.resetTimeout = function (this: Mocha.Runnable) {
		oldResetTimeoutFunc.call(this);
		TestTimeout.reset(this);
	};
	// eslint-disable-next-line @typescript-eslint/unbound-method
	const oldClearTimeoutFunc = runnablePrototype.clearTimeout;
	runnablePrototype.clearTimeout = function (this: Mocha.Runnable) {
		TestTimeout.clear();
		oldClearTimeoutFunc.call(this);
	};
}

/**
 * @internal
 */
export interface TimeoutDurationOption {
	/**
	 * Timeout duration in milliseconds, if it is great than 0 and not Infinity
	 * If it is undefined, then it will use test timeout if we are in side the test function
	 * Otherwise, there is no timeout
	 */
	durationMs?: number;
}

/**
 * @internal
 */
export interface TimeoutWithError extends TimeoutDurationOption {
	reject?: true;
	errorMsg?: string;
	// Since there are no required properties, this type explicitly
	// rejects `value` to avoid confusion with TimeoutWithValue.
	value?: never;
}

/**
 * @internal
 */
export interface TimeoutWithValue<T = void> extends TimeoutDurationOption {
	reject: false;
	value: T;
}

export type PromiseExecutor<T = void> = (
	resolve: (value: T | PromiseLike<T>) => void,
	reject: (reason?: any) => void,
) => void;

/**
 * Wraps the given promise with another one that will complete after a specific timeout if the original promise does
 * not resolve by then.
 *
 * @remarks
 * If used inside a mocha test, it uses the test timeout by default and completes the returned promise just before
 * the test timeout hits, so that tests don't time out because of unpredictable awaits.
 * In that scenario the timeout can still be overridden via `timeoutOptions` but it's recommended to use the default value.
 *
 * @param promise - The promise to be wrapped.
 * @param timeoutOptions - Options that can be used to override the timeout and / or define the behavior when
 * the promise is not fulfilled. For example, instead of rejecting the promise, resolve with a specific value.
 * @returns A new promise that will complete when the given promise resolves or the timeout expires.
 * @internal
 */
export async function timeoutAwait<T = void>(
	promise: PromiseLike<T>,
	timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
	return Promise.race([promise, timeoutPromise<T>(() => {}, timeoutOptions)]);
}

/**
 * Creates a promise from the given executor that will complete after a specific timeout.
 *
 * @remarks
 * If used inside a mocha test, it uses the test timeout by default and completes the returned promise just before
 * the test timeout hits, so that tests don't time out because of unpredictable awaits.
 * In that scenario the timeout can still be overridden via `timeoutOptions` but it's recommended to use the default value.
 *
 * @param executor - The executor for the promise.
 * @param timeoutOptions - Options that can be used to override the timeout and / or define the behavior when
 * the promise is not fulfilled. For example, instead of rejecting the promise, resolve with a specific value.
 * @returns A new promise that will complete when the given executor resolves or the timeout expires.
 * @internal
 */
export async function timeoutPromise<T = void>(
	executor: (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: any) => void,
	) => void,
	timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
	// create the timeout error outside the async task, so its callstack includes
	// the original call site, this makes it easier to debug
	const err =
		timeoutOptions.reject === false
			? undefined
			: new Error(timeoutOptions.errorMsg ?? "Timed out");
	const executorPromise = getTimeoutPromise(executor, timeoutOptions, err);

	const currentTestTimeout = TestTimeout.getInstance();
	if (currentTestTimeout === undefined) {
		return executorPromise;
	}

	return Promise.race([executorPromise, currentTestTimeout.getPromise()]).catch((e) => {
		if (e === currentTestTimeout) {
			if (timeoutOptions.reject !== false) {
				// If the rejection is because of the timeout then
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const errorObject = err!;
				errorObject.message = `${
					timeoutOptions.errorMsg ?? "Forcing timeout before test does"
				} (${currentTestTimeout.getTimeout()}ms)`;
				throw errorObject;
			}
			return timeoutOptions.value;
		}
		throw e;
	}) as Promise<T>;
}

// Create a promise based on the timeout options
async function getTimeoutPromise<T = void>(
	executor: (
		resolve: (value: T | PromiseLike<T>) => void,
		reject: (reason?: any) => void,
	) => void,
	timeoutOptions: TimeoutWithError | TimeoutWithValue<T>,
	err: Error | undefined,
) {
	const timeout = timeoutOptions.durationMs ?? 0;
	if (timeout <= 0 || !Number.isFinite(timeout)) {
		return new Promise(executor);
	}

	return new Promise<T>((resolve, reject) => {
		const timeoutRejections = () => {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const errorObject = err!;
			errorObject.message = `${errorObject.message} (${timeout}ms)`;
			reject(err);
		};
		const timer = setTimeout(
			() =>
				timeoutOptions.reject === false ? resolve(timeoutOptions.value) : timeoutRejections(),
			timeout,
		);

		executor(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(reason) => {
				clearTimeout(timer);
				reject(reason);
			},
		);
	});
}
