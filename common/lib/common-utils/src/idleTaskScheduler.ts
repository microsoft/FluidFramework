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
 */
export async function scheduleIdleTask<T>(
	callback: (deadline: IdleDeadline) => T,
	timeout: number,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const doLowPriorityTask = (deadline: IdleDeadline): void => {
			try {
				resolve(callback(deadline));
			} catch (err: any) {
				reject(err);
			}
		};

		if (typeof requestIdleCallback === "function") {
			requestIdleCallback(doLowPriorityTask, { timeout });
		} else {
			// we do not have good way to detect idle, so will run task on 0-second timer, yeilding a bit.
			const result: IdleDeadline = {
				didTimeout: false,
				timeRemaining() {
					return timeout;
				},
			};
			setTimeout(() => doLowPriorityTask(result), 0);
		}
	});
}
