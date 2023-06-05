/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { PromiseExecutor, timeoutPromise, TimeoutWithError } from "./timeoutUtils";

/**
 * Utility function to wait for the specified Container to be in Connected state.
 * If the Container is already connected, the Promise returns immediately; otherwise it resolves when the Container emits
 * its 'connected' event.
 * If failOnContainerClose === true, the returned Promise will be rejected if the container emits a 'closed' event
 * before a 'connected' event.
 * @param container - The container to wait for.
 * @param failOnContainerClose - If true, the returned Promise will be rejected if the container emits a 'closed' event
 * before a 'connected' event.
 * Defaults to true.
 * @param timeoutOptions - Options related to the behavior of the timeout.
 * If provided, the returned Promise will reject if the container hasn't emitted relevant events in timeoutOptions.durationMs.
 * If not provided, the Promise will wait indefinitely for the Container to emit its 'connected' (or 'closed', if
 * failOnContainerClose === true) event.
 *
 * @returns A Promise that either:
 * - Resolves when the specified container emits a 'connected' event (or immediately if the Container is already connected).
 * - Rejects if failOnContainerClose === true and the container emits a 'closed' event before a 'connected' event.
 * - Rejects after timeoutOptions.durationMs if timeoutOptions !== undefined and the container does not emit relevant
 * events, within that timeframe.
 */
export async function waitForContainerConnection(
	container: IContainer,
	failOnContainerClose: boolean = true,
	timeoutOptions?: TimeoutWithError,
): Promise<void> {
	if (container.connectionState !== ConnectionState.Connected) {
		const executor: PromiseExecutor = (resolve, reject) => {
			container.once("connected", () => resolve());
			if (failOnContainerClose) {
				container.once("closed", (error) => reject(error));
			}
		};

		return timeoutOptions === undefined
			? new Promise(executor)
			: timeoutPromise(executor, timeoutOptions);
	}
}
