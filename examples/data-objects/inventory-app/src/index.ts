/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toPropTreeNode } from "@fluidframework/react/alpha";
import { createTinyliciousServiceClient } from "@fluidframework/tinylicious-driver/alpha";
import { startEphemeralService } from "@fluidframework/local-driver/alpha";
import type {
	DataStoreKind,
	FluidContainer,
	ServiceClient,
	ServiceOptions,
} from "fluid-framework/alpha";
import { createElement } from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

import { inventoryDataStoreKind } from "./inventoryList.js";
import type { Inventory } from "./schema.js";
import { MainView } from "./view/index.js";

const serviceOptions = {
	minVersionForCollaboration: "2.100.0",
} as const;

/**
 * Configures a service client based on `process.env.FLUID_CLIENT`
 * and our defaults used by examples.
 */
function getExampleServiceClient(options: ServiceOptions): ServiceClient {
	switch (process.env.FLUID_CLIENT) {
		case "tinylicious": {
			return createTinyliciousServiceClient(options);
		}
		default: {
			console.warn(
				`Unknown FLUID_CLIENT value: ${JSON.stringify(process.env.FLUID_CLIENT)}, falling back to ephemeral service.`,
			);
		}
		case "":
		case "ephemeral":
		case undefined: {
			return startEphemeralService().newClient(options);
		}
	}
}

/**
 * Create or load a container based on the current location hash.
 * @privateRemarks
 * This could return `FluidContainerAttached`, but it doesn't have to as only this code needs the container id.
 * Choosing not to expose the `FluidContainerAttached` here keeps the types simpler,
 * and also makes it easier in the future to make this example setup support detached containers and delayed attach scenarios.
 *
 * For simplicity this only supports the `DataStoreKind` overload, and no full `DataStoreRegistry`:
 * this could easily be changed if needed.
 * TODO: We should adjust the container API surface (or add helpers) to make it easier to support both patterns in wrappers.
 */
async function loadExampleContainer<T>(
	client: ServiceClient,
	rootStore: DataStoreKind<T>,
): Promise<FluidContainer<T>> {
	const id = location.hash.slice(1);
	if (id.length > 0) {
		return client.loadContainer(id, rootStore);
	} else {
		const container = await client.createContainer(rootStore);
		const attachedInner = await container.attach();
		// eslint-disable-next-line require-atomic-updates -- this example setup assumes this function controls the location hash.
		location.hash = attachedInner.id;
		return attachedInner;
	}
}

/**
 * A simple opinionated default for loading an example data store as the root of a container configured by the location hash and
 * `process.env.FLUID_CLIENT`.
 */
async function loadExampleDataStore<T>(rootStore: DataStoreKind<T>): Promise<T> {
	const service = getExampleServiceClient(serviceOptions);
	const container = await loadExampleContainer(service, rootStore);
	return container.data;
}

const view = await loadExampleDataStore(inventoryDataStoreKind);
const root: Inventory = view.root;

const rootEl = document.querySelector("#content");
if (rootEl === null) {
	throw new Error("No #content element found");
}
createRoot(rootEl).render(createElement(MainView, { root: toPropTreeNode(root) }));
