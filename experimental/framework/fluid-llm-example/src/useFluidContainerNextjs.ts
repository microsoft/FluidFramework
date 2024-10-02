"use client";

import { useEffect, useState } from "react";
import { IFluidContainer, type ContainerSchema } from "@fluidframework/fluid-static";
// import { useSearchParams, useRouter } from "next/navigation";
import type { OdspClient } from "@fluidframework/odsp-client/beta";

export async function createNewFluidContainerV2<T extends ContainerSchema, V>(
	odspClient: OdspClient,
	containerSchema: T,
	initializeFunction: (container: IFluidContainer<T>) => V,
	attachCallback: (container: IFluidContainer<T>, containerId: string) => void,
) {
	console.log("Creating a new container");

	const { container } = await odspClient.createContainer(containerSchema);
	const intialData = initializeFunction(container);

	const id = await container.attach();
	await attachCallback?.(container, id);

	return { id, container, data: intialData };
}

export async function getExistingFluidContainerV2<T extends ContainerSchema, V>(
	odspClient: OdspClient,
	id: string,
	containerSchema: T,
	getExistingData: (container: IFluidContainer<T>) => V,
) {
	console.log(`attempting to get container with id '${id}'`);
	const res = await odspClient.getContainer(id, containerSchema);

	if (!res) {
		throw new Error("Failed to load from existing container.");
	}

	const existingData = getExistingData(res.container);

	return { container: res.container, data: existingData };
}

/**
 * A simple hook to manage the initialization lifecycle of a Fluid container.
 */
export function useFluidContainerNextJs<T extends ContainerSchema, V>(
	odspClient: OdspClient,
	inputContainerId: string,
	containerSchema: T,
	initializeFunction: (container: IFluidContainer<T>) => V,
	attachCallback: (container: IFluidContainer<T>, containerId: string) => void,
	getExistingData: (container: IFluidContainer<T>) => V,
) {
	const [containerId, setContainerId] = useState<string>(inputContainerId);
	const [container, setContainer] = useState<IFluidContainer<T>>();
	const [isFluidInitialized, setIsFluidInitialized] = useState(false);
	const [data, setData] = useState<V>();

	// TODO: Support the container id being updated without a page refresh.
	useEffect(() => {
		if (!isFluidInitialized) {
			let init: () => Promise<{container:IFluidContainer<T>, containerId: string, data: V}>;
			if (containerId.length > 0) {
				console.log("loading existing container");
				init = async () => {
					const { container, data } = await getExistingFluidContainerV2(
						odspClient,
						containerId,
						containerSchema,
						getExistingData,
					);

					return {container, containerId, data};
				};
			} else {
				init = async () => {
					const { container, id, data } = await createNewFluidContainerV2(
						odspClient,
						containerSchema,
						initializeFunction,
						attachCallback,
					);

					return {container, containerId: id, data};
				};
			}

			init().then((initResult: { container: IFluidContainer<T>, containerId: string, data: V}) => {
				setIsFluidInitialized(true);
				setContainerId(initResult.containerId);
				setContainer(initResult.container);
				setData(initResult.data);
			});
		}
	}, [containerId]);

	return {
		container,
		containerId,
		isFluidInitialized,
		data,
	};
}
