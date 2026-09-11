/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Retry a transient operation without logging its arguments or errors. */
export async function retry(operation, { attempts = 3, delayMs = 250, shouldRetry = () => true } = {}) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (attempt >= attempts || !shouldRetry(error)) throw error;
			await delay(delayMs * attempt);
		}
	}
}
