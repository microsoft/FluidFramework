/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { IFluidContainer, type ContainerSchema } from "fluid-framework";
import { useEffect, useState } from "react";

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
	postAttachCallback: (
		containerId: string,
		container: IFluidContainer<T>,
	) => Promise<void> | undefined,
	loadExistingContainer: (id: string) => Promise<IFluidContainer<T>>,
	getDataFromContainer: (container: IFluidContainer<T>) => V,
): {
	container: IFluidContainer<T> | undefined;
	containerId: string | undefined;
	isFluidInitialized: boolean;
	data: V | undefined;
} {
	const [containerId, setContainerId] = useState<string>(inputContainerId);
	const [container, setContainer] = useState<IFluidContainer<T>>();
	const [isFluidInitialized, setIsFluidInitialized] = useState(false);
	const [data, setData] = useState<V>();

	// TODO: Support the container id being updated without a page refresh.
	useEffect(() => {
		if (!isFluidInitialized) {
			const init =
				containerId.length > 0
					? async () => {
							console.log(`Loading container with id '${containerId}'`);
							const containerInner = await loadExistingContainer(containerId);
							return { container: containerInner, containerId };
						}
					: async () => {
							console.log(`Creating new container`);
							const containerInner = await createAndInitializeContainer();
							const id = await containerInner.attach();
							await postAttachCallback?.(id, containerInner);
							return { container: containerInner, containerId: id };
						};

			// eslint-disable-next-line @typescript-eslint/no-floating-promises -- Inside a React effect we can't await promises
			init().then((initResult: { container: IFluidContainer<T>; containerId: string }) => {
				const dataInner: V = getDataFromContainer(initResult.container);
				setIsFluidInitialized(true);
				setContainerId(initResult.containerId);
				setContainer(initResult.container);
				setData(dataInner);
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
