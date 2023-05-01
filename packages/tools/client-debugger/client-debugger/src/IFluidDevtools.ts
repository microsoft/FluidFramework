/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDisposable } from "@fluidframework/common-definitions";

import { ContainerDevtoolsProps } from "./ContainerDevtools";

/**
 * Fluid Devtools. A single instance is used to generate and communicate stats associated with the general Fluid
 * runtime (i.e., it is not associated with any single Framework entity).
 *
 * @remarks
 *
 * Supports registering {@link @fluidframework/container-definitions#IContainer}s for Container-level stats
 * (via {@link IFluidDevtools.registerContainerDevtools}).
 *
 * @public
 */
export interface IFluidDevtools extends IDisposable {
	/**
	 * Registers the provided {@link @fluidframework/container-definitions#IContainer} with the Devtools to begin
	 * generating stats for it.
	 *
	 * @remarks To remove the Container from the Devtools, call {@link IFluidDevtools.closeContainerDevtools}.
	 *
	 * @throws Will throw if devtools have already been registered for the specified Container ID.
	 */
	registerContainerDevtools(props: ContainerDevtoolsProps): void;

	/**
	 * Removes the Container with the specified ID from the Devtools.
	 *
	 * @remarks Will no-op if no such Container is registered.
	 */
	closeContainerDevtools(containerId: string): void;
}
