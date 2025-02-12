/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import { RuntimeRequestHandler } from "@fluidframework/request-handler/internal";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";

import { ContainerRuntimeFactoryWithDefaultDataStore } from "./container-runtime-factories/index.js";

const getDefaultFluidObject = async (runtime: IContainerRuntime) => {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new Error("default dataStore must exist");
	}
	return entryPoint.get();
};

/**
 * ! Note: This function is purely needed for back-compat as the constructor argument structure was changed
 * @internal
 */
export const createContainerRuntimeFactoryWithDefaultDataStore = (
	Base: typeof ContainerRuntimeFactoryWithDefaultDataStore = ContainerRuntimeFactoryWithDefaultDataStore,
	ctorArgs: {
		defaultFactory: IFluidDataStoreFactory;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		dependencyContainer?: any;
		// eslint-disable-next-line import/no-deprecated
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
			provideEntryPoint,
		} = ctorArgs;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return new (Base as any)(
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint ?? getDefaultFluidObject,
		);
	}
};
