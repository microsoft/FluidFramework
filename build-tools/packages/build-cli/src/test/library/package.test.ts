/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PackageJson } from "@fluidframework/build-tools";
import { PackageName } from "@rushstack/node-core-library";
import { assert } from "chai";
import { parseJSON } from "date-fns";
import { describe, it } from "mocha";

import { VersionDetails } from "../../library/index.js";
import {
	ensureDevDependencyExists,
	generateReleaseGitTagName,
	sortVersions,
} from "../../library/package.js";

describe("VersionDetails sorting", () => {
	const versions: VersionDetails[] = [
		{ version: "0.1.38773", date: parseJSON("2021-09-28T17:03:10.000Z") },
		{ version: "0.59.3000", date: parseJSON("2022-06-06T21:35:27.000Z") },
		{ version: "0.59.3001", date: parseJSON("2022-08-13T21:35:27.000Z") },
		{ version: "1.0.0", date: parseJSON("2022-06-16T18:03:37.000Z") },
		{ version: "1.0.1", date: parseJSON("2022-06-23T01:59:04.000Z") },
		{ version: "1.0.2", date: parseJSON("2022-08-12T03:03:21.000Z") },
	];

	it("sortedByVersion", async () => {
		const sortedByVersion = sortVersions(versions, "version");
		assert.equal(sortedByVersion[0]?.version, "1.0.2");
		assert.equal(sortedByVersion[3]?.version, "0.59.3001");
	});

	it("sortedByDate", async () => {
		const sortedByDate = sortVersions(versions, "date");
		assert.equal(sortedByDate[0]?.version, "0.59.3001");
		assert.equal(sortedByDate[1]?.version, "1.0.2");
		assert.equal(sortedByDate[4]?.version, "0.59.3000");
	});
});

describe("generateReleaseGitTagName", () => {
	it("semver", () => {
		const actual = generateReleaseGitTagName("release-group", "1.2.3");
		const expected = "release-group_v1.2.3";
		assert.equal(actual, expected);
	});

	it("virtualPatch version scheme", () => {
		const actual = generateReleaseGitTagName("build-tools", "0.4.2000");
		const expected = "build-tools_v0.4.2000";
		assert.equal(actual, expected);
	});

	it("Fluid internal version scheme", () => {
		const actual = generateReleaseGitTagName("client", "2.0.0-internal.1.0.0");
		const expected = "client_v2.0.0-internal.1.0.0";
		assert.equal(actual, expected);
	});
});

// The tests below verify that the rushstack PackageName.getUnscopedName function correctly works as a replacement for
// the removed getPackageShortName function.
describe("the rushstack PackageName.getUnscopedName function", () => {
	it("@fluidframework/container-runtime", () => {
		const input = "@fluidframework/container-runtime";
		const actual = PackageName.getUnscopedName(input);
		const expected = "container-runtime";
		assert.equal(actual, expected);
	});

	it("@fluid-tools/build-cli", () => {
		const input = "@fluid-tools/build-cli";
		const actual = PackageName.getUnscopedName(input);
		const expected = "build-cli";
		assert.equal(actual, expected);
	});

	it("fluid-framework", () => {
		const input = "fluid-framework";
		const actual = PackageName.getUnscopedName(input);
		const expected = "fluid-framework";
		assert.equal(actual, expected);
	});

	it("@fluidframework/fluid-static", () => {
		const input = "@fluidframework/fluid-static";
		const actual = PackageName.getUnscopedName(input);
		const expected = "fluid-static";
		assert.equal(actual, expected);
	});
});

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

	describe("ensureDevDependencyExists", () => {
		it("Should return expected version if dev dependency exists", () => {
			const actual = ensureDevDependencyExists(packageObject, "dependency1");
			assert.equal(actual, "1.0.0");
		});

		it("Should throw an error if dev dependency does not exist", () => {
			const previousPackageName = `${packageObject.name}-does-not-exist`;
			assert.throws(
				() => ensureDevDependencyExists(packageObject, previousPackageName),
				/Did not find devDependency '.*' in package.json/,
			);
		});
	});
});
