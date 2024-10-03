"use client";

import { useEffect, useState } from "react";
import { IFluidContainer, type ContainerSchema } from "@fluidframework/fluid-static";

/**
 * A simple hook to manage the initialization lifecycle of a Fluid container.
 *
 * @param inputContainerId - The container id to load. If empty, a new container will be created.
 * @param createAndInitializeContainer - A function that creates a new container and initializes its initial objects.
 * This function *must not* attach the container. `useFluidContainerNextJs` will do it after calling this function.
 * @param postAttachCallback - A function that is called after a new container (if one was created) is attached.
 * @param loadExistingContainer - A function that loads an existing container.
 * @param getDataFromContainer - A function that retrieves the data from an existing container.
 */
export function useFluidContainerNextJs<T extends ContainerSchema, V>(
	inputContainerId: string,
	createAndInitializeContainer: () => Promise<IFluidContainer<T>>,
	postAttachCallback: (containerId: string, container: IFluidContainer<T>) => Promise<void> | undefined,
	loadExistingContainer: (id: string) => Promise<IFluidContainer<T>>,
	getDataFromContainer: (container: IFluidContainer<T>) => V,
) {
	const [containerId, setContainerId] = useState<string>(inputContainerId);
	const [container, setContainer] = useState<IFluidContainer<T>>();
	const [isFluidInitialized, setIsFluidInitialized] = useState(false);
	const [data, setData] = useState<V>();

	// TODO: Support the container id being updated without a page refresh.
	useEffect(() => {
		if (!isFluidInitialized) {
			let init: () => Promise<{container:IFluidContainer<T>, containerId: string}>;
			if (containerId.length > 0) {
				init = async () => {
					console.log(`Loading container with id '${containerId}'`);
					const container = await loadExistingContainer(containerId);
					return { container, containerId };
				};
			} else {
				init = async () => {
					console.log(`Creating new container`);
					const container = await createAndInitializeContainer();
					const id = await container.attach();
					postAttachCallback?.(id, container);
					return {container, containerId: id};
				};
			}

			init().then((initResult: { container: IFluidContainer<T>, containerId: string}) => {
				const data: V = getDataFromContainer(initResult.container);
				setIsFluidInitialized(true);
				setContainerId(initResult.containerId);
				setContainer(initResult.container);
				setData(data);
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
