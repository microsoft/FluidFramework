/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import type {
	IContainerRuntime,
	// eslint-disable-next-line import/no-deprecated
	IContainerRuntimeWithResolveHandle_Deprecated,
} from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RequestParser } from "@fluidframework/runtime-utils/internal";

import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory.js";

const defaultDataStoreId = "default";

async function getDefaultFluidObject(runtime: IContainerRuntime): Promise<FluidObject> {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new Error("default dataStore must exist");
	}
	return entryPoint.get();
}

/**
 * {@link ContainerRuntimeFactoryWithDefaultDataStore} construction properties.
 *
 * @internal
 */
export interface ContainerRuntimeFactoryWithDefaultDataStoreProps {
	defaultFactory: IFluidDataStoreFactory;
	/**
	 * The data store registry for containers produced.
	 */
	readonly registryEntries: NamedFluidDataStoreRegistryEntries;

	/**
	 * The runtime options passed to the IContainerRuntime when instantiating it
	 */
	readonly runtimeOptions?: IContainerRuntimeOptions;

	/**
	 * Function that will initialize the entryPoint of the IContainerRuntime instances
	 * created with this factory
	 */
	readonly provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>;
}

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * @internal
 */
export class ContainerRuntimeFactoryWithDefaultDataStore extends BaseContainerRuntimeFactory {
	public static readonly defaultDataStoreId = defaultDataStoreId;

	protected readonly defaultFactory: IFluidDataStoreFactory;

	public constructor(props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
		const provideEntryPoint = props.provideEntryPoint ?? getDefaultFluidObject;

		const getDefaultObject = async (
			request: IRequest,
			runtime: IContainerRuntime,
		): Promise<IResponse | undefined> => {
			const parser = RequestParser.create(request);
			if (parser.pathParts.length === 0) {
				// This cast is safe as loadContainerRuntime is called in the base class
				// eslint-disable-next-line import/no-deprecated
				return (runtime as IContainerRuntimeWithResolveHandle_Deprecated).resolveHandle({
					url: `/${defaultDataStoreId}${parser.query}`,
					headers: request.headers,
				});
			}
			return undefined; // continue search
		};

		super({
			...props,
			requestHandlers: [getDefaultObject],
			provideEntryPoint,
		});

		this.defaultFactory = props.defaultFactory;
	}

	/**
	 * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(this.defaultFactory.type);
		await dataStore.trySetAlias(defaultDataStoreId);
	}
}
