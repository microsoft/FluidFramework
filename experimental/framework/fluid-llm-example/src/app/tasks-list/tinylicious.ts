/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidContainer, type ContainerSchema } from "@fluidframework/fluid-static";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";

const tinyliciousClient = new TinyliciousClient({});

const _containerId: string =
	new URL(window.location.href).searchParams.get("fluidContainerId") ?? "";
export const containerIdFromUrl = (): string => _containerId;

export async function loadContainer<T extends ContainerSchema>(
	containerSchema: T,
	id: string,
): Promise<IFluidContainer<T>> {
	const { container } = await tinyliciousClient.getContainer(id, containerSchema, "2");
	return container;
}

export async function createContainer<T extends ContainerSchema>(
	containerSchema: T,
): Promise<IFluidContainer<T>> {
	const { container } = await tinyliciousClient.createContainer(containerSchema, "2");
	return container;
}

export async function postAttach<T extends ContainerSchema>(
	containerId: string,
	container: IFluidContainer<T>,
): Promise<void> {
	const url = new URL(window.location.href);
	const searchParams = url.searchParams;
	searchParams.set("fluidContainerId", containerId);
	const newUrl = `${url.pathname}?${searchParams.toString()}`;
	window.history.replaceState({}, "", newUrl);
}
