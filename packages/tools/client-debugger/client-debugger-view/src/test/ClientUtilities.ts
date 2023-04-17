/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ConnectionState } from "@fluidframework/container-loader";
import { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import {
	ITelemetryBaseLogger,
	TinyliciousClient,
	TinyliciousContainerServices,
} from "@fluidframework/tinylicious-client";

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
	/**
	 * {@link ContainerInfo.container}'s unique ID.
	 */
	containerId: string;

	/**
	 * The initialized Fluid Container.
	 */
	container: IFluidContainer;

	/**
	 * Optional nickname for the Container to be used in the debugger and associated UI.
	 */
	containerNickname?: string;
}

function initializeTinyliciousClient(logger?: ITelemetryBaseLogger): TinyliciousClient {
	console.log(`Initializing Tinylicious client on port ${process.env.PORT}...`);
	return new TinyliciousClient({
		logger,
	});
}

/**
 * Creates a new Fluid Container from the provided client and container schema.
 *
 * @param containerSchema - Schema with which to create the container.
 * @param setContentsPreAttach - (optional) Callback for setting initial content state on the
 * container *before* it is attached.
 * @param logger - (optional) Telemetry logger to provide to client initialization.
 * @param containerNickname - See {@link ContainerInfo.containerNickname}.
 *
 * @throws If container creation or attaching fails for any reason.
 */
export async function createFluidContainer(
	containerSchema: ContainerSchema,
	logger?: ITelemetryBaseLogger,
	setContentsPreAttach?: (container: IFluidContainer) => Promise<void>,
	containerNickname?: string,
): Promise<ContainerInfo> {
	// Initialize Tinylicious client
	const client = initializeTinyliciousClient(logger);
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

	const { container } = createContainerResult;

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
		containerNickname,
	};
}

/**
 * Loads an existing Container for the given ID.
 *
 * @param containerId - The unique ID of the existing Fluid Container being loaded.
 * @param containerSchema - Schema with which to load the Container.
 * @param logger - (optional) Telemetry logger to provide to client initialization.
 * @param containerNickname - See {@link ContainerInfo.containerNickname}.
 *
 * @throws If no container exists with the specified ID, or if loading / connecting fails for any reason.
 */
export async function loadExistingFluidContainer(
	containerId: string,
	containerSchema: ContainerSchema,
	logger?: ITelemetryBaseLogger,
	containerNickname?: string,
): Promise<ContainerInfo> {
	// Initialize Tinylicious client
	const client = initializeTinyliciousClient(logger);

	console.log("Loading existing container...");
	let loadContainerResult: ContainerLoadResult;
	try {
		loadContainerResult = await client.getContainer(containerId, containerSchema);
	} catch (error) {
		console.error(`Encountered error loading Fluid container: "${error}".`);
		throw error;
	}
	console.log("Container loaded!");

	const { container } = loadContainerResult;

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
		containerNickname,
	};
}
