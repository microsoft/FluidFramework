/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { ContainerErrorTypes } from "@fluidframework/container-definitions";
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
		} catch (error: any) {
			assert.strictEqual(error.errorType, ContainerErrorTypes.usageError);
			assert.strictEqual(error.message, "Duplicate entry names exist");
		}
	});
});
