/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { satisfies } from "semver";

import { getRequestedVersion, versionHasMovedSparsedMatrix } from "../versionUtils.js";

/**
 * Wrapper function to easily assert that the version returned from `getRequestedVersion()` satisfies the version we expect.
 *
 * @param baseVersion - The base version to move from (eg. "0.60.0")
 * @param requested - If the value is a negative number, the baseVersion will be adjusted down.
 * If the value is a string then it will be returned as-is. Throws on positive number.
 * @param adjustPublicMajor - If `baseVersion` is a Fluid internal version, then this boolean controls whether the
 * public or internal version is adjusted by the `requested` value. This parameter has no effect if `requested` is a
 * string value or if `baseVersion` is not a Fluid internal version.
 * @param expectedVersion - The version that we expect to be returned from `getRequestedVersion()`.
 *
 */
const checkRequestedVersionSatisfies = (
	baseVersion,
	requested,
	adjustPublicMajor,
	expectedVersion,
) => {
	try {
		const version = getRequestedVersion(baseVersion, requested, adjustPublicMajor);
		assert(
			satisfies(version, expectedVersion),
			`getRequestedVersion("${baseVersion}", ${requested}) -> ${version} does not satisfy ${expectedVersion}`,
		);
	} catch (e) {
		throw new Error(
			`Failed to resolve getRequestedVersion("${baseVersion}", ${requested}) -> ${expectedVersion}: ${e}`,
		);
	}
};

