/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { buildRuntimeRequestHandler, RuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	NamedFluidDataStoreRegistryEntries,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

const defaultStoreId = "" as const;

export class RuntimeFactory extends RuntimeFactoryHelper {
	private readonly registry: NamedFluidDataStoreRegistryEntries;

	constructor(
		private readonly defaultStoreFactory: IFluidDataStoreFactory,
		storeFactories: IFluidDataStoreFactory[] = [defaultStoreFactory],
		private readonly requestHandlers: RuntimeRequestHandler[] = [],
		private readonly initializeEntryPoint?: (
			runtime: IContainerRuntime,
		) => Promise<FluidObject>,
	) {
		super();
		this.registry = (
			storeFactories.includes(defaultStoreFactory)
				? storeFactories
				: storeFactories.concat(defaultStoreFactory)
		).map((factory) => [factory.type, factory]) as NamedFluidDataStoreRegistryEntries;
	}

	public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(this.defaultStoreFactory.type);
		await dataStore.trySetAlias(defaultStoreId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<ContainerRuntime> {
		const augment = this.initializeEntryPoint
			? { initializeEntryPoint: this.initializeEntryPoint }
			: { requestHandler: buildRuntimeRequestHandler(...this.requestHandlers) };

		const runtime: ContainerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: this.registry,
			existing,
			...augment,
		});

		return runtime;
	}
}
