/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Retry a transient operation without logging its arguments or errors. */
export async function retry(
	operation,
	{
		attempts = 3,
		delayMs = 250,
		maxDelayMs = 60_000,
		shouldRetry = (error) => error?.retryable === true,
		sleep = delay,
		random = Math.random,
		onRetry = () => {},
	} = {},
) {
	if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10)
		throw new RangeError("Retry attempts must be between 1 and 10");
	for (let attempt = 1; ; attempt++) {
		try {
			return await operation(attempt);
		} catch (error) {
			if (attempt >= attempts || !shouldRetry(error)) throw error;
			const wait = Math.max(
				Math.min(maxDelayMs, delayMs * 2 ** (attempt - 1) * (0.5 + random())),
				error.retryAfterMs ?? 0,
			);
			// Do not shorten a server's retry hint and immediately throttle it again.
			if (wait > maxDelayMs) throw error;
			onRetry();
			await sleep(wait);
		}
	}
}
