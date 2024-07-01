/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import type { RuntimeRequestHandler } from "@fluidframework/request-handler/internal";
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RequestParser } from "@fluidframework/runtime-utils/internal";
import type { IFluidDependencySynthesizer } from "@fluidframework/synthesize/internal";

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
 * @legacy
 * @alpha
 */
export interface ContainerRuntimeFactoryWithDefaultDataStoreProps {
	defaultFactory: IFluidDataStoreFactory;
	/**
	 * The data store registry for containers produced.
	 */
	registryEntries: NamedFluidDataStoreRegistryEntries;
	/**
	 * @deprecated Will be removed in a future release.
	 */
	dependencyContainer?: IFluidDependencySynthesizer;
	/**
	 * Request handlers for containers produced.
	 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
	 */
	// eslint-disable-next-line import/no-deprecated
	requestHandlers?: RuntimeRequestHandler[];
	/**
	 * The runtime options passed to the ContainerRuntime when instantiating it
	 */
	runtimeOptions?: IContainerRuntimeOptions;
	/**
	 * Function that will initialize the entryPoint of the ContainerRuntime instances
	 * created with this factory
	 */
	provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>;
}

/**
 * A ContainerRuntimeFactory that initializes Containers with a single default data store, which can be requested from
 * the container with an empty URL.
 *
 * This factory should be exposed as fluidExport off the entry point to your module.
 * @legacy
 * @alpha
 */
export class ContainerRuntimeFactoryWithDefaultDataStore extends BaseContainerRuntimeFactory {
	public static readonly defaultDataStoreId = defaultDataStoreId;

	protected readonly defaultFactory: IFluidDataStoreFactory;

	public constructor(props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
		const requestHandlers = props.requestHandlers ?? [];
		const provideEntryPoint = props.provideEntryPoint ?? getDefaultFluidObject;

		const getDefaultObject = async (
			request: IRequest,
			runtime: IContainerRuntime,
			// eslint-disable-next-line unicorn/consistent-function-scoping
		): Promise<IResponse | undefined> => {
			const parser = RequestParser.create(request);
			if (parser.pathParts.length === 0) {
				// This cast is safe as ContainerRuntime.loadRuntime is called in the base class
				return (runtime as ContainerRuntime).resolveHandle({
					url: `/${defaultDataStoreId}${parser.query}`,
					headers: request.headers,
				});
			}
			return undefined; // continue search
		};

		super({
			...props,
			requestHandlers: [getDefaultObject, ...requestHandlers],
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
