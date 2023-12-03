/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { OdspClient, OdspContainerServices } from "@fluid-experimental/odsp-client";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { SharedTreeFactory } from "@fluid-experimental/tree2";
import { clientProps } from "./clientProps";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class SharedTree {
	public static getFactory(): SharedTreeFactory {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return new SharedTreeFactory();
	}
}

const client = new OdspClient(clientProps);

/**
 * This function will create a container if no container ID is passed on the hash portion of the URL.
 * If a container ID is provided, it will load the container.
 *
 * @returns The loaded container and container services.
 */
export const loadFluidData = async (
	itemId: string,
	schema: ContainerSchema,
): Promise<{
	services: OdspContainerServices;
	container: IFluidContainer;
}> => {
	let container: IFluidContainer;
	let services: OdspContainerServices;

	// Get or create the document depending if we are running through the create new flow
	if (itemId.length === 0) {
		// The client will create a new detached container using the schema
		// A detached container will enable the app to modify the container before attaching it to the client
		({ container, services } = await client.createContainer(schema));
	} else {
		// Use the unique container ID to fetch the container created earlier. It will already be connected to the
		// collaboration session.
		({ container, services } = await client.getContainer(itemId, schema));
	}
	return { services, container };
};

export const containerSchema: ContainerSchema = {
	initialObjects: {
		appData: SharedTree,
	},
};
