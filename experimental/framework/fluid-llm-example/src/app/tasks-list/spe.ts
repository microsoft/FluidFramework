/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SharedTreeAppState,
	INITIAL_APP_STATE,
	CONTAINER_SCHEMA,
	TREE_CONFIGURATION,
} from "@/types/sharedTreeAppSchema";
import { start } from "@/infra/authHelper";
import type { IFluidContainer } from "@fluidframework/fluid-static";

const { client, getShareLink, containerId } = await start();

export const containerIdFromUrl = () => containerId ;

export async function loadContainer(
	id: string,
): Promise<IFluidContainer<typeof CONTAINER_SCHEMA>> {
	console.log(`Loading container with id '${id}'`);
	const res = await client.getContainer(id, CONTAINER_SCHEMA);
	return res.container;
}

export async function createAndInitializeContainer(): Promise<IFluidContainer<typeof CONTAINER_SCHEMA>> {
	console.log("Creating a new container");

	const { container } = await client.createContainer(CONTAINER_SCHEMA);
	const treeView = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
	treeView.initialize(new SharedTreeAppState(INITIAL_APP_STATE));
	treeView.dispose(); // After initializing, dispose the tree view so later loading of the data can work correctly
	return container;
}

export async function postAttach(containerId: string, container: IFluidContainer<typeof CONTAINER_SCHEMA>) {
	// Create a sharing id to the container and set it in the URL hash.
	// This allows the user to collaborate on the same Fluid container with other users just by sharing the link.
	const shareId = await getShareLink(containerId);
	history.replaceState(undefined, "", "#" + shareId);
}
