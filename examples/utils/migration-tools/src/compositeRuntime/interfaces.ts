/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";

/**
 * @alpha
 */
export interface IEntryPointPiece {
	readonly name: string;
	readonly registryEntries: NamedFluidDataStoreRegistryEntries;
	readonly onCreate: (runtime: IContainerRuntime) => Promise<void>;
	readonly onLoad: (runtime: IContainerRuntime) => Promise<void>;
	// TODO: Maybe FluidObject instead of unknown, to keep in the same style of getEntryPoint()?
	// TODO: Could this return unknown, instead of Promise<unknown>?
	readonly createPiece: (runtime: IContainerRuntime) => Promise<unknown>;
}
