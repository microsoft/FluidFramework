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

const getDefaultFluidObject = async (runtime: IContainerRuntime) => {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new Error("default dataStore must exist");
	}
	return entryPoint.get();
};

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 */
export class ContainerRuntimeFactoryWithDefaultDataStore extends BaseContainerRuntimeFactory {
	public static readonly defaultDataStoreId = defaultDataStoreId;

	protected readonly defaultFactory: IFluidDataStoreFactory;

	/**
	 * Constructor
	 * @param defaultFactory -
	 * @param registryEntries -
	 * @param dependencyContainer - deprecated, will be removed in a future release
	 * @param requestHandlers -
	 * @param runtimeOptions -
	 * @param initializeEntryPoint -
	 */
	constructor(props: {
		defaultFactory: IFluidDataStoreFactory;
		registryEntries: NamedFluidDataStoreRegistryEntries;
		dependencyContainer?: IFluidDependencySynthesizer;
		requestHandlers?: RuntimeRequestHandler[];
		runtimeOptions?: IContainerRuntimeOptions;
		initializeEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>;
	}) {
		const requestHandlers = props.requestHandlers ?? [];
		const initializeEntryPoint = props.initializeEntryPoint ?? getDefaultFluidObject;

		super({
			...props,
			requestHandlers: [defaultRouteRequestHandler(defaultDataStoreId), ...requestHandlers],
			initializeEntryPoint,
		});

		this.defaultFactory = props.defaultFactory;
	}

	/**
	 * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
		const dataStore = await runtime.createDataStore(this.defaultFactory.type);
		await dataStore.trySetAlias(defaultDataStoreId);
	}
}
