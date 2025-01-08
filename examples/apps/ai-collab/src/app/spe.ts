/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ContainerSchema, IFluidContainer } from "fluid-framework";

import { start } from "@/infra/authHelper";

const { client, getShareLink, containerId: _containerId } = await start();

export const containerIdFromUrl = (): string => _containerId;

export async function loadContainer<T extends ContainerSchema>(
	containerSchema: T,
	id: string,
): Promise<IFluidContainer<T>> {
	const { container } = await client.getContainer(id, containerSchema);
	return container;
}

export async function createContainer<T extends ContainerSchema>(
	containerSchema: T,
): Promise<IFluidContainer<T>> {
	const { container } = await client.createContainer(containerSchema);
	return container;
}

export async function postAttach<T extends ContainerSchema>(
	containerId: string,
	container: IFluidContainer<T>,
): Promise<void> {
	// Create a sharing id to the container and set it in the URL hash.
	// This allows the user to collaborate on the same Fluid container with other users just by sharing the link.
	const shareId = await getShareLink(containerId);
	history.replaceState(undefined, "", `#${shareId}`);
}
