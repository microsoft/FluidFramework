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
import { IResponse } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IDeltaManagerErased } from "@fluidframework/datastore-definitions/internal";
import type {
	IDocumentMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { IDataStore } from "@fluidframework/runtime-definitions/internal";

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
 * This function should ONLY be used for back compat purposes
 * LTS versions of the Loader/Container will not have the "getEntryPoint" method, so we need to fallback to "request"
 * This function can be removed once LTS version of Loader moves to 2.0.0-internal.7.0.0
 * @internal
 */
export async function getContainerEntryPointBackCompat<T>(container: IContainer): Promise<T> {
	if (container.getEntryPoint !== undefined) {
		const entryPoint = await container.getEntryPoint();
		// Note: We need to also check if the result of `getEntryPoint()` is defined. This is because when running
		// cross version compat testing scenarios, if we create with 1.X container and load with 2.X then the
		// function container.getEntryPoint will be defined for the 2.X container. However, it will not return undefined
		// since the container's runtime will be on version 1.X, which does not have an entry point defined.
		if (entryPoint !== undefined) {
			return entryPoint as T;
		}
	}
	const response: IResponse = await (container as any).request({ url: "/" });
	assert(response.status === 200, "requesting '/' should return default data object");
	return response.value as T;
}

/**
 * This function should ONLY be used for back compat purposes
 * Older supported versions of IDataStore do not have the "entryPoint" property, so we need to fallback to "request"
 * This function can be removed once back-compat support for IDataStore moves to 2.0.0-internal.7.0.0
 *
 * @internal
 */
export async function getDataStoreEntryPointBackCompat<T>(dataStore: IDataStore): Promise<T> {
	if (dataStore.entryPoint !== undefined) {
		return dataStore.entryPoint.get() as Promise<T>;
	}
	const response: IResponse = await (dataStore as any).request({ url: "" });
	assert(response.status === 200, "empty request should return data object");
	return response.value as T;
}

/**
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
