/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Used in conjunction with the Fluid Framework Developer Tools browser extension to allow visualization of
 * and interaction with Fluid data.
 *
 * To initialize the Devtools alongside your application's {@link @fluidframework/fluid-static#IFluidContainer}, call
 * {@link initializeDevtools}.
 *
 * The Devtools will automatically dispose of themselves upon Window unload, but if you would like to close them
 * earlier, call {@link IDevtools.dispose}.
 *
 * To enable visualization of Telemetry data, you may create a {@link DevtoolsLogger} and
 * provide it during Devtools initialization.
 *
 * For more details and examples, see the {@link https://github.com/microsoft/FluidFramework/tree/main/packages/tools/devtools/devtools | package README}.
 *
 * @packageDocumentation
 */

import type {
	IDisposable,
	IFluidLoadable,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import {
	type ContainerDevtoolsProps as ContainerDevtoolsPropsBase,
	type HasContainerKey,
	type IFluidDevtools as IDevtoolsBase,
	type IDevtoolsLogger,
	type IFluidDevtools,
	initializeDevtools as initializeDevtoolsBase,
} from "@fluidframework/devtools-core/internal";
import type { IFluidContainer } from "@fluidframework/fluid-static";
import { isInternalFluidContainer } from "@fluidframework/fluid-static/internal";

/**
 * Properties for configuring {@link IDevtools}.
 *
 * @sealed
 * @beta
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
	readonly logger?: IDevtoolsLogger;

	/**
	 * (optional) List of Containers to initialize the devtools with.
	 *
	 * @remarks Additional Containers can be registered with the Devtools via {@link IDevtools.registerContainerDevtools}.
	 */
	readonly initialContainers?: ContainerDevtoolsProps[];

	// TODO: Add ability for customers to specify custom data visualizer overrides
}

/**
 * Properties for configuring Devtools for an individual {@link @fluidframework/fluid-static#IFluidContainer}.
 *
 * @sealed
 * @beta
 */
export interface ContainerDevtoolsProps extends HasContainerKey {
	/**
	 * The Container to register with the Devtools.
	 */
	readonly container: IFluidContainer;

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
 *
 * @sealed
 * @beta
 */
export interface IDevtools extends IDisposable {
	/**
	 * Initializes a {@link IDevtools} from the provided properties and stores it for future reference.
	 *
	 * @throws
	 *
	 * Will throw if devtools have already been registered for the specified
	 * {@link @fluidframework/devtools-core#HasContainerKey.containerKey}.
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
		this._devtools.registerContainerDevtools(mappedProps);
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
 * @see {@link @fluidframework/devtools-core#initializeDevtoolsBase}
 *
 * @beta
 */
export function initializeDevtools(props: DevtoolsProps): IDevtools {
	const { initialContainers, logger } = props;

	const mappedInitialContainers = initialContainers?.map((p) => mapContainerProps(p));

	const baseDevtools = initializeDevtoolsBase({
		logger,
		initialContainers: mappedInitialContainers,
	});
	return new Devtools(baseDevtools);
}

/**
 * Maps the input props to lower-level {@link @fluidframework/devtools-core#ContainerDevtoolsPropsBase},
 * to be forwarded on to the base library.
 */
function mapContainerProps(
	containerProps: ContainerDevtoolsProps,
): ContainerDevtoolsPropsBase {
	const { container, containerKey } = containerProps;
	if (!isInternalFluidContainer(container)) {
		throw new TypeError(
			"IFluidContainer was not recognized. Only Containers generated by the Fluid Framework are supported.",
		);
	}

	return {
		container: container.container,
		containerKey,
		containerData: container.initialObjects as Record<string, IFluidLoadable>,
	};
}

/**
 * Attempts to retrieve the global Fluid Devtools instance, initializing it if it's not exists.
 * @beta
 */
export function tryGetIFluidDevtools(logger?: ITelemetryBaseLogger): IFluidDevtools {
	if (globalThis.IFluidDevtools === undefined) {
		globalThis.IFluidDevtools = initializeDevtools({ logger });
	}
	return globalThis.IFluidDevtools;
}

// Convenience re-exports. Need to cover the things we export form this package,
// so consumers don't need to import from this one *and* devtools-core.
// DevtoolsLogger is necessary for consumers to set up Devtools.
// ContainerDevtoolsProps extends HasContainerKey, so it needs ContainerKey.
export {
	type ContainerKey,
	type HasContainerKey,
	createDevtoolsLogger,
	type IDevtoolsLogger,
} from "@fluidframework/devtools-core/internal";
