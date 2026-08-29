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
import type {
	IFluidDataStoreFactory,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";

import type { defaultTestOldestSupportedClient } from "./testCompatibility.js";

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
	 * Compatibility setting used by all constructor shapes supported by this helper.
	 *
	 * @remarks
	 * Positional constructors predate this property. Restricting the value to the canonical test
	 * default preserves their implicit behavior while allowing object-shaped constructors to
	 * receive the now-explicit setting.
	 */
	readonly oldestSupportedClient: typeof defaultTestOldestSupportedClient;

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
			defaultFactory: IFluidDataStoreFactory,
			registryEntries: NamedFluidDataStoreRegistryEntries,
			dependencyContainer?: never,
			// eslint-disable-next-line import-x/no-deprecated
			requestHandlers?: RuntimeRequestHandler[],
			runtimeOptions?: IContainerRuntimeOptions,
			provideEntryPoint?: (runtime: IContainerRuntime) => Promise<FluidObject>,
	  ) => IRuntimeFactory)
) & { readonly length: number };

type ObjectContainerRuntimeFactoryWithDefaultDataStoreConstructor = Extract<
	ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	new (
		props: ContainerRuntimeFactoryWithDefaultDataStoreProps,
	) => IRuntimeFactory
>;

type PositionalContainerRuntimeFactoryWithDefaultDataStoreConstructor = Exclude<
	ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	ObjectContainerRuntimeFactoryWithDefaultDataStoreConstructor
>;

const objectConstructorArity = 1;
const positionalConstructorArity = 3;

function isObjectConstructor(
	ctor: ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
): ctor is ObjectContainerRuntimeFactoryWithDefaultDataStoreConstructor & {
	readonly length: typeof objectConstructorArity;
} {
	return ctor.length === objectConstructorArity;
}

function isPositionalConstructor(
	ctor: ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
): ctor is PositionalContainerRuntimeFactoryWithDefaultDataStoreConstructor & {
	readonly length: typeof positionalConstructorArity;
} {
	return ctor.length === positionalConstructorArity;
}

/**
 * Creates a container runtime factory with default data store for backward compatibility.
 *
 * @remarks
 * Exact constructors loaded by compatibility tests use the positional shape through
 * `2.0.0-internal.5.4.2` and the object shape beginning with `2.0.0-internal.7.0.0`.
 * JavaScript constructor length counts parameters before the first default-valued parameter, so
 * these shapes have arity 3 and 1 respectively. Unknown arities are rejected rather than guessed.
 *
 * @internal
 */
export const createContainerRuntimeFactoryWithDefaultDataStore = (
	ctor: ContainerRuntimeFactoryWithDefaultDataStoreConstructor,
	ctorProps: ContainerRuntimeFactoryWithDefaultDataStoreProps,
): IRuntimeFactory => {
	const constructorArity = ctor.length;
	if (isObjectConstructor(ctor)) {
		return new ctor(ctorProps);
	}

	if (isPositionalConstructor(ctor)) {
		const {
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint,
		} = ctorProps;
		return new ctor(
			defaultFactory,
			registryEntries,
			dependencyContainer,
			requestHandlers,
			runtimeOptions,
			provideEntryPoint ?? getDefaultFluidObject,
		);
	}

	throw new Error(
		`Unsupported ContainerRuntimeFactoryWithDefaultDataStore constructor arity: ${constructorArity}`,
	);
};
