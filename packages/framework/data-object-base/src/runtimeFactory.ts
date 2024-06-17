/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	// eslint-disable-next-line import/no-deprecated
	type RuntimeRequestHandler,
	// eslint-disable-next-line import/no-deprecated
	buildRuntimeRequestHandler,
} from "@fluidframework/request-handler/internal";
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils/internal";

const defaultStoreId = "" as const;

/**
 * {@link RuntimeFactory} construction properties.
 * @internal
 */
export interface RuntimeFactoryProps {
	defaultStoreFactory: IFluidDataStoreFactory;
	storeFactories: IFluidDataStoreFactory[];
	/**
	 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
	 */
	// eslint-disable-next-line import/no-deprecated
	requestHandlers?: RuntimeRequestHandler[];
	provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;
}

/**
 * @internal
 */
export class RuntimeFactory extends RuntimeFactoryHelper {
	private readonly registry: NamedFluidDataStoreRegistryEntries;

	private readonly defaultStoreFactory: IFluidDataStoreFactory;
	// eslint-disable-next-line import/no-deprecated
	private readonly requestHandlers: RuntimeRequestHandler[];
	private readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;

	public constructor(props: RuntimeFactoryProps) {
		super();

		this.defaultStoreFactory = props.defaultStoreFactory;
		this.provideEntryPoint = props.provideEntryPoint;
		this.requestHandlers = props.requestHandlers ?? [];
		const storeFactories = props.storeFactories ?? [this.defaultStoreFactory];

		this.registry = (
			storeFactories.includes(this.defaultStoreFactory)
				? storeFactories
				: [...storeFactories, this.defaultStoreFactory]
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
