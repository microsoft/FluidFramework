/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContainer,
	IDeltaManager,
	type IDeltaManagerFull,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import { assert } from "@fluidframework/core-utils/internal";
import type { IDeltaManagerErased } from "@fluidframework/datastore-definitions/internal";
import type {
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import { PromiseExecutor, TimeoutWithError, timeoutPromise } from "./timeoutUtils.js";

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
 * @internal
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

/**
 * Calls `container.getPendingLocalState()` and asserts the method is implemented.
 *
 * @remarks
 * `getPendingLocalState` is currently optional on `IContainer` for forward-compat with external
 * implementers; the first-party `Container` always implements it. This helper centralises the
 * existence check so test code does not duplicate `assert(... !== undefined, ...)` at every
 * callsite. Once `getPendingLocalState` becomes required on `IContainer` this helper can be
 * removed in favour of a direct call.
 *
 * @internal
 */
export async function getRequiredPendingLocalState(container: IContainer): Promise<string> {
	assert(
		container.getPendingLocalState !== undefined,
		"IContainer.getPendingLocalState is not implemented by this container",
	);
	return container.getPendingLocalState();
}

/**
 * Casts a delta manager to its full interface type with inbound/outbound queues.
 *
 * @internal
 */
export function toIDeltaManagerFull(
	deltaManager:
		| IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>
		| IDeltaManagerErased,
): IDeltaManagerFull {
	assert(
		"inbound" in deltaManager && "outbound" in deltaManager,
		"Delta manager does not have inbound/outbound queues.",
	);
	return deltaManager as unknown as
		| IDeltaManagerErased
		| IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> as IDeltaManagerFull;
}
