/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { PackageJson } from "@fluidframework/build-tools";
import * as utils from "../src/typeTestUtils";

/**
 * Mock package.json object for testing.
 */
const mockPackageObject: PackageJson = {
	name: "mockPackageForTesting",
	description: "Mock package.json",
	version: "1.0.0",
	scripts: {},
	devDependencies: {
		"dependency1": "1.0.0",
		"dependency2": "2.0.0",
		"mockPackage-previous": "1.2.3",
	},
};

/**
 * Unit tests for the abstracted functions in typeTestUtils.
 */
describe("typeTestUtils", () => {
	const packageObject: PackageJson = mockPackageObject;
	const previousPackageName = `${packageObject.name}-previous`;

	describe("ensureDevDependencyExists", () => {
		it("Should not throw an error if dev dependency exists", () => {
			utils.ensureDevDependencyExists(packageObject, "dependency1");
		});

		it("Should throw an error if dev dependency does not exist", () => {
			const previousPackageName = `${packageObject.name}-does-not-exist`;
			assert.throws(
				() => utils.ensureDevDependencyExists(packageObject, previousPackageName),
				/Error: Did not find devDependency in package.json/,
			);
		});
	});
});
