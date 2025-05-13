/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidCodeDetails } from "@fluidframework/container-definitions/internal";

import { getPackageName } from "../contracts.js";

const sampleCodeDetailsWithFluidPackage: IFluidCodeDetails = {
	package: {
		name: "fluid-package",
		fluid: {},
	},
};

const sampleCodeDetailsWithPackageWithoutName: IFluidCodeDetails = {
	package: "simple-package",
};

describe("Contract", () => {
	describe("getPackageName", () => {
		it("should return the package name if isFluidPackage returns true", () => {
			const result = getPackageName(sampleCodeDetailsWithFluidPackage);
			assert.deepEqual(result, { name: "fluid-package" });
		});

		it("should return the package as it is if it does not have a name property", () => {
			const result = getPackageName(sampleCodeDetailsWithPackageWithoutName);
			assert.deepEqual(result, { name: "simple-package" });
		});

		it("should return undefined", () => {
			const result = getPackageName(undefined);
			assert.deepEqual(result, { name: undefined });
		});
	});
});
