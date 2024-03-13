/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CompatKind } from "../../compatOptions.cjs";
import { isCompatVersionBelowMinVersion } from "../compatConfig.js";

describe("Minimum Compat Version", () => {
	const testCases = [
		// [ baseVersion, minVersion, compatVersion, expectedResult ]
		// if expectedResult is true means that we will filter a test that uses minVersion
		// for that specific baseVersion and compatVersion.

		// Previous Releases
		["2.0.0-internal.8.0.0", "2.0.0-internal.8.0.0", -1, true],
		["2.0.0-internal.8.0.0", "2.0.0-internal.8.0.0", -2, true],
		["2.0.0-internal.8.0.0", "2.0.0-internal.7.0.0", -1, false],
		["2.0.0-internal.8.0.0", "2.0.0-internal.6.0.0", -2, false],
		["2.0.0-internal.8.0.0", "2.0.0-internal.5.0.0", -3, false],
		["2.0.0-rc.1.0.0", "2.0.0-rc.1.0.0", -1, true],
		["2.0.0-rc.1.0.0", "2.0.0-rc.1.0.0", -2, true],
		["2.0.0-rc.1.0.0", "2.0.0-internal.8.0.0", -1, false],
		["2.0.0-rc.1.0.0", "2.0.0-internal.7.0.0", -1, false],
		["2.0.0-rc.1.0.0", "2.0.0-internal.6.0.0", -1, false],
		// Current Release
		["2.0.0-rc.2.0.0", "2.0.0-rc.2.0.0", -1, true],
		["2.0.0-rc.2.0.0", "2.0.0-rc.2.0.0", -2, true],
		["2.0.0-rc.2.0.0", "2.0.0-rc.2.0.0", -3, true],
		["2.0.0-rc.2.0.0", "2.0.0-rc.1.0.0", -1, false],
		["2.0.0-rc.2.0.0", "2.0.0-rc.1.0.0", -2, true],
		["2.0.0-rc.2.0.0", "2.0.0-internal.8.0.0", -1, false],
		["2.0.0-rc.2.0.0", "2.0.0-internal.8.0.0", -2, false],
		["2.0.0-rc.2.0.0", "2.0.0-internal.8.0.0", -3, true],
		["2.0.0-rc.2.0.0", "2.0.0-internal.7.0.0", -1, false],
		["2.0.0-rc.2.0.0", "2.0.0-internal.7.0.0", -2, false],
		["2.0.0-rc.2.0.0", "2.0.0-internal.7.0.0", -3, false],
		["2.0.0-rc.2.0.0", "2.0.0-internal.7.0.0", -4, true],
		["2.0.0-rc.2.0.0", "1.3.7", -1, false],
		["2.0.0-rc.2.0.0", "1.3.7", -2, false],
		["2.0.0-rc.2.0.0", "1.3.7", -3, false],
		["2.0.0-rc.2.0.0", "1.3.7", -4, false],
		["2.0.0-rc.2.0.0", "1.3.7", -5, false],
		["2.0.0-rc.2.0.0", "1.3.7", -6, false],
		["2.0.0-rc.2.0.0", "1.3.7", -7, false],
		["2.0.0-rc.2.0.0", "1.3.7", -8, false],
		["2.0.0-rc.2.0.0", "1.3.7", -9, false],
	];
	// for cross compat unit testing
	const greaterVersion = "2.0.0-rc.1.0.0";
	const lowerVersion = "1.3.7";

	it("bad min compat string", () => {
		const invalidString = "invalid string";
		assert.throws(
			() =>
				isCompatVersionBelowMinVersion(invalidString, {
					name: `test`,
					kind: CompatKind.None,
					compatVersion: "2.0.0-internal.8.0.0",
				}),
			(error: Error) => {
				return (
					error.message?.startsWith(
						`Error while running: npm v @fluidframework/container-loader`,
					) === true
				);
			},
			"Should fail when not sending a correct version",
		);
	});

	testCases.forEach((testCase) => {
		const baseVersion = testCase[0] as string;
		const minVersion = testCase[1] as string;
		const compatVersion = testCase[2] as number;
		const expectedResult = testCase[3] as boolean;
		it(`Should return ${expectedResult} when baseVersion: ${baseVersion} minVersion: ${minVersion} compatVersion: ${compatVersion}`, () => {
			assert.strictEqual(
				isCompatVersionBelowMinVersion(
					minVersion,
					{ name: "test", kind: "None", compatVersion },
					baseVersion,
				),
				expectedResult,
			);
		});
	});

	it("cross compat. filters out if loadVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(greaterVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: greaterVersion,
				loadVersion: lowerVersion,
			}),
			true,
		);
	});

	it("cross compat. filters out if compatVersion is lower than minVersion", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(greaterVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: lowerVersion,
				loadVersion: greaterVersion,
			}),
			true,
		);
	});

	it("cross compat. does not filter out valid versions", () => {
		assert.strictEqual(
			isCompatVersionBelowMinVersion(lowerVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: greaterVersion,
				loadVersion: lowerVersion,
			}),
			false,
			`fails with minVersion: ${lowerVersion} compatversion: ${greaterVersion} loadVersion: ${lowerVersion}`,
		);
		assert.strictEqual(
			isCompatVersionBelowMinVersion(lowerVersion, {
				name: "test",
				kind: CompatKind.CrossVersion,
				compatVersion: lowerVersion,
				loadVersion: greaterVersion,
			}),
			false,
			`fails with minVersion: ${lowerVersion} compatversion: ${lowerVersion} loadVersion: ${greaterVersion}`,
		);
	});
});
