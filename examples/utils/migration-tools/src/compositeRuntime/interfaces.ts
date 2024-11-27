/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";

/**
 * @alpha
 */
export interface IEntryPointPiece {
	readonly name: string;
	readonly registryEntries: NamedFluidDataStoreRegistryEntries;
	readonly onCreate: (runtime: IContainerRuntime) => Promise<void>;
	readonly onLoad: (runtime: IContainerRuntime) => Promise<void>;
	readonly createPiece: (runtime: IContainerRuntime) => Promise<FluidObject>;
}
