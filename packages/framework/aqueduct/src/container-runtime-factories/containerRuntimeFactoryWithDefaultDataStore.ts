/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDependencySynthesizer } from "@fluidframework/synthesize";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { FluidObject } from "@fluidframework/core-interfaces";
import { defaultRouteRequestHandler } from "../request-handlers";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultDataStoreId = "default";

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultDataStore extends BaseContainerRuntimeFactory {
	public static readonly defaultDataStoreId = defaultDataStoreId;

	/**
	 * Constructor
	 * @param defaultFactory -
	 * @param registryEntries -
	 * @param dependencyContainer - deprecated, will be removed in a future release
	 * @param requestHandlers -
	 * @param runtimeOptions -
	 * @param initializeEntryPoint -
	 */
	constructor(
		protected readonly defaultFactory: IFluidDataStoreFactory,
		registryEntries: NamedFluidDataStoreRegistryEntries,
		dependencyContainer?: IFluidDependencySynthesizer,
		requestHandlers: RuntimeRequestHandler[] = [],
		runtimeOptions?: IContainerRuntimeOptions,
		initializeEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>,
	) {
		super(
			registryEntries,
			dependencyContainer,
			[defaultRouteRequestHandler(defaultDataStoreId), ...requestHandlers],
			runtimeOptions,
			initializeEntryPoint,
		);
	}

	/**
	 * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const dataStore = await runtime.createDataStore(this.defaultFactory.type);
		await dataStore.trySetAlias(defaultDataStoreId);
	}
}
