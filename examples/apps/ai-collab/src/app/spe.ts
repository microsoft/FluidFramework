/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import type { TreeContainerSchema } from "@fluidframework/fluid-static/internal";
import type { IFluidContainer } from "fluid-framework";

import { start } from "@/infra/authHelper";

const { client, getShareLink, containerId: _containerId } = await start();

export const containerIdFromUrl = (): string => _containerId;

export async function loadContainer(
	containerSchema: TreeContainerSchema,
	id: string,
): Promise<IFluidContainer<TreeContainerSchema>> {
	const { container } = await client.getContainer(id, containerSchema);
	return container;
}

export async function createContainer(
	containerSchema: TreeContainerSchema,
): Promise<IFluidContainer<TreeContainerSchema>> {
	const { container } = await client.createContainer(containerSchema);
	return container;
}

export async function postAttach(
	containerId: string,
	container: IFluidContainer<TreeContainerSchema>,
): Promise<void> {
	// Create a sharing id to the container and set it in the URL hash.
	// This allows the user to collaborate on the same Fluid container with other users just by sharing the link.
	const shareId = await getShareLink(containerId);
	history.replaceState(undefined, "", `#${shareId}`);
}
