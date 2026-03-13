/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { DriverErrorTypes } from "@fluidframework/driver-definitions/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { runWithRetry } from "../runWithRetry.js";

const _setTimeout = global.setTimeout;
const fastSetTimeout = (
	callback: (...cbArgs: unknown[]) => void,
	ms: number,
	...args: unknown[]
): ReturnType<typeof setTimeout> =>
	_setTimeout(callback, ms / 1000, ...args) as unknown as ReturnType<typeof setTimeout>;
async function runWithFastSetTimeout<T>(callback: () => Promise<T>): Promise<T> {
	global.setTimeout = fastSetTimeout as typeof setTimeout;
	return callback().finally(() => {
		global.setTimeout = _setTimeout;
	});
}

describe("runWithRetry Tests", () => {
	const logger = createChildLogger();

	it("Should succeed at first time", async () => {
		let retryTimes: number = 1;
		let success = false;
		const api = async (): Promise<boolean> => {
			retryTimes -= 1;
			return true;
		};

		let emitDelayInfoTimes: number = 0;
		success = await runWithFastSetTimeout(async () =>
			runWithRetry(api, "test", logger, {
				onRetry: () => {
					emitDelayInfoTimes += 1;
				},
			}),
		);
		assert.strictEqual(retryTimes, 0, "Should succeed at first time");
		assert.strictEqual(success, true, "Retry should succeed ultimately");
		assert.strictEqual(emitDelayInfoTimes, 0, "Should not emit delay at first time");
	});

	it("Check that it retries infinitely", async () => {
		const maxTries: number = 5;
		let retryTimes: number = maxTries;
		let success = false;
		const api = async (): Promise<boolean> => {
			if (retryTimes > 0) {
				retryTimes -= 1;
				const error = new Error("Throw error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).errorType = DriverErrorTypes.throttlingError;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).retryAfterSeconds = 10;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).canRetry = true;
				throw error;
			}
			return true;
		};

		let emitDelayInfoTimes: number = 0;
		success = await runWithFastSetTimeout(async () =>
			runWithRetry(api, "test", logger, {
				onRetry: () => {
					emitDelayInfoTimes += 1;
				},
			}),
		);
		assert.strictEqual(retryTimes, 0, "Should keep retrying until success");
		assert.strictEqual(success, true, "Retry should succeed ultimately");
		assert.strictEqual(emitDelayInfoTimes, maxTries, "Should emit delay at each try");
	});

	it("Check that it retries after retry seconds", async () => {
		let retryTimes: number = 1;
		let success = false;
		const api = async (): Promise<boolean> => {
			if (retryTimes > 0) {
				retryTimes -= 1;
				const error = new Error("Throttle Error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).errorType = DriverErrorTypes.throttlingError;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).retryAfterSeconds = 400;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).canRetry = true;
				throw error;
			}
			return true;
		};
		success = await runWithFastSetTimeout(async () => runWithRetry(api, "test", logger, {}));
		assert.strictEqual(retryTimes, 0, "Should retry once");
		assert.strictEqual(success, true, "Retry should succeed ultimately");
	});

	it("If error is just a string, should retry as canRetry is not false", async () => {
		let retryTimes: number = 1;
		let success = false;
		const api = async (): Promise<boolean> => {
			if (retryTimes > 0) {
				retryTimes -= 1;
				const err = new Error("error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(err as any).canRetry = true;
				throw err;
			}
			return true;
		};
		try {
			success = await runWithFastSetTimeout(async () => runWithRetry(api, "test", logger, {}));
		} catch {
			// Ignore the error
		}
		assert.strictEqual(retryTimes, 0, "Should retry");
		assert.strictEqual(success, true, "Should succeed as retry should be successful");
	});

	it("Should not retry if canRetry is set as false", async () => {
		let retryTimes: number = 1;
		let success = false;
		const api = async (): Promise<boolean> => {
			if (retryTimes > 0) {
				retryTimes -= 1;
				const error = new Error("error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).canRetry = false;
				throw error;
			}
			return true;
		};
		try {
			success = await runWithFastSetTimeout(async () => runWithRetry(api, "test", logger, {}));
			assert.fail("Should not succeed");
		} catch {
			// Ignore the error
		}
		assert.strictEqual(retryTimes, 0, "Should not retry");
		assert.strictEqual(success, false, "Should not succeed as canRetry was not set");
	});

	it("Should not retry if canRetry is not set", async () => {
		let retryTimes: number = 1;
		let success = false;
		const api = async (): Promise<boolean> => {
			if (retryTimes > 0) {
				retryTimes -= 1;
				const error = new Error("error");
				throw error;
			}
			return true;
		};
		try {
			success = await runWithFastSetTimeout(async () => runWithRetry(api, "test", logger, {}));
			assert.fail("Should not succeed");
		} catch {
			// Ignore the error
		}
		assert.strictEqual(retryTimes, 0, "Should not retry");
		assert.strictEqual(success, false, "Should not succeed as canRetry was not set");
	});

	it("Should not retry if it is disabled", async () => {
		let retryTimes: number = 1;
		let success = false;
		const api = async (): Promise<boolean> => {
			if (retryTimes > 0) {
				retryTimes -= 1;
				const error = new Error("error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).canRetry = true;
				throw error;
			}
			return true;
		};
		try {
			success = await runWithFastSetTimeout(async () =>
				runWithRetry(api, "test", logger, {
					onRetry: () => {
						throw new Error("disposed");
					},
				}),
			);
			assert.fail("Should not succeed");
		} catch {
			// Ignore the error
		}
		assert.strictEqual(retryTimes, 0, "Should not retry");
		assert.strictEqual(success, false, "Should not succeed as retrying was disabled");
	});

	it("Abort reason is included in thrown exception", async () => {
		const abortController = new AbortController();

		const api = (): never => {
			abortController.abort("Sample abort reason");
			const error = new Error("aborted");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
			(error as any).canRetry = true;
			throw error;
		};
		try {
			await runWithFastSetTimeout(async () =>
				runWithRetry(api, "test", logger, {
					cancel: abortController.signal,
				}),
			);
			assert.fail("Should not succeed");
		} catch (error) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
			assert.strictEqual((error as any).message, "runWithRetry was Aborted");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
			assert.strictEqual((error as any).reason, "Sample abort reason");
		}
	});

	it("Should stop retrying after maxRetries is exceeded", async () => {
		const maxRetries = 3;
		let retryTimes = 0;
		const api = async (): Promise<boolean> => {
			retryTimes += 1;
			const error = new Error("Throw error");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
			(error as any).canRetry = true;
			throw error;
		};

		try {
			await runWithFastSetTimeout(async () =>
				runWithRetry(api, "test", logger, {
					maxRetries,
				}),
			);
			assert.fail("Should not succeed");
		} catch (error) {
			// Verify the wrapped error includes the original error message
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- TODO: use a real type
			const errorMessage = (error as any).message;
			assert.strictEqual(errorMessage, "runWithRetry failed after max retries: Throw error");
			// Verify the original error is preserved in the cause property
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- TODO: use a real type
			const causeMessage = (error as any).cause?.message;
			assert.strictEqual(causeMessage, "Throw error");
		}
		// Initial call + maxRetries attempts
		assert.strictEqual(retryTimes, maxRetries + 1, "Should retry exactly maxRetries times");
	});

	it("Should succeed before maxRetries is exceeded", async () => {
		const maxRetries = 5;
		let retryTimes = 0;
		const api = async (): Promise<boolean> => {
			retryTimes += 1;
			// Succeed on the 3rd attempt (after 2 failures)
			if (retryTimes < 3) {
				const error = new Error("Throw error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).canRetry = true;
				throw error;
			}
			return true;
		};

		const success = await runWithFastSetTimeout(async () =>
			runWithRetry(api, "test", logger, {
				maxRetries,
			}),
		);
		assert.strictEqual(success, true, "Should succeed");
		assert.strictEqual(retryTimes, 3, "Should take 3 attempts to succeed");
	});

	it("Should retry infinitely when maxRetries is undefined", async () => {
		const totalRetries = 10;
		let retryTimes = 0;
		const api = async (): Promise<boolean> => {
			retryTimes += 1;
			if (retryTimes <= totalRetries) {
				const error = new Error("Throw error");
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
				(error as any).canRetry = true;
				throw error;
			}
			return true;
		};

		const success = await runWithFastSetTimeout(async () =>
			runWithRetry(api, "test", logger, {}),
		);
		assert.strictEqual(success, true, "Should succeed");
		assert.strictEqual(retryTimes, totalRetries + 1, "Should retry until success");
	});

	it("Should fail immediately with maxRetries set to 0", async () => {
		let retryTimes = 0;
		const api = async (): Promise<boolean> => {
			retryTimes += 1;
			const error = new Error("Throw error");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- TODO: use a real type
			(error as any).canRetry = true;
			throw error;
		};

		try {
			await runWithFastSetTimeout(async () =>
				runWithRetry(api, "test", logger, {
					maxRetries: 0,
				}),
			);
			assert.fail("Should not succeed");
		} catch (error) {
			// Verify the wrapped error includes the original error message
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- TODO: use a real type
			const errorMessage = (error as any).message;
			assert.strictEqual(errorMessage, "runWithRetry failed after max retries: Throw error");
			// Verify the original error is preserved in the cause property
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- TODO: use a real type
			const causeMessage = (error as any).cause?.message;
			assert.strictEqual(causeMessage, "Throw error");
		}
		// Only the initial call, no retries
		assert.strictEqual(retryTimes, 1, "Should not retry at all");
	});
});
