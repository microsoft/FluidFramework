/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@fluidframework/container-loader";
import { type IContainer } from "@fluidframework/container-definitions";
import { type IDevtoolsLogger } from "@fluid-experimental/devtools-core";
import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";
import { type AppData } from "./FluidObject";
import { RuntimeFactory, type IAppModel } from "./Container";

/**
 * This module contains Fluid Client utilities, including Container creation / loading.
 */

/**
 * Basic information about the container, as well as the associated audience.
 */
export interface ContainerInfo {
	/**
	 * The initialized Container.
	 */
	container: IContainer;

	/**
	 * The Container's unique ID. Also referred to as the "Document ID".
	 */
	containerId: string;

	/**
	 * App objects for the Container.
	 */
	appData: AppData;
}

/**
 * Creates a new Container from the provided client and container schema.
 */
export function createLoader(logger?: IDevtoolsLogger): SessionStorageModelLoader<IAppModel> {
	const codeLoader = new StaticCodeLoader(new RuntimeFactory());
	const loader = new SessionStorageModelLoader<IAppModel>(codeLoader, logger);

	return loader;
}

/**
 * Creates a new Fluid Container from the provided client and container schema.
 *
 * @param loader - The Loader to use for loading an existing Container or creating a new one.
 *
 * @throws If container creation or attaching fails for any reason.
 */
export async function createContainer(
	loader: SessionStorageModelLoader<IAppModel>,
): Promise<ContainerInfo> {
	// Create the container and attach it
	console.log("Creating new container...");
	let model: IAppModel;
	let containerId: string;
	try {
		const createResponse = await loader.createDetached("1.0");
		containerId = await createResponse.attach();
		model = createResponse.model;
	} catch (error) {
		console.error("Encountered error creating Fluid container:", error);
		throw error;
	}
	console.log("Container created!");

	return { container: model.container, containerId, appData: model.appData };
}

/**
 * Loads an existing Container for the given ID.
 *
 * @param containerId - The unique ID of the existing Fluid Container being loaded.
 * @param containerSchema - Schema with which to load the Container.
 * @param logger - (optional) Telemetry logger to provide to client initialization.
 *
 * @throws If no container exists with the specified ID, or if loading / connecting fails for any reason.
 */
export async function loadExistingContainer(
	containerId: string,
	loader: SessionStorageModelLoader<IAppModel>,
): Promise<ContainerInfo> {
	console.log("Loading existing container...");
	let model: IAppModel;
	try {
		model = await loader.loadExisting(containerId);
	} catch (error) {
		console.error(`Encountered error loading Fluid container: "${error}".`);
		throw error;
	}
	console.log("Container loaded!");
	const container = model.container;

	if (container.connectionState !== ConnectionState.Connected) {
		console.log("Connecting to container...");
		await new Promise<void>((resolve) => {
			container.once("connected", () => {
				resolve();
			});
		});
		console.log("Connected!");
	}

	return { container, containerId, appData: model.appData };
}
