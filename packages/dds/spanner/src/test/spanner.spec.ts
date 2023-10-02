/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedCell } from "@fluidframework/cell";
import { SharedMap } from "@fluidframework/map";
import { Spanner } from "../spanner";

describe("Spanner", () => {
	it("can create a Spanner", () => {
		const mockFluidRuntime = new MockFluidDataStoreRuntime();
		const spanner = new Spanner(
			"spanner",
			mockFluidRuntime,
			SharedCell.getFactory(),
			SharedMap.getFactory().create(mockFluidRuntime, "spanner") as SharedMap,
		);
		assert.ok(spanner, "Could not create a Spanner");
	});
});
