/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidContainer } from "./fluidContainer.js";
import type { ContainerSchema } from "./types.js";

/**
 * Service specific portion of a Fluid client.
 * @public
 */
export interface IServiceClient<TServices> {
	/**
	 * Creates a new detached container instance in service.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param containerSchema - Container schema for the new container.
	 * @returns New detached container instance along with associated services.
	 */
	createContainer<const TContainerSchema extends ContainerSchema>(
		containerSchema: TContainerSchema,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TServices;
	}>;

	/**
	 * Accesses the existing container given its unique ID in the service.
	 * @typeparam TContainerSchema - Used to infer the the type of 'initialObjects' in the returned container.
	 * (normally not explicitly specified.)
	 * @param id - Unique ID of the container in service.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @returns Existing container instance along with associated services.
	 */
	getContainer<const TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TServices;
	}>;
}
