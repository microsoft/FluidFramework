/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerContext } from "@fluidframework/container-definitions/internal";

import {
	type DeprecatedLoadContainerRuntimeParams,
	type LoadContainerRuntimeParams,
	loadContainerRuntime,
	loadContainerRuntimeAlpha,
} from "../../containerRuntime.js";

const commonParams = {
	context: undefined as unknown as IContainerContext,
	registryEntries: [],
	existing: false,
	provideEntryPoint: async () => ({}),
};

const canonicalParams: LoadContainerRuntimeParams = {
	...commonParams,
	oldestSupportedClient: "2.0.0",
};
const canonicalParamsWithExplicitUndefined: LoadContainerRuntimeParams = {
	...canonicalParams,
	minVersionForCollab: undefined,
};
const deprecatedParams: DeprecatedLoadContainerRuntimeParams = {
	...commonParams,
	minVersionForCollab: "2.0.0",
};
const deprecatedParamsWithExplicitUndefined: DeprecatedLoadContainerRuntimeParams = {
	...deprecatedParams,
	oldestSupportedClient: undefined,
};
declare const selectedParams:
	| LoadContainerRuntimeParams
	| DeprecatedLoadContainerRuntimeParams;

/**
 * Compile-time checks for the canonical, deprecated, and dynamically selected load parameters.
 */
export function validateLoadContainerRuntimeTypes(): Promise<unknown>[] {
	return [
		loadContainerRuntime(canonicalParams),
		loadContainerRuntime(canonicalParamsWithExplicitUndefined),
		loadContainerRuntime(deprecatedParams),
		loadContainerRuntime(deprecatedParamsWithExplicitUndefined),
		loadContainerRuntime(selectedParams),
		loadContainerRuntimeAlpha(canonicalParams),
		// @ts-expect-error The canonical type requires oldestSupportedClient.
		loadContainerRuntime(commonParams),
		// @ts-expect-error Exactly one compatibility property may be supplied.
		loadContainerRuntime({
			...commonParams,
			oldestSupportedClient: "2.0.0",
			minVersionForCollab: "2.0.0",
		}),
		// @ts-expect-error The alpha API only accepts the canonical property.
		loadContainerRuntimeAlpha(deprecatedParams),
	];
}
