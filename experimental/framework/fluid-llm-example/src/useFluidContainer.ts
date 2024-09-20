/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { useEffect, useState } from "react";
import { IFluidContainer, type ContainerSchema } from "@fluidframework/fluid-static";
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/alpha";

let FLUID_CLIENT: TinyliciousClient;

function getClient() {
	if (!FLUID_CLIENT) {
		FLUID_CLIENT = new TinyliciousClient({});
	}
	return FLUID_CLIENT;
}

// export async function createNewFluidContainer() {
// 	const client = getClient();
// 	console.log("Creating a new container");

// 	const { container } = await client.createContainer(CONTAINER_SCHEMA, "2");

// 	const sharedTree = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
// 	sharedTree.initialize(new SharedTreeAppState(INITIAL_APP_STATE));

// 	const id = await container.attach();

// 	return { id, container };
// }

// export async function getExistingFluidContainer(id: string) {
// 	console.log("attempting to get container with id", id);
// 	const res = await getClient().getContainer(id, CONTAINER_SCHEMA, "2");

// 	if (!res) {
// 		throw new Error("Failed to load from existing container.");
// 	}

// 	const { container } = res;
// 	const sharedTree = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
// 	return { container: res.container, sharedTree };
// }

export async function createNewFluidContainerV2<T extends ContainerSchema, V>(
	containerSchema: T,
	initializeFunction: (container: IFluidContainer<T>) => V,
) {
	const client = getClient();
	console.log("Creating a new container");

	const { container } = await client.createContainer(containerSchema, "2");
	const intialData = initializeFunction(container);

	const id = await container.attach();

	return { id, container, data: intialData };
}

export async function getExistingFluidContainerV2<T extends ContainerSchema, V>(
	id: string,
	containerSchema: T,
	getExistingData: (container: IFluidContainer<T>) => V,
) {
	console.log("attempting to get container with id", id);
	const res = await getClient().getContainer(id, containerSchema, "2");

	if (!res) {
		throw new Error("Failed to load from existing container.");
	}

	const existingData = getExistingData(res.container);

	return { container: res.container, data: existingData };
}

/**
 * A simple hook to manage the initialization lifecycle of a Fluid container.
 */
export function useFluidContainer<T extends ContainerSchema, V>(
	containerSchema: T,
	initalContainerId: string | null,
	initializeFunction: (container: IFluidContainer<T>) => V,
	getExistingData: (container: IFluidContainer<T>) => V,
	useDevtools: boolean = false,
) {
	const [containerId, setContainerId] = useState<string | null>(initalContainerId);
	const [container, setContainer] = useState<IFluidContainer<T>>();
	const [isFluidInitialized, setIsFluidInitialized] = useState(false);
	const [data, setData] = useState<V>();

	// TODO: Support the container id being updated without a page refresh.
	useEffect(() => {
		if (!isFluidInitialized) {
			if (containerId !== null) {
				console.log("loading existing container");
				const init = async () => {
					const { container, data } = await getExistingFluidContainerV2(
						containerId,
						containerSchema,
						getExistingData,
					);
					setContainer(container);
					setData(data);

					if (useDevtools) {
						const devtoolsLogger = createDevtoolsLogger();
						initializeDevtools({
							logger: devtoolsLogger,
							initialContainers: [
								{
									container,
									containerKey: "My Container",
								},
							],
						});
					}
				};
				init();
			} else {
				const init = async () => {
					const { container, id, data } = await createNewFluidContainerV2(
						containerSchema,
						initializeFunction,
					);
					setContainer(container);
					setContainerId(id);
					setData(data);

					if (useDevtools) {
						const devtoolsLogger = createDevtoolsLogger();
						initializeDevtools({
							logger: devtoolsLogger,
							initialContainers: [
								{
									container,
									containerKey: "My Container",
								},
							],
						});
					}
				};
				init();
			}
			setIsFluidInitialized(true);
		}
	}, [containerId]);

	return {
		container,
		containerId,
		isFluidInitialized,
		data,
	};
}
