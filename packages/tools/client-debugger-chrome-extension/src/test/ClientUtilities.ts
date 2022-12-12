/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, FluidContainer, IFluidContainer } from "@fluidframework/fluid-static";
import {
	ITinyliciousAudience,
	TinyliciousClient,
	TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";

import { initializeFluidClientDebugger as initializeFluidClientDebuggerBase } from "@fluid-tools/client-debugger";

/**
 * This module contains Fluid Client utilities, including Container creation / loading.
 */

/**
 * Type returned from when creating / loading the Container.
 */
export interface ContainerLoadResult {
	container: IFluidContainer;
	services: TinyliciousContainerServices;
}

/**
 * Basic information about the container, as well as the associated audience.
 */
export interface ContainerInfo {
	containerId: string;
	container: IFluidContainer;
	audience: ITinyliciousAudience;
}

/**
 * Creates a new Fluid Container from the provided client and container schema.
 *
 * @param client - The Tinylicious service client.
 * @param containerSchema - Schema with which to create the container.
 *
 * @throws If container creation or attaching fails for any reason.
 */
export async function createFluidContainer(
	client: TinyliciousClient,
	containerSchema: ContainerSchema,
): Promise<ContainerInfo> {
	// Create the container
	let createContainerResult: ContainerLoadResult;
	try {
		createContainerResult = await client.createContainer(containerSchema);
	} catch (error) {
		console.error(`Encountered error creating Fluid container: "${error}".`);
		throw error;
	}

	const { container, services } = createContainerResult;

	// Attach container
	let containerId: string;
	try {
		containerId = await container.attach();
	} catch (error) {
		console.error(`Encountered error attaching Fluid container: "${error}".`);
		throw error;
	}

	return {
		container,
		containerId,
		audience: services.audience,
	};
}

/**
 * Loads an existing Container for the given ID.
 *
 * @throws If no container exists with the specified ID, or if loading / connecting fails for any reason.
 */
export async function loadExistingFluidContainer(
	client: TinyliciousClient,
	containerId: string,
	containerSchema: ContainerSchema,
): Promise<ContainerInfo> {
	let getContainerResult: ContainerLoadResult;
	try {
		getContainerResult = await client.getContainer(containerId, containerSchema);
	} catch (error) {
		console.error(`Encountered error loading Fluid container: "${error}".`);
		throw error;
	}

	const { container, services } = getContainerResult;

	if (container.connectionState !== ConnectionState.Connected) {
		await new Promise<void>((resolve) => {
			container.once("connected", () => {
				resolve();
			});
		});
	}

	return {
		container,
		containerId,
		audience: services.audience,
	};
}

/**
 * Initializes the Fluid Client debugger using the current session Container info.
 *
 * @privateRemarks TODO: this should live in a fluid-static / azure-client debugger adapter library,
 * not here.
 */
export function initializeFluidClientDebugger(containerInfo: ContainerInfo): void {
	/* eslint-disable @typescript-eslint/no-non-null-assertion */
	initializeFluidClientDebuggerBase({
		containerId: containerInfo.containerId,
		container: (containerInfo.container as FluidContainer).INTERNAL_CONTAINER_DO_NOT_USE!(),
		containerData: containerInfo.container.initialObjects,
	});
	/* eslint-enable @typescript-eslint/no-non-null-assertion */
}

// Convenience re-export, since no adapter logic is required for clean-up
export { closeFluidClientDebugger } from "@fluid-tools/client-debugger";
