/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import-x/no-deprecated
import { RuntimeRequestHandler } from "@fluidframework/request-handler/internal";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
	OldestSupportedClientVersion,
} from "@fluidframework/runtime-definitions/internal";

import { defaultTestOldestSupportedClient } from "./containerRuntimeFactories.js";

const getDefaultFluidObject = async (runtime: IContainerRuntime): Promise<FluidObject> => {
	const entryPoint = await runtime.getAliasedDataStoreEntryPoint("default");
	if (entryPoint === undefined) {
		throw new Error("default dataStore must exist");
	}
	return entryPoint.get();
};

/**
 * {@link ContainerRuntimeFactoryWithDefaultDataStoreConstructor} input properties.
 *
 * @internal
 */
export interface ContainerRuntimeFactoryWithDefaultDataStoreProps {
	readonly defaultFactory: IFluidDataStoreFactory;
	/**
	 * The data store registry for containers produced.
	 */
	readonly registryEntries: NamedFluidDataStoreRegistryEntries;

	/**
	 * @deprecated Do not use. This strictly exists for backwards compatibility.
	 */
	readonly dependencyContainer?: never;

	/**
	 * Request handlers for containers produced.
	 * @deprecated Will be removed once Loader LTS version is "2.0.0-internal.7.0.0". Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
	 */
	// eslint-disable-next-line import-x/no-deprecated
	readonly requestHandlers?: RuntimeRequestHandler[];

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

type ObjectContainerRuntimeFactoryWithDefaultDataStoreConstructor =
	| (new (
			props: ContainerRuntimeFactoryWithDefaultDataStoreProps,
	  ) => IRuntimeFactory)
	| (new (
			props: ContainerRuntimeFactoryWithDefaultDataStoreProps & {
				readonly oldestSupportedClient: OldestSupportedClientVersion;
			},
	  ) => IRuntimeFactory);

type PositionalContainerRuntimeFactoryWithDefaultDataStoreConstructor = new (
	defaultFactory: IFluidDataStoreFactory,
	registryEntries: NamedFluidDataStoreRegistryEntries,
	dependencyContainer?: never,
	// eslint-disable-next-line import-x/no-deprecated
	requestHandlers?: RuntimeRequestHandler[],
	runtimeOptions?: IContainerRuntimeOptions,
	provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>,
) => IRuntimeFactory;

/**
 * {@link @fluidframework/container-definitions#IRuntimeFactory} construct signature.
 *
 * @internal
 */
export type ContainerRuntimeFactoryWithDefaultDataStoreConstructor = (
	| (new (
			props: ContainerRuntimeFactoryWithDefaultDataStoreProps,
	  ) => IRuntimeFactory)
	| (new (
			props: ContainerRuntimeFactoryWithDefaultDataStoreProps & {
				readonly oldestSupportedClient: OldestSupportedClientVersion;
			},
	  ) => IRuntimeFactory)
	| (new (
			defaultFactory: IFluidDataStoreFactory,
			registryEntries: NamedFluidDataStoreRegistryEntries,
			dependencyContainer?: never,
			// eslint-disable-next-line import-x/no-deprecated
			requestHandlers?: RuntimeRequestHandler[],
			runtimeOptions?: IContainerRuntimeOptions,
			provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>,
	  ) => IRuntimeFactory)
) & { readonly length: number };

/**
 * Creates a container runtime factory with default data store for backward compatibility.
 *
 * @remarks
 * This function is purely needed for back-compat as the constructor argument structure of
 * `ContainerRuntimeFactoryWithDefaultDataStore` was changed.
 *
 * @internal
 */
export const createContainerRuntimeFactoryWithDefaultDataStore = (
	ctor: ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	ctorProps: ContainerRuntimeFactoryWithDefaultDataStoreProps,
): IRuntimeFactory => {
	// Supported positional constructors have arity 3, while object-shaped constructors have
	// arity 1. Select before invoking so errors from an object-shaped constructor propagate.
	if (ctor.length === 1) {
		const currentProps = {
			...ctorProps,
			oldestSupportedClient: defaultTestOldestSupportedClient,
		};
		return new (ctor as ObjectContainerRuntimeFactoryWithDefaultDataStoreConstructor)(
			currentProps,
		);
	}

	if (ctor.length === 3) {
		const {
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint,
		} = ctorProps;
		return new (ctor as PositionalContainerRuntimeFactoryWithDefaultDataStoreConstructor)(
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint ?? getDefaultFluidObject,
		);
	}

	throw new Error(
		`Unsupported ContainerRuntimeFactoryWithDefaultDataStore constructor arity: ${ctor.length}`,
	);
};
