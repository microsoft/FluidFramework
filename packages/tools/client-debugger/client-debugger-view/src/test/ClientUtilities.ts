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

function initializeTinyliciousClient(): TinyliciousClient {
	console.log(`Initializing Tinylicious client on port ${process.env.PORT}...`);
	return new TinyliciousClient();
}

/**
 * Creates a new Fluid Container from the provided client and container schema.
 *
 * @param containerSchema - Schema with which to create the container.
 * @param setContentsPreAttach - Optional callback for setting initial content state on the
 * container *before* it is attached.
 *
 * @throws If container creation or attaching fails for any reason.
 */
export async function createFluidContainer(
	containerSchema: ContainerSchema,
	setContentsPreAttach?: (container: IFluidContainer) => Promise<void>,
): Promise<ContainerInfo> {
	// Initialize Tinylicious client
	const client = initializeTinyliciousClient();

	// Create the container
	console.log("Creating new container...");
	let createContainerResult: ContainerLoadResult;
	try {
		createContainerResult = await client.createContainer(containerSchema);
	} catch (error) {
		console.error(`Encountered error creating Fluid container: "${error}".`);
		throw error;
	}
	console.log("Container created!");

	const { container, services } = createContainerResult;

	// Populate the container with initial app contents (*before* attaching)
	if (setContentsPreAttach !== undefined) {
		console.log("Populating initial app data...");
		await setContentsPreAttach(container);
		console.log("Initial data populated!");
	}

	// Attach container
	console.log("Awaiting container attach...");
	let containerId: string;
	try {
		containerId = await container.attach();
	} catch (error) {
		console.error(`Encountered error attaching Fluid container: "${error}".`);
		throw error;
	}
	console.log("Fluid container attached!");

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
	containerId: string,
	containerSchema: ContainerSchema,
): Promise<ContainerInfo> {
	// Initialize Tinylicious client
	const client = initializeTinyliciousClient();

	console.log("Loading existing container...");
	let getContainerResult: ContainerLoadResult;
	try {
		getContainerResult = await client.getContainer(containerId, containerSchema);
	} catch (error) {
		console.error(`Encountered error loading Fluid container: "${error}".`);
		throw error;
	}
	console.log("Container loaded!");

	const { container, services } = getContainerResult;

	if (container.connectionState !== ConnectionState.Connected) {
		console.log("Connecting to container...");
		await new Promise<void>((resolve) => {
			container.once("connected", () => {
				resolve();
			});
		});
		console.log("Connected!");
	}

	return {
		container,
		containerId,
		audience: services.audience,
	};
}

/**
 * Initializes the Fluid Client debugger using the current session Container info.
 */
export function initializeFluidClientDebugger(containerInfo: ContainerInfo): void {
	initializeFluidClientDebuggerBase({
		containerId: containerInfo.containerId,
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		container: (containerInfo.container as FluidContainer).INTERNAL_CONTAINER_DO_NOT_USE!(),
		containerData: containerInfo.container.initialObjects,
	});
}

// Convenience re-export, since no adapter logic is required for clean-up
export { closeFluidClientDebugger } from "@fluid-tools/client-debugger";
