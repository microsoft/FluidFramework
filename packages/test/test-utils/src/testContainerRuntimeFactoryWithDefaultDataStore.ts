/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import { FluidObject } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-deprecated
import { RuntimeRequestHandler } from "@fluidframework/request-handler/internal";
import {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";

const getDefaultFluidObject = async (runtime: IContainerRuntime) => {
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
	// eslint-disable-next-line import/no-deprecated
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

/**
 * {@link @fluidframework/container-definitions#IRuntimeFactory} construct signature.
 *
 * @internal
 */
export type ContainerRuntimeFactoryWithDefaultDataStoreConstructor = new (
	props: ContainerRuntimeFactoryWithDefaultDataStoreProps,
) => IRuntimeFactory;

/**
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
	try {
		return new ctor(ctorProps);
	} catch (err) {
		// IMPORTANT: The constructor argument structure changed, so this is needed for dynamically using older `ContainerRuntimeFactoryWithDefaultDataStore`s
		const {
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint,
		} = ctorProps;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return new (ctor as any)(
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint ?? getDefaultFluidObject,
		);
	}
};
