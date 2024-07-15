/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, AzureContainerServices } from "@fluidframework/azure-client";
import { ContainerSchema, IFluidContainer } from "fluid-framework";
import { OdspClient, OdspContainerServices } from "@fluid-experimental/odsp-client";

/**
 * This function will create a container if no container ID is passed.
 * If a container ID is provided, it will load the container.
 *
 * @returns The loaded container and container services.
 */
export async function loadFluidData<T extends ContainerSchema>(
	containerId: string,
	containerSchema: T,
	client: AzureClient | OdspClient,
): Promise<{
	services: AzureContainerServices | OdspContainerServices;
	container: IFluidContainer<T>;
}> {
	let container: IFluidContainer<T>;
	let services: AzureContainerServices | OdspContainerServices;

	// Get or create the document depending if we are running through the create new flow
	if (containerId.length === 0) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container, services } = await client.createContainer(containerSchema));
	} else {
		// Use the unique container ID to fetch the container created earlier. It will already be connected to the
		// collaboration session.
		({ container, services } = await client.getContainer(containerId, containerSchema));
	}
	return { services, container };
}
