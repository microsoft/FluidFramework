/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";

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
				initializeEntryPoint: () => {
					throw new Error("TODO");
				},
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
			initializeEntryPoint: () => {
				throw new Error("TODO");
			},
		});
	}
}
