/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, AzureContainerServices } from "@fluidframework/azure-client";
import { ContainerSchema, IFluidContainer } from "fluid-framework";
import { SharedTreeFactory } from "@fluid-experimental/tree2";
import { clientProps } from "./clientProps";

export class MySharedTree {
	public static getFactory(): SharedTreeFactory {
		return new SharedTreeFactory();
	}
}

const client = new AzureClient(clientProps);

/**
 * This function will create a container if no container ID is passed on the hash portion of the URL.
 * If a container ID is provided, it will load the container.
 *
 * @returns The loaded container and container services.
 */
export const loadFluidData = async (
	containerId: string,
	containerSchema: ContainerSchema,
): Promise<{
	services: AzureContainerServices;
	container: IFluidContainer;
}> => {
	let container: IFluidContainer;
	let services: AzureContainerServices;

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
};

export const containerSchema: ContainerSchema = {
	initialObjects: {
		appData: MySharedTree,
	},
};
