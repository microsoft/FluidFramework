/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
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
	provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;
}

/**
 * @internal
 */
export class RuntimeFactory extends RuntimeFactoryHelper {
	private readonly registry: NamedFluidDataStoreRegistryEntries;

	private readonly defaultStoreFactory: IFluidDataStoreFactory;
	private readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;

	public constructor(props: RuntimeFactoryProps) {
		super();

		this.defaultStoreFactory = props.defaultStoreFactory;
		this.provideEntryPoint = props.provideEntryPoint;
		const storeFactories = props.storeFactories ?? [this.defaultStoreFactory];

		this.registry = (
			storeFactories.includes(this.defaultStoreFactory)
				? storeFactories
				: [...storeFactories, this.defaultStoreFactory]
		).map((factory) => [factory.type, factory]) as NamedFluidDataStoreRegistryEntries;
	}

	public async instantiateFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(this.defaultStoreFactory.type);
		await dataStore.trySetAlias(defaultStoreId);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IContainerRuntime & IRuntime> {
		const runtime = await loadContainerRuntime({
			context,
			registryEntries: this.registry,
			existing,
			provideEntryPoint: this.provideEntryPoint,
		});

		return runtime;
	}
}
