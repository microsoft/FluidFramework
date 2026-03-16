/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createLogger } from "@fluidframework/app-insights-logger/beta";
import { ConnectionState } from "@fluidframework/container-loader";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { LeveeClient, type LeveeContainerServices } from "@tylerbu/levee-client";

/**
 * This module contains Fluid Client utilities, including Container creation / loading.
 */

/**
 * Type returned from when creating / loading the Container.
 */
export interface ContainerLoadResult {
	container: IFluidContainer;
	services: LeveeContainerServices;
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
}

function initializeLeveeClient(): LeveeClient {
	const appInsightsClient = new ApplicationInsights({
		config: {
			connectionString:
				// Edit this with your app insights instance connection string (this is an example string)
				"InstrumentationKey=abcdefgh-ijkl-mnop-qrst-uvwxyz6ffd9c;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/",
		},
	});

	appInsightsClient.loadAppInsights();

	const userId = Math.random().toString(36).slice(2);
	return new LeveeClient({
		connection: {
			httpUrl: "http://localhost:4000",
			tenantKey: "dev-tenant-secret-key",
			user: { id: userId, name: `User-${userId}` },
		},
		logger: createLogger(appInsightsClient),
	});
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
	const client = initializeLeveeClient();

	// Create the container
	console.log("Creating new container...");
	let createContainerResult: ContainerLoadResult;
	try {
		createContainerResult = await client.createContainer(containerSchema, "2");
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
	};
}

/**
 * Loads an existing Container for the given ID.
 *
 * @param containerId - The unique ID of the existing Fluid Container being loaded.
 * @param containerSchema - Schema with which to load the Container.
 *
 * @throws If no container exists with the specified ID, or if loading / connecting fails for any reason.
 */
export async function loadExistingFluidContainer(
	containerId: string,
	containerSchema: ContainerSchema,
): Promise<ContainerInfo> {
	// Initialize Tinylicious client
	const client = initializeLeveeClient();

	console.log("Loading existing container...");
	let loadContainerResult: ContainerLoadResult;
	try {
		loadContainerResult = await client.getContainer(containerId, containerSchema, "2");
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
	};
}
