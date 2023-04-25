/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ContainerDevtoolsProps,
	IFluidDevtools,
	initializeFluidDevtools,
} from "@fluid-tools/client-debugger";
import { FluidContainer } from "@fluidframework/fluid-static";

import { IRouterliciousDevtools } from "./IRouterliciousDevtools";
import { RouterliciousDevtoolsProps } from "./RouterliciousDevtoolsProps";
import { RouterliciousContainerDevtoolsProps } from "./RouterliciousContainerDevtoolsProps";

/**
 * {@link IRouterliciousDevtools} implementation.
 *
 * @remarks
 *
 * TODO (e.g. do we talk about window messaging here?)
 *
 * @sealed
 * @internal
 */
export class RouterliciousDevtools
	// extends TypedEventEmitter<ContainerDevtoolsEvents>
	implements IRouterliciousDevtools
{
	/**
	 * Inner Devtools instance.
	 */
	private readonly _devtools: IFluidDevtools;

	public constructor(_devtools: IFluidDevtools) {
		// super();

		this._devtools = _devtools;
	}

	/**
	 * {@inheritDoc IRouterliciousDevtools.registerContainerDevtools}
	 */
	public registerContainerDevtools(containerProps: RouterliciousContainerDevtoolsProps): void {
		const mappedContainerProps = mapContainerProps(containerProps);
		if (mappedContainerProps !== undefined) {
			this._devtools.registerContainerDevtools(mappedContainerProps);
		}
	}

	/**
	 * {@inheritDoc IRouterliciousDevtools.dispose}
	 */
	public dispose(): void {
		this._devtools.dispose();
	}

	/**
	 * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._devtools.disposed;
	}
}

/**
 * TODO
 *
 * @public
 */
export function initializeDevtools(props: RouterliciousDevtoolsProps): IRouterliciousDevtools {
	const { initialContainers, logger } = props;

	let mappedInitialContainers: ContainerDevtoolsProps[] | undefined;
	if (initialContainers !== undefined) {
		mappedInitialContainers = [];
		for (const containerProps of initialContainers) {
			const mappedContainerProps = mapContainerProps(containerProps);
			if (mappedContainerProps !== undefined) {
				mappedInitialContainers.push(mappedContainerProps);
			}
		}
	}

	const innerDevtools = initializeFluidDevtools({
		logger,
		initialContainers: mappedInitialContainers,
	});

	return new RouterliciousDevtools(innerDevtools);
}

function mapContainerProps(
	containerProps: RouterliciousContainerDevtoolsProps,
): ContainerDevtoolsProps | undefined {
	const { container, containerId, containerNickname, dataVisualizers } = containerProps;
	const fluidContainer = container as FluidContainer;

	if (fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE === undefined) {
		console.error("Missing Container accessor on FluidContainer.");
		return undefined;
	}

	const innerContainer = fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE();
	return {
		container: innerContainer,
		containerId,
		containerNickname,
		containerData: container.initialObjects,
		dataVisualizers,
	};
}
