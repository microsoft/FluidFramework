/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";

import { FluidDataStoreRegistry } from "../dataStoreRegistry.js";

describe("Data Store Registry Creation Tests", () => {
	// Define two entries with the same name
	const defaultName = "default";
	const entries = [
		[defaultName, []],
		[defaultName, []],
	];

	it("Validate duplicate name entries", () => {
		try {
			new FluidDataStoreRegistry(entries as NamedFluidDataStoreRegistryEntries);
			assert.fail();
		} catch (error: unknown) {
			assert(isFluidError(error));
			assert.strictEqual(error.errorType, ContainerErrorTypes.usageError);
			assert.strictEqual(error.message, "Duplicate entry names exist");
		}
	});
});
