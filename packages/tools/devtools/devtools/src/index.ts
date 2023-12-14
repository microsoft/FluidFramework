/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Primary entry-point to the Fluid Devtools.
 *
 * To initialize the Devtools alongside your application's {@link @fluidframework/fluid-static#IFluidContainer}, call
 * {@link initializeDevtools}.
 *
 * The Devtools will automatically dispose of themselves upon Window unload, but if you would like to close them
 * earlier, call {@link IDevtools.dispose}.
 *
 * To enable visualization of Telemetry data, you may create a {@link @fluid-experimental/devtools-core#DevtoolsLogger} and
 * provide it during Devtools initialization.
 *
 * @packageDocumentation
 */

import {
	type ContainerDevtoolsProps as ContainerDevtoolsPropsBase,
	type IFluidDevtools as IDevtoolsBase,
	initializeDevtools as initializeDevtoolsBase,
	type IDevtoolsLogger,
	type HasContainerKey,
} from "@fluid-experimental/devtools-core";
import { type IDisposable } from "@fluidframework/core-interfaces";
import { type IFluidContainer } from "@fluidframework/fluid-static";
import { type IContainer } from "@fluidframework/container-definitions";

/**
 * Properties for configuring {@link IDevtools}.
 * @internal
 */
export interface DevtoolsProps {
	/**
	 * (optional) telemetry logger associated with the Fluid runtime.
	 *
	 * @remarks
	 *
	 * Note: the Devtools do not register this logger with the Fluid runtime; that must be done separately.
	 *
	 * This is provided to the Devtools instance strictly to enable communicating supported / desired functionality with
	 * external listeners.
	 */
	logger?: IDevtoolsLogger;

	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IDevtools.registerContainerDevtools}.
	 */
	initialContainers?: ContainerDevtoolsProps[];

	// TODO: Add ability for customers to specify custom data visualizer overrides
}

/**
 * Properties for configuring Devtools for an individual {@link @fluidframework/fluid-static#IFluidContainer}.
 * @internal
 */
export interface ContainerDevtoolsProps extends HasContainerKey {
	/**
	 * The Container to register with the Devtools.
	 */
	container: IFluidContainer;

	// TODO: Add ability for customers to specify custom data visualizer overrides
}

/**
 * Fluid Devtools. A single, global instance is used to generate and communicate stats associated with the general Fluid
 * runtime (i.e., it is not associated with any single Framework entity).
 *
 * @remarks
 *
 * Supports registering {@link @fluidframework/fluid-static#IFluidContainer}s for Container-level stats
 * (via {@link IDevtools.registerContainerDevtools}).
 *
 * The lifetime of the associated singleton is bound by that of the Window (globalThis), and it will be automatically
 * disposed of on Window unload.
 * If you wish to dispose of it earlier, you may call its {@link @fluidframework/core-interfaces#IDisposable.dispose} method.
 * @internal
 */
export interface IDevtools extends IDisposable {
	/**
	 * Initializes a {@link IDevtools} from the provided properties and stores it for future reference.
	 *
	 * @throws
	 *
	 * Will throw if devtools have already been registered for the specified
	 * {@link @fluid-experimental/devtools-core#HasContainerKey.containerKey}.
	 */
	registerContainerDevtools(props: ContainerDevtoolsProps): void;

	/**
	 * Closes registered Container-level Devtools associated with the provided ID.
	 */
	closeContainerDevtools(id: string): void;
}

class Devtools implements IDevtools {
	public constructor(
		/**
		 * Handle to the underlying Devtools instance (singleton).
		 */
		private readonly _devtools: IDevtoolsBase,
	) {}

	/**
	 * {@inheritDoc IDevtools.registerContainerDevtools}
	 */
	public registerContainerDevtools(props: ContainerDevtoolsProps): void {
		const mappedProps = mapContainerProps(props);
		if (mappedProps !== undefined) {
			this._devtools.registerContainerDevtools(mappedProps);
		}
	}

	/**
	 * {@inheritDoc IDevtools.closeContainerDevtools}
	 */
	public closeContainerDevtools(id: string): void {
		this._devtools.closeContainerDevtools(id);
	}

	/**
	 * {@inheritDoc IDevtools.disposed}
	 */
	public get disposed(): boolean {
		return this._devtools.disposed;
	}

	/**
	 * {@inheritDoc IDevtools.dispose}
	 */
	public dispose(): void {
		this._devtools.dispose();
	}
}

/**
 * Initializes the Devtools singleton and returns a handle to it.
 *
 * @see {@link @fluid-experimental/devtools-core#initializeDevtoolsBase}
 * @internal
 */
export function initializeDevtools(props: DevtoolsProps): IDevtools {
	const { initialContainers, logger } = props;

	let mappedInitialContainers: ContainerDevtoolsPropsBase[] | undefined;
	if (initialContainers !== undefined) {
		mappedInitialContainers = [];
		for (const containerProps of initialContainers) {
			const mappedContainerProps = mapContainerProps(containerProps);
			if (mappedContainerProps !== undefined) {
				mappedInitialContainers.push(mappedContainerProps);
			}
		}
	}

	const baseDevtools = initializeDevtoolsBase({
		logger,
		initialContainers: mappedInitialContainers,
	});
	return new Devtools(baseDevtools);
}

/**
 * Maps the input props to lower-level {@link @fluid-experimental/devtools-core#ContainerDevtoolsPropsBase},
 * to be forwarded on to the base library.
 */
function mapContainerProps(
	containerProps: ContainerDevtoolsProps,
): ContainerDevtoolsPropsBase | undefined {
	const { container, containerKey } = containerProps;
	const fluidContainer = container as { INTERNAL_CONTAINER_DO_NOT_USE?: () => IContainer };

	if (fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE === undefined) {
		console.error("Missing Container accessor on FluidContainer.");
		return undefined;
	}

	const innerContainer = fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE();
	return {
		container: innerContainer,
		containerKey,
		containerData: container.initialObjects,
	};
}

// Convenience re-exports. Need to cover the things we export form this package,
// so consumers don't need to import from this one *and* devtools-core.
// DevtoolsLogger is necessary for consumers to set up Devtools.
// ContainerDevtoolsProps extends HasContainerKey, so it needs ContainerKey.
export { type ContainerKey, type HasContainerKey } from "@fluid-experimental/devtools-core";
export { createDevtoolsLogger, type IDevtoolsLogger } from "@fluid-experimental/devtools-core";
