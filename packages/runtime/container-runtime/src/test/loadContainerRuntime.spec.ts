/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";

import {
	type DeprecatedLoadContainerRuntimeParams,
	type LoadContainerRuntimeParams,
	loadContainerRuntime,
	loadContainerRuntimeAlpha,
} from "../containerRuntime.js";

const commonParams = {
	context: undefined as unknown as IContainerContext,
	registryEntries: [],
	existing: false,
	provideEntryPoint: async () => ({}),
};

describe("loadContainerRuntime compatibility parameter", () => {
	it("requires the canonical parameter at compile time while preserving the deprecated overload", () => {
		const acceptCanonical = (_params: LoadContainerRuntimeParams): void => {};
		const acceptDeprecated = (_params: DeprecatedLoadContainerRuntimeParams): void => {};
		const acceptAlpha = (_params: Parameters<typeof loadContainerRuntimeAlpha>[0]): void => {};
		const callDeprecatedOverload = async (): ReturnType<typeof loadContainerRuntime> =>
			loadContainerRuntime({
				...commonParams,
				minVersionForCollab: "2.0.0",
			});

		acceptCanonical({
			...commonParams,
			oldestSupportedClient: "2.0.0",
		});
		acceptDeprecated({
			...commonParams,
			minVersionForCollab: "2.0.0",
		});
		assert.equal(typeof callDeprecatedOverload, "function");
		acceptAlpha({
			...commonParams,
			oldestSupportedClient: "2.0.0",
		});

		// @ts-expect-error -- the canonical type requires oldestSupportedClient.
		acceptCanonical(commonParams);
		acceptCanonical({
			...commonParams,
			oldestSupportedClient: "2.0.0",
			// @ts-expect-error -- the canonical type cannot include the deprecated property.
			minVersionForCollab: "2.0.0",
		});
		acceptAlpha({
			...commonParams,
			// @ts-expect-error -- the alpha API only accepts the canonical property.
			minVersionForCollab: "2.0.0",
		});
	});

	const callWithCompatibilityProperties = async (properties: {
		readonly oldestSupportedClient?: OldestSupportedClientVersion;
		readonly minVersionForCollab?: OldestSupportedClientVersion;
	}): Promise<unknown> =>
		loadContainerRuntime({
			...commonParams,
			...properties,
		} as unknown as LoadContainerRuntimeParams);

	it("rejects a missing compatibility parameter at runtime", async () => {
		await assert.rejects(
			callWithCompatibilityProperties({}),
			/Specify exactly one of oldestSupportedClient or minVersionForCollab/,
		);
	});

	it("rejects both compatibility parameters at runtime", async () => {
		await assert.rejects(
			callWithCompatibilityProperties({
				oldestSupportedClient: "2.0.0",
				minVersionForCollab: "2.0.0",
			}),
			/Specify exactly one of oldestSupportedClient or minVersionForCollab/,
		);
	});
});
