/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import {
	FluidDataStoreRegistry,
	loadContainerRuntime,
	type IContainerRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import type {
	IContainerRuntime,
	// eslint-disable-next-line import/no-deprecated
	IContainerRuntimeWithResolveHandle_Deprecated,
} from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
	// eslint-disable-next-line import/no-deprecated
	type RuntimeRequestHandler,
	// eslint-disable-next-line import/no-deprecated
	buildRuntimeRequestHandler,
} from "@fluidframework/request-handler/internal";
import type {
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	IProvideFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import { RequestParser, RuntimeFactoryHelper } from "@fluidframework/runtime-utils/internal";

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
 * @deprecated See notice on {@link ContainerRuntimeFactoryWithDefaultDataStore}.
 */
export interface ContainerRuntimeFactoryWithDefaultDataStoreProps {
	readonly defaultFactory: IFluidDataStoreFactory;

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
 * @deprecated
 * Do not reference this type directly. It will be removed in the future.
 * E.g. use {@link IRuntimeFactory} instead.
 */
export class ContainerRuntimeFactoryWithDefaultDataStore
	extends RuntimeFactoryHelper
	implements IProvideFluidDataStoreRegistry
{
	public static readonly defaultDataStoreId = defaultDataStoreId;

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#IProvideFluidDataStoreRegistry.IFluidDataStoreRegistry}
	 */
	public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry {
		return this.registry;
	}

	protected readonly defaultFactory: IFluidDataStoreFactory;

	private readonly registry: IFluidDataStoreRegistry;

	/**
	 * {@inheritDoc ContainerRuntimeFactoryWithDefaultDataStoreProps.registryEntries}
	 */
	private readonly registryEntries: NamedFluidDataStoreRegistryEntries;

	/**
	 * {@inheritDoc ContainerRuntimeFactoryWithDefaultDataStoreProps.runtimeOptions}
	 */
	private readonly runtimeOptions?: IContainerRuntimeOptions;

	// eslint-disable-next-line import/no-deprecated
	private readonly requestHandlers: readonly RuntimeRequestHandler[];

	/**
	 * {@inheritDoc ContainerRuntimeFactoryWithDefaultDataStoreProps.provideEntryPoint}
	 */
	private readonly provideEntryPoint: (runtime: IContainerRuntime) => Promise<FluidObject>;

	public constructor(props: ContainerRuntimeFactoryWithDefaultDataStoreProps) {
		super();

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

		this.defaultFactory = props.defaultFactory;
		this.registryEntries = props.registryEntries;
		this.runtimeOptions = props.runtimeOptions;
		this.provideEntryPoint = props.provideEntryPoint ?? getDefaultFluidObject;
		this.requestHandlers = [getDefaultObject];
		this.registry = new FluidDataStoreRegistry(this.registryEntries);
	}

	public async instantiateFirstTime(runtime: IContainerRuntime): Promise<void> {
		await this.containerInitializingFirstTime(runtime);
		await this.containerHasInitialized(runtime);
	}

	public async instantiateFromExisting(runtime: IContainerRuntime): Promise<void> {
		await this.containerHasInitialized(runtime);
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IContainerRuntime & IRuntime> {
		return loadContainerRuntime({
			context,
			existing,
			runtimeOptions: this.runtimeOptions,
			registryEntries: this.registryEntries,
			containerScope: context.scope,
			// eslint-disable-next-line import/no-deprecated
			requestHandler: buildRuntimeRequestHandler(...this.requestHandlers),
			provideEntryPoint: this.provideEntryPoint,
		});
	}

	/**
	 * Subclasses may override containerInitializingFirstTime to perform any setup steps at the time the container
	 * is created. This likely includes creating any initial data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized.
	 * @virtual
	 */
	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		const dataStore = await runtime.createDataStore(this.defaultFactory.type);
		await dataStore.trySetAlias(defaultDataStoreId);
	}

	/**
	 * Subclasses may override containerHasInitialized to perform any steps after the container has initialized.
	 * This likely includes loading any data stores that are expected to be there at the outset.
	 * @param runtime - The container runtime for the container being initialized.
	 * @virtual
	 */
	protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {}
}
