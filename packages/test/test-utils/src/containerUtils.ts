/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from "@fluidframework/container-definitions";
import { ConnectionState, Container } from "@fluidframework/container-loader";
import { PromiseExecutor, timeoutPromise, TimeoutWithError } from "./timeoutUtils";

/**
 * Waits for the specified container to emit a 'connected' event.
 *
 * @deprecated Use waitForContainerConnection instead.
 * Note that an upcoming release will change the default parameters on that function to:
 * - failOnContainerClose = true
 * - timeoutOptions.durationMs = 1s
 */
export async function ensureContainerConnected(container: Container): Promise<void> {
	if (!container.connected) {
		return timeoutPromise((resolve) => container.once("connected", () => resolve()));
	}
}

/**
 * Utility function to wait for the specified Container to be in Connected state.
 * If the Container is already connected, the Promise returns immediately; otherwise it resolves when the Container emits
 * its 'connected' event.
 * If failOnContainerClose === true, the returned Promise will be rejected if the container emits a 'closed' event
 * before a 'connected' event.
 * @param container - The container to wait for.
 * @param failOnContainerClose - If true, the returned Promise will be rejected if the container emits a 'closed' event
 * before a 'connected' event.
 * Defaults to false (but this will change in an upcoming version).
 * @param timeoutOptions - Options related to the behavior of the timeout.
 * If not provided, no timeout will be applied and the promise will wait indefinitely for the Container to emit its
 * 'connected' (or 'closed, if failOnContainerClose === true) event.
 * @returns A Promise that resolves when the specified container emits a 'connected' event (or immediately if the
 * Container is already connected).
 * If failOnContainerClose === true and the container emits a 'closed' event before a 'connected' event, the Promise
 * is rejected with the error from the 'closed' event, if any.
 * If timeoutOptions is provided, the Promise will reject if the container hasn't emmited a relevant event before
 * timeoutOptions.durationMs (which defaults to 250ms if left undefined).
 */
export async function waitForContainerConnection(
	container: IContainer,
	failOnContainerClose: boolean = false,
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
