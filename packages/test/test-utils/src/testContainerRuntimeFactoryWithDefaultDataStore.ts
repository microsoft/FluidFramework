/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { UsageError } from "@fluidframework/telemetry-utils";

const getDefaultFluidObject = async (runtime: IContainerRuntime) => {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new UsageError("default dataStore must exist");
	}
	return entryPoint.get();
};

export const createTestContainerRuntimeFactoryWithDefaultDataStore = (
	Base: typeof ContainerRuntimeFactoryWithDefaultDataStore = ContainerRuntimeFactoryWithDefaultDataStore,
	ctorArgs: {
		defaultFactory: IFluidDataStoreFactory;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		dependencyContainer?: any;
		requestHandlers?: RuntimeRequestHandler[];
		runtimeOptions?: IContainerRuntimeOptions;
	},
): TestContainerRuntimeFactoryWithDefaultDataStore => {
	try {
		return new Base({
			...ctorArgs,
			initializeEntryPoint: getDefaultFluidObject,
		});
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
			getDefaultFluidObject,
		);
	}
};

export class TestContainerRuntimeFactoryWithDefaultDataStore extends ContainerRuntimeFactoryWithDefaultDataStore {
	/**
	 * Constructor
	 * @param defaultFactory -
	 * @param registryEntries -
	 * @param dependencyContainer - deprecated, will be removed in a future release
	 * @param requestHandlers -
	 * @param runtimeOptions -
	 */
	constructor(props: {
		defaultFactory: IFluidDataStoreFactory;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		dependencyContainer?: any;
		requestHandlers?: RuntimeRequestHandler[];
		runtimeOptions?: IContainerRuntimeOptions;
	}) {
		super({
			...props,
			initializeEntryPoint: getDefaultFluidObject,
		});
	}
}
