/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describe, it } from "mocha";

import {
	calculatePreviousMajorVersion,
	getRunnerVersion,
	getVersionInfo,
} from "../versionUtils.js";

describe("Version utilities for mixed-version testing", () => {
	describe("calculatePreviousMajorVersion", () => {
		it("calculates previous major version correctly for 2.7X.0", () => {
			assert.strictEqual(calculatePreviousMajorVersion("2.72.0"), "2.60.0");
			assert.strictEqual(calculatePreviousMajorVersion("2.71.0"), "2.60.0");
			assert.strictEqual(calculatePreviousMajorVersion("2.70.0"), "2.60.0");
		});

		it("calculates previous major version correctly for 2.6X.0", () => {
			assert.strictEqual(calculatePreviousMajorVersion("2.62.0"), "2.50.0");
			assert.strictEqual(calculatePreviousMajorVersion("2.60.0"), "2.50.0");
		});

		it("handles edge cases correctly", () => {
			assert.strictEqual(calculatePreviousMajorVersion("2.10.0"), "2.0.0");
			assert.strictEqual(calculatePreviousMajorVersion("2.5.0"), "1.90.0");
		});

		it("throws for invalid version formats", () => {
			assert.throws(() => calculatePreviousMajorVersion("invalid"), /Invalid version format/);
			assert.throws(() => calculatePreviousMajorVersion("2.7"), /Invalid version format/);
		});
	});

	describe("getVersionInfo", () => {
		it("returns correct version info with automatic calculation", () => {
			const info = getVersionInfo();
			assert(info.current);
			assert(info.previousMajor);
			assert.notStrictEqual(info.current, info.previousMajor);
		});

		it("uses override when provided", () => {
			const override = "2.50.0";
			const info = getVersionInfo(override);
			assert.strictEqual(info.previousMajor, override);
		});

		it("throws when override is not older than current", () => {
			assert.throws(() => getVersionInfo("9.99.0"), /must be older than current version/);
		});
	});

	describe("getRunnerVersion", () => {
		const versionInfo = { current: "2.72.0", previousMajor: "2.60.0" };

		it("distributes versions correctly with 50% ratio", () => {
			const totalRunners = 4;
			const ratio = 0.5;

			const runner0 = getRunnerVersion(0, totalRunners, ratio, versionInfo);
			const runner1 = getRunnerVersion(1, totalRunners, ratio, versionInfo);
			const runner2 = getRunnerVersion(2, totalRunners, ratio, versionInfo);
			const runner3 = getRunnerVersion(3, totalRunners, ratio, versionInfo);

			// First 2 should be previous version (50% of 4 = 2)
			assert.strictEqual(runner0.isPreviousVersion, true);
			assert.strictEqual(runner0.version, "2.60.0");
			assert.strictEqual(runner1.isPreviousVersion, true);
			assert.strictEqual(runner1.version, "2.60.0");

			// Last 2 should be current version
			assert.strictEqual(runner2.isPreviousVersion, false);
			assert.strictEqual(runner2.version, "2.72.0");
			assert.strictEqual(runner3.isPreviousVersion, false);
			assert.strictEqual(runner3.version, "2.72.0");
		});

		it("distributes versions correctly with 25% ratio", () => {
			const totalRunners = 4;
			const ratio = 0.25;

			const runner0 = getRunnerVersion(0, totalRunners, ratio, versionInfo);
			const runner1 = getRunnerVersion(1, totalRunners, ratio, versionInfo);
			const runner2 = getRunnerVersion(2, totalRunners, ratio, versionInfo);
			const runner3 = getRunnerVersion(3, totalRunners, ratio, versionInfo);

			// Only first 1 should be previous version (25% of 4 = 1)
			assert.strictEqual(runner0.isPreviousVersion, true);
			assert.strictEqual(runner1.isPreviousVersion, false);
			assert.strictEqual(runner2.isPreviousVersion, false);
			assert.strictEqual(runner3.isPreviousVersion, false);
		});

		it("handles edge case of 0% ratio", () => {
			const runner0 = getRunnerVersion(0, 4, 0, versionInfo);
			assert.strictEqual(runner0.isPreviousVersion, false);
			assert.strictEqual(runner0.version, "2.72.0");
		});

		it("handles edge case of 100% ratio", () => {
			const runner0 = getRunnerVersion(0, 4, 1, versionInfo);
			assert.strictEqual(runner0.isPreviousVersion, true);
			assert.strictEqual(runner0.version, "2.60.0");
		});

		it("throws for invalid ratio", () => {
			assert.throws(
				() => getRunnerVersion(0, 4, -0.1, versionInfo),
				/must be between 0 and 1/,
			);
			assert.throws(() => getRunnerVersion(0, 4, 1.1, versionInfo), /must be between 0 and 1/);
		});
	});
});
