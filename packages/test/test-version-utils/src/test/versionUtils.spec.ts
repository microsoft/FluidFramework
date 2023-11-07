/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { satisfies } from "semver";
import { getRequestedVersion, versionHasMovedSparsedMatrix } from "../versionUtils.js";

const checkRequestedVersionSatisfies = (baseVersion, requested, expectedVersion) => {
	const version = getRequestedVersion(baseVersion, requested);
	assert(
		satisfies(version, expectedVersion),
		`getRequestedVersion("${baseVersion}", ${requested}) -> ${version} does not satisfy ${expectedVersion}`,
	);
};

describe("versionUtils", () => {
	describe("getRequestedVersion", () => {
		it("bumping down public releases", () => {
			checkRequestedVersionSatisfies("1.0.0", -1, "^0.59.0");
			checkRequestedVersionSatisfies("1.0.0", -2, "^0.58.0");
			checkRequestedVersionSatisfies("2.0.0", -1, "^1.0.0");
			checkRequestedVersionSatisfies("2.3.5", -1, "^1.0.0");
		});

		it("bumping up public releases", () => {
			checkRequestedVersionSatisfies("0.59.0", 1, "^1.0.0");
			checkRequestedVersionSatisfies("0.58.0", 1, "^1.0.0");
		});

		it("bumping down internal releases to public releases", () => {
			checkRequestedVersionSatisfies("2.0.0-internal.1.0.0", -1, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.1.1.0", -1, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.1.1.1", -1, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.1.2.3", -1, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.1.4.2", -1, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.1.4.2", -2, "^0.59.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.0.0", -2, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.0.0", -3, "^0.58.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.0.1", -2, "^1.0.0");
		});

		it("bumping down internal releases to other internal releases", () => {
			checkRequestedVersionSatisfies("2.0.0-internal.2.0.0", -1, "^2.0.0-internal.1.4.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.1.1", -1, "^2.0.0-internal.1.4.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.1.0", -1, "^2.0.0-internal.1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.3.0.0", -1, "^2.0.0-internal.2.4.0");
			checkRequestedVersionSatisfies("2.0.0-internal.3.0.0", -1, "^2.0.0-internal.2.4.0");
			checkRequestedVersionSatisfies("2.0.0-internal.3.0.0", -2, "^2.0.0-internal.1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.4.0.0", -1, "^2.0.0-internal.3.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.4.0.0", -2, "^2.0.0-internal.2.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.4.0.0", -3, "^2.0.0-internal.1.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.5.0.0", -1, "^2.0.0-internal.4.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.5.0.0", -2, "^2.0.0-internal.3.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.5.0.0", -3, "^2.0.0-internal.2.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.6.0.0", -1, "^2.0.0-internal.5.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.6.0.0", -2, "^2.0.0-internal.4.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.6.0.0", -3, "^2.0.0-internal.3.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.7.0.0", -1, "^2.0.0-internal.6.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.6.2.0", -2, "^2.0.0-internal.4.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.6.2.0", -3, "^2.0.0-internal.3.0.0");
		});

		// TODO: What is the desired behavior here?
		it.skip("bumping up internal releases to other internal releases", () => {
			checkRequestedVersionSatisfies("2.0.0-internal.2.0.0", 1, "^2.0.0-internal.3.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.1.1", 1, "^2.0.0-internal.3.0.0");
			checkRequestedVersionSatisfies("2.0.0-internal.2.0.0", 2, "^2.0.0-internal.4.0.0");
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
		});

		it("bumping down public releases (minor)", () => {
			checkRequestedVersionSatisfies("0.59.1000", -1, "^0.58.0");
			checkRequestedVersionSatisfies("0.59.2000", -1, "^0.58.0");
			checkRequestedVersionSatisfies("0.59.2000", -1, "^0.58.0");
		});

		it("bumping down public releases (patch)", () => {
			checkRequestedVersionSatisfies("0.59.1001", -1, "^0.58.0");
			checkRequestedVersionSatisfies("0.59.1002", -1, "^0.58.0");
			checkRequestedVersionSatisfies("1.1.0", -1, "^0.59.0");
			checkRequestedVersionSatisfies("2.4.5", -1, "^1.0.0");
		});

		it("bumping down public releases (prerelease/dev)", () => {
			checkRequestedVersionSatisfies("2.0.0-dev.2.2.0.110039", -1, "^2.0.0-internal.1.0.0");
			checkRequestedVersionSatisfies("2.0.0-dev.2.2.0.110039", -2, "^1.0.0");
			checkRequestedVersionSatisfies("2.0.0-dev.2.2.0.110039", -1, "^2.0.0-internal.1.0.0");
			checkRequestedVersionSatisfies("2.0.0-dev.2.1.0.110039", -2, "^1.0.0-0");
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
