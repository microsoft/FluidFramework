/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspClient, OdspContainerServices } from "@fluidframework/odsp-client/beta";
import { ContainerSchema, IFluidContainer, SharedTree } from "fluid-framework";

import { clientProps } from "./clientProps.js";

const client = new OdspClient(clientProps);

/**
 * This function will create a container if no item Id is passed on the hash portion of the URL.
 * If a item Id is provided, it will load the container.
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
	const {
		container,
		services,
	}: { container: IFluidContainer; services: OdspContainerServices } =
		await client.getContainer(itemId, schema);

	return { services, container };
};

export const createFluidData = async (
	schema: ContainerSchema,
): Promise<{
	services: OdspContainerServices;
	container: IFluidContainer;
}> => {
	// The client will create a new detached container using the schema
	// A detached container will enable the app to modify the container before attaching it to the client
	const {
		container,
		services,
	}: { container: IFluidContainer; services: OdspContainerServices } =
		await client.createContainer(schema);

	return { services, container };
};

export const containerSchema: ContainerSchema = {
	initialObjects: {
		appData: SharedTree,
	},
};
