/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * API used to schedule non-essential tasks
 * Time measurements are in milliseconds as a floating point with a decimal
 * Takes in and runs a callback during idle time. Fallback to setTimeout if window doesn't
 * support requestIdleCallback.
 * @returns A promise pertaining to the callback that was passed in.
 *
 * @deprecated Not used outside this package.
 */
export async function scheduleIdleTask<T>(callback: () => T, timeout: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const doLowPriorityTask = (): any => {
			try {
				resolve(callback());
			} catch (error: any) {
				reject(error);
			}
		};

		if (typeof requestIdleCallback === "function") {
			requestIdleCallback(doLowPriorityTask, { timeout });
		} else {
			setTimeout(doLowPriorityTask, timeout);
		}
	});
}
