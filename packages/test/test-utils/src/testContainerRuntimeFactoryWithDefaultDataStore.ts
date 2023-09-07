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

const getDefaultFluidObject = async (runtime: IContainerRuntime) => {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return (await runtime.getAliasedDataStoreEntryPoint?.("default"))!.get();
};

export const createTestContainerRuntimeFactoryWithDefaultDataStore = (
	Base: typeof ContainerRuntimeFactoryWithDefaultDataStore = ContainerRuntimeFactoryWithDefaultDataStore,
) =>
	class Factory extends Base {
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
	} as typeof TestContainerRuntimeFactoryWithDefaultDataStore;

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
