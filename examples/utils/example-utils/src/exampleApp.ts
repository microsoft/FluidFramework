/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { startEphemeralService } from "@fluidframework/local-driver/alpha";
import { createTinyliciousServiceClient } from "@fluidframework/tinylicious-driver/alpha";
/* eslint-disable import-x/no-internal-modules -- Unified ServiceClient types are not yet available from the public entry point. */
import type {
	DataStoreKind,
	FluidContainer,
	ServiceClient,
	ServiceOptions,
} from "@fluidframework/driver-definitions/internal";
/* eslint-enable import-x/no-internal-modules -- Limit the exception to the ServiceClient type import. */
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

/**
 * Default service options used by example applications.
 * @internal
 */
export const defaultServiceOptions: ServiceOptions = {
	minVersionForCollaboration: "2.100.0",
};

/**
 * Configures a service client based on the `fluidClient` URL query parameter.
 *
 * @param options - Options used to configure the service client. Defaults to {@link defaultServiceOptions}.
 * @returns A client for the selected service, or the ephemeral service by default.
 * @internal
 */
export function getExampleServiceClient(
	options: ServiceOptions = defaultServiceOptions,
): ServiceClient {
	const fluidClient = new URLSearchParams(location.search).get("fluidClient") ?? "ephemeral";
	switch (fluidClient) {
		case "tinylicious": {
			return createTinyliciousServiceClient(options);
		}
		default: {
			console.warn(
				`Unknown fluidClient value: ${JSON.stringify(fluidClient)}, falling back to ephemeral service.`,
			);
		}
		case "ephemeral": {
			return startEphemeralService().newClient(options);
		}
	}
}

/**
 * Loads the container identified by the current URL hash, or creates a container and updates the hash with its ID.
 *
 * @typeParam T - The type of the root data store.
 * @param client - The service client used to load or create the container.
 * @param rootStore - The kind of data store to use as the container root.
 * @returns The loaded or newly attached container.
 * @internal
 */
export async function loadExampleContainer<T>(
	client: ServiceClient,
	rootStore: DataStoreKind<T>,
): Promise<FluidContainer<T>> {
	const id = location.hash.slice(1);
	if (id.length > 0) {
		return client.loadContainer(id, rootStore);
	}

	const container = await client.createContainer(rootStore);
	const attachedContainer = await container.attach();
	// eslint-disable-next-line require-atomic-updates -- this example setup assumes this function controls the location hash.
	location.hash = attachedContainer.id;
	return attachedContainer;
}

/**
 * Loads an example data store using the service selected by the URL query and the container ID in the URL hash.
 *
 * @typeParam T - The type of the root data store.
 * @param rootStore - The kind of data store to load as the container root.
 * @returns The root data store.
 * @internal
 */
export async function loadExampleDataStore<T>(rootStore: DataStoreKind<T>): Promise<T> {
	const service = getExampleServiceClient();
	const container = await loadExampleContainer(service, rootStore);
	return container.data;
}

/**
 * Replaces the default `#content` placeholder with a React rendering of the provided children.
 *
 * @param children - The React content to render.
 * @internal
 */
export function renderRoot(children: ReactNode): void {
	const rootElement = document.querySelector("#content");
	if (rootElement === null) {
		throw new Error("No #content element found");
	}
	createRoot(rootElement).render(children);
}
