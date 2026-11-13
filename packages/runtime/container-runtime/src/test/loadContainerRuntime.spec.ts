/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { defaultMinVersionForCollab as defaultTestOldestSupportedClient } from "@fluidframework/runtime-utils/internal";

import {
	loadContainerRuntime,
	loadContainerRuntimeAlpha,
	type LoadContainerRuntimeParams,
} from "../containerRuntime.js";

const commonParams = {
	context: undefined as unknown as IContainerContext,
	registryEntries: [],
	existing: false,
	provideEntryPoint: async () => ({}),
};

describe("loadContainerRuntime compatibility parameter", () => {
	it("rejects a missing compatibility parameter at runtime", async () => {
		await assert.rejects(
			loadContainerRuntime(commonParams),
			/Specify exactly one of oldestSupportedClient or minVersionForCollab/,
		);
	});

	it("rejects both compatibility parameters at runtime", async () => {
		await assert.rejects(
			loadContainerRuntime({
				...commonParams,
				oldestSupportedClient: defaultTestOldestSupportedClient,
				minVersionForCollab: defaultTestOldestSupportedClient,
			}),
			/Specify exactly one of oldestSupportedClient or minVersionForCollab/,
		);
	});

	for (const property of ["oldestSupportedClient", "minVersionForCollab"] as const) {
		it(`rejects null for ${property} at runtime`, async () => {
			const params: LoadContainerRuntimeParams = { ...commonParams };
			// @ts-expect-error A compatibility version must not be null.
			// eslint-disable-next-line unicorn/no-null -- Test invalid JavaScript input.
			params[property] = null;
			await assert.rejects(
				loadContainerRuntime(params),
				/Compatibility version must not be null/,
			);
		});

		it(`preserves extensible load parameters with ${property}`, async () => {
			interface ExtendedParams extends LoadContainerRuntimeParams {
				readonly customProperty: boolean;
			}
			const context = {
				taggedLogger: { send: () => {} },
			} as unknown as IContainerContext;
			const params: ExtendedParams = {
				...commonParams,
				context,
				[property]: defaultTestOldestSupportedClient,
				customProperty: true,
			};

			// Version validation follows the public compatibility check.
			// An invalid version avoids the need for a complete container context.
			// @ts-expect-error "1.2.3.4" is not a valid compatibility version shape.
			params[property] = "1.2.3.4";

			await assert.rejects(
				loadContainerRuntime(params),
				/Invalid compatibility version: 1\.2\.3\.4/,
			);
		});
	}

	it("requires the canonical compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			// @ts-expect-error The alpha API requires oldestSupportedClient.
			loadContainerRuntimeAlpha(commonParams),
			/oldestSupportedClient must be specified/,
		);
	});

	it("rejects a null canonical compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			loadContainerRuntimeAlpha({
				...commonParams,
				// @ts-expect-error A compatibility version must not be null.
				// eslint-disable-next-line unicorn/no-null -- Test invalid JavaScript input.
				oldestSupportedClient: null,
			}),
			/oldestSupportedClient must be specified/,
		);
	});

	it("rejects the deprecated compatibility parameter at runtime for alpha", async () => {
		await assert.rejects(
			loadContainerRuntimeAlpha({
				...commonParams,
				// @ts-expect-error The alpha API only accepts the canonical property.
				minVersionForCollab: defaultTestOldestSupportedClient,
			}),
			/minVersionForCollab is not supported by loadContainerRuntimeAlpha/,
		);
	});
});
