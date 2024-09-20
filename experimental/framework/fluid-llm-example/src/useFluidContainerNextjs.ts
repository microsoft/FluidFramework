"use client";

import { useEffect, useState } from "react";
import { IFluidContainer, type ContainerSchema } from "@fluidframework/fluid-static";
import { useSearchParams, useRouter } from "next/navigation";
import { createNewFluidContainerV2, getExistingFluidContainerV2 } from "./useFluidContainer";

/**
 * A simple hook to manage the initialization lifecycle of a Fluid container.
 */
export function useFluidContainerNextJs<T extends ContainerSchema, V>(
	containerSchema: T,
	initializeFunction: (container: IFluidContainer<T>) => V,
	getExistingData: (container: IFluidContainer<T>) => V,
) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [containerId, setContainerId] = useState<string | undefined>(
		searchParams.get("fluidContainerId") ?? undefined,
	);
	const [container, setContainer] = useState<IFluidContainer<T>>();
	const [isFluidInitialized, setIsFluidInitialized] = useState(false);
	const [data, setData] = useState<V>();

	// TODO: Support the container id being updated without a page refresh.
	useEffect(() => {
		if (!isFluidInitialized) {
			if (containerId !== undefined) {
				console.log("loading existing container");
				const init = async () => {
					const { container, data } = await getExistingFluidContainerV2(
						containerId,
						containerSchema,
						getExistingData,
					);
					setContainer(container);
					setData(data);
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
				};
				init();
			}
			setIsFluidInitialized(true);
		}

		// Maintains fluid container id within the url as a query parameter.
		if (
			isFluidInitialized === true &&
			containerId !== undefined &&
			containerId !== searchParams.get("fluidContainerId")
		) {
			router.replace(`${window.location}?fluidContainerId=${containerId}`);
			// TODO: reconnect to the new container if id changes without page refresh?.
		}
	}, [containerId]);

	return {
		container,
		containerId,
		isFluidInitialized,
		data,
	};
}
