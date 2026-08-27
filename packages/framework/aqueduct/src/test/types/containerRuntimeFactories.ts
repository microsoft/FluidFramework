/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";

import {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
	ContainerRuntimeFactoryWithDefaultDataStore,
	type ContainerRuntimeFactoryWithDefaultDataStoreProps,
	type DeprecatedBaseContainerRuntimeFactoryProps,
	type DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps,
} from "../../container-runtime-factories/index.js";

const commonProps = {
	registryEntries: [],
	provideEntryPoint: async () => ({}),
};
const defaultFactory = undefined as unknown as IFluidDataStoreFactory;

const canonicalBaseProps: BaseContainerRuntimeFactoryProps = {
	...commonProps,
	oldestSupportedClient: "2.0.0",
};
const deprecatedBaseProps: DeprecatedBaseContainerRuntimeFactoryProps = {
	...commonProps,
	minVersionForCollab: "2.0.0",
};

declare const baseProps:
	| BaseContainerRuntimeFactoryProps
	| DeprecatedBaseContainerRuntimeFactoryProps;
declare const defaultDataStoreProps:
	| ContainerRuntimeFactoryWithDefaultDataStoreProps
	| DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps;

/**
 * Compile-time checks for canonical, deprecated, and dynamically selected factory properties.
 */
export function validateContainerRuntimeFactoryTypes(): (
	| BaseContainerRuntimeFactory
	| ContainerRuntimeFactoryWithDefaultDataStore
)[] {
	return [
		new BaseContainerRuntimeFactory(canonicalBaseProps),
		new BaseContainerRuntimeFactory(deprecatedBaseProps),
		new BaseContainerRuntimeFactory(baseProps),
		new ContainerRuntimeFactoryWithDefaultDataStore(defaultDataStoreProps),
		// @ts-expect-error A compatibility property is required.
		new BaseContainerRuntimeFactory(commonProps),
		// @ts-expect-error Exactly one compatibility property may be supplied.
		new BaseContainerRuntimeFactory({
			...commonProps,
			oldestSupportedClient: "2.0.0",
			minVersionForCollab: "2.0.0",
		}),
		// @ts-expect-error A compatibility property is required.
		new ContainerRuntimeFactoryWithDefaultDataStore({ ...commonProps, defaultFactory }),
		// @ts-expect-error Exactly one compatibility property may be supplied.
		new ContainerRuntimeFactoryWithDefaultDataStore({
			...commonProps,
			defaultFactory,
			oldestSupportedClient: "2.0.0",
			minVersionForCollab: "2.0.0",
		}),
	];
}