describe("versionUtils", () => {
	describe("getRequestedVersion", () => {
		function createTest(baseVersion, requested, adjustPublicMajor, expectedVersion) {
			return it(`${baseVersion}, ${requested}, ${adjustPublicMajor}, ${expectedVersion}`, () => {
				checkRequestedVersionSatisfies(
					baseVersion,
					requested,
					adjustPublicMajor,
					expectedVersion,
				);
			});
		}

		describe("bumping public releases (adjustPublicMajor = false)", () => {
			const adjustPublicMajor = false;
			createTest("1.0.0", -1, adjustPublicMajor, "^0.59.0");
			createTest("1.0.0", -2, adjustPublicMajor, "^0.58.0");
			createTest("2.0.0", -1, adjustPublicMajor, "^2.0.0-rc.5.0.0");
			createTest("2.3.5", -1, adjustPublicMajor, "~2.0.0-rc.5.0.0");
			createTest("2.10.0", -1, adjustPublicMajor, "~2.5.0");
			createTest("2.10.0", -2, adjustPublicMajor, "^2.0.0-rc.5.0.0");
			createTest("2.13.2", -1, adjustPublicMajor, "~2.5.0");
			createTest("2.20.0", -1, adjustPublicMajor, "~2.13.0");
			createTest("2.20.0", -2, adjustPublicMajor, "~2.5.0");
			createTest("2.20.0", -3, adjustPublicMajor, "^2.0.0-rc.5.0.0");
		});

		describe("bumping public releases (adjustPublicMajor = true)", () => {
			const adjustPublicMajor = true;
			createTest("2.0.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.3.5", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.13.5", -1, adjustPublicMajor, "^1.0.0");
		});

		describe("bumping internal releases to public releases (adjustPublicMajor = false)", () => {
			const adjustPublicMajor = false;
			createTest("2.0.0-internal.1.0.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.1.1.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.1.1.1", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.1.2.3", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.1.4.2", -1, adjustPublicMajor, "^1.0.0");

			createTest("2.0.0-internal.1.4.2", -2, adjustPublicMajor, "^0.59.0");
			createTest("2.0.0-internal.2.0.0", -2, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.2.0.0", -3, adjustPublicMajor, "^0.58.0");
			createTest("2.0.0-internal.2.0.1", -2, adjustPublicMajor, "^1.0.0");
		});

		describe("bumping internal/rc releases to public releases (adjustPublicMajor = true)", () => {
			const adjustPublicMajor = true;
			createTest("2.0.0-internal.1.0.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.2.0.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-internal.1.0.0", -2, adjustPublicMajor, "^0.59.0");
			createTest("2.0.0-internal.2.0.0", -2, adjustPublicMajor, "^0.59.0");
			createTest("2.0.0-internal.6.4.0", -1, adjustPublicMajor, "^1.0.0");

			createTest("2.0.0-rc.1.0.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-rc.2.0.0", -1, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-rc.1.0.0", -2, adjustPublicMajor, "^0.59.0");
			createTest("2.0.0-rc.2.0.0", -2, adjustPublicMajor, "^0.59.0");
			createTest("2.0.0-rc.6.4.0", -1, adjustPublicMajor, "^1.0.0");
		});

		describe("bumping internal releases to other internal releases", () => {
			const adjustPublicMajor = false;
			createTest("2.0.0-internal.2.0.0", -1, adjustPublicMajor, "^2.0.0-internal.1.4.0");
			createTest("2.0.0-internal.2.1.1", -1, adjustPublicMajor, "^2.0.0-internal.1.4.0");
			createTest("2.0.0-internal.2.1.0", -1, adjustPublicMajor, "^2.0.0-internal.1.0.0");
			createTest("2.0.0-internal.3.0.0", -1, adjustPublicMajor, "^2.0.0-internal.2.4.0");
			createTest("2.0.0-internal.3.0.0", -1, adjustPublicMajor, "^2.0.0-internal.2.4.0");
			createTest("2.0.0-internal.3.0.0", -2, adjustPublicMajor, "^2.0.0-internal.1.0.0");
			createTest("2.0.0-internal.4.0.0", -1, adjustPublicMajor, "^2.0.0-internal.3.0.0");
			createTest("2.0.0-internal.4.0.0", -2, adjustPublicMajor, "^2.0.0-internal.2.0.0");
			createTest("2.0.0-internal.4.0.0", -3, adjustPublicMajor, "^2.0.0-internal.1.0.0");
			createTest("2.0.0-internal.5.0.0", -1, adjustPublicMajor, "^2.0.0-internal.4.0.0");
			createTest("2.0.0-internal.5.0.0", -2, adjustPublicMajor, "^2.0.0-internal.3.0.0");
			createTest("2.0.0-internal.5.0.0", -3, adjustPublicMajor, "^2.0.0-internal.2.0.0");
			createTest("2.0.0-internal.6.0.0", -1, adjustPublicMajor, "^2.0.0-internal.5.0.0");
			createTest("2.0.0-internal.6.0.0", -2, adjustPublicMajor, "^2.0.0-internal.4.0.0");
			createTest("2.0.0-internal.6.0.0", -3, adjustPublicMajor, "^2.0.0-internal.3.0.0");
			createTest("2.0.0-internal.7.0.0", -1, adjustPublicMajor, "^2.0.0-internal.6.0.0");
			createTest("2.0.0-internal.6.2.0", -2, adjustPublicMajor, "^2.0.0-internal.4.0.0");
			createTest("2.0.0-internal.6.2.0", -3, adjustPublicMajor, "^2.0.0-internal.3.0.0-0");
		});

		describe("bumping rc releases to other rc/internal releases", () => {
			const adjustPublicMajor = false;
			createTest("2.0.0-rc.1.0.0", -1, adjustPublicMajor, "^2.0.0-internal.8.0.0");
			createTest("2.0.0-rc.1.2.0", -1, adjustPublicMajor, "^2.0.0-internal.8.0.0");
			createTest("2.0.0-rc.1.2.4", -1, adjustPublicMajor, "^2.0.0-internal.8.0.0");
			createTest("2.0.0-rc.1.3.4", -1, adjustPublicMajor, "^2.0.0-internal.8.0.0");
			createTest("2.0.0-rc.1.3.4", -2, adjustPublicMajor, "^2.0.0-internal.7.0.0");

			// These tests should be enabled once 2.0.0-rc.1.0.0 is released (currently throws trying to fetch the unreleased packages)
			createTest("2.0.0-rc.2.0.0", -1, adjustPublicMajor, "^2.0.0-rc.1.0.0");
			createTest("2.0.0-rc.2.0.0", -2, adjustPublicMajor, "^2.0.0-internal.8.0.0");
		});

		it("error cases for malformed versions", () => {
			assert.strictEqual(getRequestedVersion("2.0.0", 0), "2.0.0");
			assert.strictEqual(getRequestedVersion("2.0.0", undefined), "2.0.0");
			assert.throws(
				() => getRequestedVersion("-1.-2.-1", -1),
				Error,
				"TypeError: Invalid Version: -1.-2.-1",
			);
			assert.throws(
				() => getRequestedVersion("1.-2.-1", -1),
				Error,
				"TypeError: Invalid Version: 1.-2.-1",
			);
			assert.throws(
				() => getRequestedVersion("1.-2.-1", -1),
				Error,
				"TypeError: Invalid Version: 1.-2.-1",
			);
			assert.throws(
				() => getRequestedVersion("badString", -1),
				Error,
				"TypeError: Invalid Version: badString",
			);
			assert.throws(
				() => getRequestedVersion("1.0.0", 1),
				Error,
				"Only negative values are supported for `requested` param.",
			);
		});

		describe("bumping public releases (minor)", () => {
			const adjustPublicMajor = false;

			createTest("0.59.1000", -1, adjustPublicMajor, "^0.58.0-0");
			createTest("0.59.2000", -1, adjustPublicMajor, "^0.58.0");
			createTest("0.59.2000", -1, adjustPublicMajor, "^0.58.0");
		});

		describe("bumping down public releases (patch)", () => {
			const adjustPublicMajor = false;

			createTest("0.59.1001", -1, adjustPublicMajor, "^0.58.0");
			createTest("0.59.1002", -1, adjustPublicMajor, "^0.58.0");
			createTest("1.1.0", -1, adjustPublicMajor, "^0.59.0");
			createTest("2.4.5", -1, adjustPublicMajor, "^2.0.0-rc.4.0.0");
		});

		describe("bumping down public releases (prerelease/dev)", () => {
			const adjustPublicMajor = false;

			createTest("2.0.0-dev.2.2.0.110039", -1, adjustPublicMajor, "^2.0.0-internal.1.0.0");
			createTest("2.0.0-dev.2.2.0.110039", -2, adjustPublicMajor, "^1.0.0");
			createTest("2.0.0-dev.2.2.0.110039", -1, adjustPublicMajor, "^2.0.0-internal.1.0.0");
			createTest("2.0.0-dev.2.1.0.110039", -2, adjustPublicMajor, "^1.0.0-0");
			createTest("2.0.0-dev-rc.1.0.0.223149", -1, adjustPublicMajor, "^2.0.0-internal.8.0.0");
			createTest("2.0.0-dev-rc.1.5.3.223149", -2, adjustPublicMajor, "^2.0.0-internal.7.0.0");
			createTest("2.0.0-dev-rc.2.0.0.233243", -1, adjustPublicMajor, "^2.0.0-rc.1.0.0");
			createTest("2.0.0-dev-rc.2.0.0.233243", -2, adjustPublicMajor, "^2.0.0-internal.8.0.0");
		});
	});

	describe("versionHasMovedSparsedMatrix", () => {
		it("older version", () => {
			for (const version of ["0.59.0", "1.4.0", "2.0.0-internal.1.4.0"]) {
				assert.strictEqual(versionHasMovedSparsedMatrix(version), false);
			}
		});

		it("equal version version", () => {
			assert.strictEqual(versionHasMovedSparsedMatrix("2.0.0"), true);
			assert.strictEqual(versionHasMovedSparsedMatrix("2.0.0-internal.2.0.0"), true);
		});

		it("newer version", () => {
			for (const version of [
				"2.0.0-internal.2.0.1",
				"2.1.0-internal.1.4.0",
				"2.0.1",
				"3.0.0",
			]) {
				assert.strictEqual(versionHasMovedSparsedMatrix(version), true);
			}
		});
	});
});
