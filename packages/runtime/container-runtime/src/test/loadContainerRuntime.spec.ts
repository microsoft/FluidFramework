/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";

import {
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

	it("normalizes the deprecated compatibility parameter before validation", async () => {
		const context = {
			taggedLogger: { send: () => {} },
		} as unknown as IContainerContext;

		// Reaching version validation instead of the exact-one guard proves the deprecated property
		// was normalized to the canonical input before loading the runtime.
		await assert.rejects(
			loadContainerRuntime({
				...commonParams,
				context,
				minVersionForCollab: "1.2.3.4" as OldestSupportedClientVersion,
			}),
			/Invalid compatibility version: 1\.2\.3\.4/,
		);
	});

	const callAlphaWithCompatibilityProperties = async (properties: {
		readonly oldestSupportedClient?: OldestSupportedClientVersion;
		readonly minVersionForCollab?: OldestSupportedClientVersion;
	}): Promise<unknown> =>
		loadContainerRuntimeAlpha({
			...commonParams,
			...properties,
		} as unknown as LoadContainerRuntimeParams);

	it("requires the canonical compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			callAlphaWithCompatibilityProperties({}),
			/oldestSupportedClient must be specified/,
		);
	});

	it("rejects the deprecated compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			callAlphaWithCompatibilityProperties({
				minVersionForCollab: "2.0.0",
			}),
			/minVersionForCollab is not supported by loadContainerRuntimeAlpha/,
		);
	});
});
