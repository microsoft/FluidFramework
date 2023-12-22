/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import { RuntimeRequestHandler, buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import {
	NamedFluidDataStoreRegistryEntries,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";

const defaultStoreId = "" as const;

/**
 * @internal
 */
export class RuntimeFactory extends RuntimeFactoryHelper {
	private readonly registry: NamedFluidDataStoreRegistryEntries;

	private readonly defaultStoreFactory: IFluidDataStoreFactory;
	private readonly requestHandlers: RuntimeRequestHandler[];
	private readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;

	constructor(props: {
		defaultStoreFactory: IFluidDataStoreFactory;
		storeFactories: IFluidDataStoreFactory[];
		/** @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md */
		requestHandlers?: RuntimeRequestHandler[];
		provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;
	}) {
		super();

		this.defaultStoreFactory = props.defaultStoreFactory;
		this.provideEntryPoint = props.provideEntryPoint;
		this.requestHandlers = props.requestHandlers ?? [];
		const storeFactories = props.storeFactories ?? [this.defaultStoreFactory];

		this.registry = (
			storeFactories.includes(this.defaultStoreFactory)
				? storeFactories
				: storeFactories.concat(this.defaultStoreFactory)
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
		const runtime: ContainerRuntime = await ContainerRuntime.loadRuntime({
			context,
			registryEntries: this.registry,
			existing,
			// eslint-disable-next-line import/no-deprecated
			requestHandler: buildRuntimeRequestHandler(...this.requestHandlers),
			provideEntryPoint: this.provideEntryPoint,
		});

		return runtime;
	}
}
