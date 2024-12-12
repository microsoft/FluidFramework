/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";

/**
 * The IEntryPointPiece provides the functionality backing a portion of the overall composite entry point.
 * @alpha
 */
export interface IEntryPointPiece {
	/**
	 * The name of the piece, which corresponds to the eventual name of the property on the entryPoint
	 * where it will be made available.
	 */
	readonly name: string;
	/**
	 * The registry entries that should be added to the container runtime to support this entryPoint piece.
	 */
	readonly registryEntries: NamedFluidDataStoreRegistryEntries;
	/**
	 * Actions to take on the initial creation of the container.
	 */
	readonly onCreate: (runtime: IContainerRuntime) => Promise<void>;
	/**
	 * Actions to take on every load of the container.
	 */
	readonly onLoad: (runtime: IContainerRuntime) => Promise<void>;
	/**
	 * A function which produces the object to be made available on the entry point.
	 */
	readonly createPiece: (runtime: IContainerRuntime) => Promise<FluidObject>;
}
