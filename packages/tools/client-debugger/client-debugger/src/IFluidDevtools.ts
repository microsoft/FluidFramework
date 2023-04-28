/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable } from "@fluidframework/common-definitions";

import { ContainerDevtoolsProps } from "./ContainerDevtools";
import { DevtoolsLogger } from "./DevtoolsLogger";
import { IContainerDevtools } from "./IContainerDevtools";

/**
 * Fluid Devtools. A single instance is used to generate and communicate stats associated with the general Fluid
 * runtime (i.e., it is not associated with any single Framework entity).
 *
 * @remarks
 *
 * Supports registering {@link IContainerDevtools | Container-level Devtools} objects for specific
 * {@link @fluidframework/container-definitions#IContainer}s (via {@link IFluidDevtools.registerContainerDevtools}).
 *
 * @public
 */
export interface IFluidDevtools extends IDisposable {
	/**
	 * (optional) telemetry logger associated with the Fluid runtime.
	 */
	readonly logger: DevtoolsLogger | undefined;

	/**
	 * Initializes a {@link IContainerDevtools} from the provided properties and stores it for future reference.
	 *
	 * @throws Will throw if devtools have already been registered for the specified Container ID.
	 */
	registerContainerDevtools(props: ContainerDevtoolsProps): void;

	/**
	 * Closes ({@link IContainerDevtools.dispose | disposes}) a registered Container devtools associated with the
	 * provided Container ID.
	 */
	closeContainerDevtools(containerId: string): void;

	/**
	 * Gets the registed Container Devtools associated with the provided Container ID, if one exists.
	 * Otherwise returns `undefined`.
	 */
	getContainerDevtools(containerId: string): IContainerDevtools | undefined;

	/**
	 * Gets all Container-level devtools instances.
	 */
	getAllContainerDevtools(): readonly IContainerDevtools[];
}
