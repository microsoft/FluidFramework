/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";

/**
 * ! Note: This function is purely needed for back-compat as the constructor argument structure was changed
 */
export const createContainerRuntimeFactoryWithDefaultDataStore = (
	Base: typeof ContainerRuntimeFactoryWithDefaultDataStore = ContainerRuntimeFactoryWithDefaultDataStore,
	ctorArgs: {
		defaultFactory: IFluidDataStoreFactory;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		dependencyContainer?: any;
		requestHandlers?: RuntimeRequestHandler[];
		runtimeOptions?: IContainerRuntimeOptions;
		provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>;
	},
): ContainerRuntimeFactoryWithDefaultDataStore => {
	try {
		return new Base(ctorArgs);
	} catch (err) {
		// IMPORTANT: The constructor argument structure changed, so this is needed for dynamically using older ContainerRuntimeFactoryWithDefaultDataStore's
		const {
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
		} = ctorArgs;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return new (Base as any)(
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
		);
	}
};
