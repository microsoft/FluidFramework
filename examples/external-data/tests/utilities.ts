/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Server } from "node:http";

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
