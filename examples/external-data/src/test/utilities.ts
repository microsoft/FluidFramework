/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Server } from "node:http";

/**
 * "Promisifies" `Server.close`.
 */
export async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
}

/**
 * Returns a promise that resolves after `timeMs`.
 * @param timeMs - Time in milliseconds to wait.
 * @internal
 */
export const delay = async (timeMs: number): Promise<void> =>
	new Promise((resolve) => setTimeout(() => resolve(), timeMs));

/**
 * Polls `condition` at `pollIntervalMs` intervals until it returns `true`, or until `timeoutMs`
 * has elapsed, in which case an error is thrown.
 *
 * @remarks
 * Useful for waiting on the completion of async, out-of-band side effects (e.g. webhook
 * notifications delivered via a chain of unawaited `fetch` calls) that don't offer a promise to
 * await directly. Prefer this over a fixed `delay`, since a fixed delay is either a source of
 * flakiness (too short under load) or wasted test time (too long to be safe).
 *
 * @param condition - Function polled until it returns `true`.
 * @param timeoutMs - Maximum time in milliseconds to wait for `condition` to become `true`.
 * @param pollIntervalMs - Interval in milliseconds between polls of `condition`.
 * @internal
 */
export const waitForCondition = async (
	condition: () => boolean,
	timeoutMs: number = 5000,
	pollIntervalMs: number = 50,
): Promise<void> => {
	const startTime = Date.now();
	while (!condition()) {
		if (Date.now() - startTime >= timeoutMs) {
			// Final check in case `condition` flipped to true between the loop check above and
			// this timeout check, to avoid spuriously throwing right at the timeout boundary.
			if (condition()) {
				return;
			}
			throw new Error(`Condition was not satisfied within ${timeoutMs}ms timeout.`);
		}
		await delay(pollIntervalMs);
	}
};
