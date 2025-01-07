/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, describe, it } from "vitest";

import {
	generateBumpDepsBranchName,
	generateBumpVersionBranchName,
	generateReleaseBranchName,
	getDefaultBumpTypeForBranch,
} from "../../library/branches.js";

describe("generateBumpVersionBranchName", () => {
	describe("semver versions", () => {
		it("patch", () => {
			const actual = generateBumpVersionBranchName("azure", "patch", "1.2.3");
			const expected = "bump_azure_patch_1.2.4";
			assert.equal(actual, expected);
		});

		it("minor", () => {
			const actual = generateBumpVersionBranchName("azure", "minor", "1.2.3");
			const expected = "bump_azure_minor_1.3.0";
			assert.equal(actual, expected);
		});

		it("major", () => {
			const actual = generateBumpVersionBranchName("azure", "major", "1.2.3");
			const expected = "bump_azure_major_2.0.0";
			assert.equal(actual, expected);
		});
	});

	describe("Fluid internal versions", () => {
		it("patch", () => {
			const actual = generateBumpVersionBranchName("client", "patch", "2.0.0-internal.1.0.0");
			const expected = "bump_client_patch_2.0.0-internal.1.0.1";
			assert.equal(actual, expected);
		});

		it("minor", () => {
			const actual = generateBumpVersionBranchName("client", "minor", "2.0.0-internal.1.0.0");
			const expected = "bump_client_minor_2.0.0-internal.1.1.0";
			assert.equal(actual, expected);
		});

		it("major", () => {
			const actual = generateBumpVersionBranchName("client", "major", "2.0.0-internal.1.0.0");
			const expected = "bump_client_major_2.0.0-internal.2.0.0";
			assert.equal(actual, expected);
		});
	});
});

describe("generateBumpDepsBranchName", () => {
	describe("semver versions", () => {
		it("patch", () => {
			const actual = generateBumpDepsBranchName("azure", "patch");
			const expected = "bump_deps_azure_patch";
			assert.equal(actual, expected);
		});

		it("minor", () => {
			const actual = generateBumpDepsBranchName("azure", "minor");
			const expected = "bump_deps_azure_minor";
			assert.equal(actual, expected);
		});

		it("major", () => {
			const actual = generateBumpDepsBranchName("azure", "major");
			const expected = "bump_deps_azure_major";
			assert.equal(actual, expected);
		});
	});

	describe("Fluid internal versions", () => {
		it("patch", () => {
			const actual = generateBumpVersionBranchName("client", "patch", "2.0.0-internal.1.0.0");
			const expected = "bump_client_patch_2.0.0-internal.1.0.1";
			assert.equal(actual, expected);
		});

		it("minor", () => {
			const actual = generateBumpVersionBranchName("client", "minor", "2.0.0-internal.1.0.0");
			const expected = "bump_client_minor_2.0.0-internal.1.1.0";
			assert.equal(actual, expected);
		});

		it("major", () => {
			const actual = generateBumpVersionBranchName("client", "major", "2.0.0-internal.1.0.0");
			const expected = "bump_client_major_2.0.0-internal.2.0.0";
			assert.equal(actual, expected);
		});
	});
});

describe("generateReleaseBranchName", () => {
	it("semver", () => {
		const actual = generateReleaseBranchName("azure", "1.2.3");
		const expected = "release/azure/1.2";
		assert.equal(actual, expected);
	});

	it("virtualPatch version scheme", () => {
		const actual = generateReleaseBranchName("build-tools", "0.4.2000");
		const expected = "release/build-tools/0.4.2000";
		assert.equal(actual, expected);
	});

	it("virtualPatch patch", () => {
		const actual = generateReleaseBranchName("build-tools", "0.4.2002");
		const expected = "release/build-tools/0.4.2000";
		assert.equal(actual, expected);
	});

	it("client using semver < 2.0.0", () => {
		const actual = generateReleaseBranchName("client", "1.2.3");
		const expected = "release/client/1.2";
		assert.equal(actual, expected);
	});

	it("client using semver >= 2.0.0", () => {
		const actual = generateReleaseBranchName("client", "2.0.0");
		const expected = "release/client/2.0";
		assert.equal(actual, expected);
	});

	it("Fluid internal version scheme", () => {
		const actual = generateReleaseBranchName("client", "2.0.0-internal.1.0.0");
		const expected = "release/v2int/1.0";
		assert.equal(actual, expected);
	});

	it("Fluid RC version scheme", () => {
		const actual = generateReleaseBranchName("client", "2.0.0-rc.1.0.0");
		const expected = "release/client/2.0.0-rc.1.0";
		assert.equal(actual, expected);
	});

	it("Independent package with standard semver", () => {
		const actual = generateReleaseBranchName("@fluidframework/build-common", "1.2.1");
		const expected = "release/build-common/1.2";
		assert.equal(actual, expected);
	});
});

describe("getDefaultBumpTypeForBranch", () => {
	it("main === minor", () => {
		const actual = getDefaultBumpTypeForBranch("main");
		const expected = "minor";
		assert.equal(actual, expected);
	});

	it("lts === minor", () => {
		const actual = getDefaultBumpTypeForBranch("lts");
		const expected = "minor";
		assert.equal(actual, expected);
	});

	it("release/* === patch", () => {
		const actual = getDefaultBumpTypeForBranch("release/build-tools/0.4.2000");
		const expected = "patch";
		assert.equal(actual, expected);
	});

	it("next === major", () => {
		const actual = getDefaultBumpTypeForBranch("next");
		const expected = "major";
		assert.equal(actual, expected);
	});

	it("unknown branch === undefined", () => {
		const actual = getDefaultBumpTypeForBranch("unknown/branch/name");
		const expected = undefined;
		assert.equal(actual, expected);
	});
});
