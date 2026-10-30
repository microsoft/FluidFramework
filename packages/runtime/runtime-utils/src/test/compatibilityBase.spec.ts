/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";
import { compare } from "semver-ts";

import {
	getConfigsForOldestSupportedClient,
	validateConfigMapOverrides,
	type ConfigMap,
	type SemanticVersion,
	type ConfigValidationMap,
	configValueToOldestSupportedClient,
	oldestSupportedClientVersionFloor,
	checkValidOldestSupportedClientVerbose,
	cleanedPackageVersion,
	validateOldestSupportedClient,
	isValidOldestSupportedClient,
	getConfigForOldestSupportedClient,
	selectVersionRoundedDown,
	defaultOldestSupportedClient,
	defaultMinVersionForCollab,
	getConfigForMinVersionForCollab,
} from "../compatibilityBase.js";

describe("compatibilityBase", () => {
	it("retains the old helper exports as aliases", () => {
		assert.strictEqual(defaultMinVersionForCollab, defaultOldestSupportedClient);
		assert.strictEqual(getConfigForMinVersionForCollab, getConfigForOldestSupportedClient);
	});
	it("cleanedPackageVersion", () => {
		validateOldestSupportedClient(cleanedPackageVersion);
	});

	// The getConfigsForOldestSupportedClient tests provide a lot of coverage for this function as well.
	describe("getConfigForOldestSupportedClient", () => {
		it("minimal", () => {
			const config = getConfigForOldestSupportedClient("2.2.0", {
				[oldestSupportedClientVersionFloor]: "X",
			});
			assert.equal(config, "X");
		});
		it("sorting", () => {
			// These checks are designed to fail if the items are not sorted according to semver, and are either left as ordered or sorted lexically.
			const config = {
				[oldestSupportedClientVersionFloor]: "A",
				"2.100.0": "D",
				"2.58.0": "B",
				"2.60.0": "C",
			};
			assert.equal(getConfigForOldestSupportedClient("2.50.0", config), "A");
			assert.equal(getConfigForOldestSupportedClient("2.58.0", config), "B");
			assert.equal(getConfigForOldestSupportedClient("2.59.0", config), "B");
			assert.equal(getConfigForOldestSupportedClient("2.60.0", config), "C");
			assert.equal(getConfigForOldestSupportedClient("2.99.0", config), "C");
			assert.equal(getConfigForOldestSupportedClient("2.100.0", config), "D");
		});
	});

	describe("getConfigsForOldestSupportedClient", () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- type required for ConfigMap processing
		type ITestConfigMap = {
			featureA: string;
			featureB: string;
			featureC: string;
			featureD: string;
			featureE: string;
			featureF: number;
		};
		const testConfigMap: ConfigMap<ITestConfigMap> = {
			featureA: {
				"2.0.0": "a2",
				"2.50.0": "a4",
				"2.40.0": "a3",
			},
			featureB: {
				"2.0.0": "b1",
				"2.30.0": "b2",
				"2.60.0": "b4",
				"2.46.0": "b3",
			},
			featureC: {
				"2.0.0": "c1",
				"2.40.0": "c2",
				"2.70.0": "c4",
				"2.50.0": "c3",
			},
			featureD: {
				"2.46.0": "d3",
				"2.5.0": "d2",
				"2.55.0": "d4",
				"2.0.0": "d1",
			},
			featureE: {
				"2.35.0": "e2",
				"2.73.0": "e4",
				"2.65.0": "e3",
				"2.0.0": "e1",
			},
			featureF: {
				"2.0.0": 1,
				"2.45.0": 2,
				"2.71.0": 4,
				"2.65.0": 3,
			},
		};

		const testCases: {
			oldestSupportedClient: OldestSupportedClientVersion;
			expectedConfig: ITestConfigMap;
		}[] = [
			{
				oldestSupportedClient: "2.0.0",
				expectedConfig: {
					featureA: "a2",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					featureF: 1,
				},
			},
			{
				oldestSupportedClient: "2.1.5",
				expectedConfig: {
					featureA: "a2",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					featureF: 1,
				},
			},
			{
				oldestSupportedClient: "2.5.0",
				expectedConfig: {
					featureA: "a2",
					featureB: "b1",
					featureC: "c1",
					featureD: "d2",
					featureE: "e1",
					featureF: 1,
				},
			},
			{
				oldestSupportedClient: "2.30.0",
				expectedConfig: {
					featureA: "a2",
					featureB: "b2",
					featureC: "c1",
					featureD: "d2",
					featureE: "e1",
					featureF: 1,
				},
			},
			{
				oldestSupportedClient: "2.37.2",
				expectedConfig: {
					featureA: "a2",
					featureB: "b2",
					featureC: "c1",
					featureD: "d2",
					featureE: "e2",
					featureF: 1,
				},
			},
			{
				oldestSupportedClient: "2.45.1",
				expectedConfig: {
					featureA: "a3",
					featureB: "b2",
					featureC: "c2",
					featureD: "d2",
					featureE: "e2",
					featureF: 2,
				},
			},
			{
				oldestSupportedClient: "2.49.9",
				expectedConfig: {
					featureA: "a3",
					featureB: "b3",
					featureC: "c2",
					featureD: "d3",
					featureE: "e2",
					featureF: 2,
				},
			},
			{
				oldestSupportedClient: "2.50.0",
				expectedConfig: {
					featureA: "a4",
					featureB: "b3",
					featureC: "c3",
					featureD: "d3",
					featureE: "e2",
					featureF: 2,
				},
			},
			{
				oldestSupportedClient: "2.52.3",
				expectedConfig: {
					featureA: "a4",
					featureB: "b3",
					featureC: "c3",
					featureD: "d3",
					featureE: "e2",
					featureF: 2,
				},
			},
			{
				oldestSupportedClient: "2.63.0",
				expectedConfig: {
					featureA: "a4",
					featureB: "b4",
					featureC: "c3",
					featureD: "d4",
					featureE: "e2",
					featureF: 2,
				},
			},
			{
				oldestSupportedClient: cleanedPackageVersion,
				expectedConfig: {
					featureA: "a4",
					featureB: "b4",
					featureC: "c4",
					featureD: "d4",
					featureE: "e4",
					featureF: 4,
				},
			},
		];

		for (const testCase of testCases) {
			it(`returns correct configs for oldestSupportedClient = "${testCase.oldestSupportedClient}"`, () => {
				const config = getConfigsForOldestSupportedClient(
					testCase.oldestSupportedClient,
					testConfigMap,
				);
				assert.deepEqual(
					config,
					testCase.expectedConfig,
					`Failed for oldestSupportedClient: ${testCase.oldestSupportedClient}`,
				);
			});
		}
	});

	// The getConfigForOldestSupportedClient and getConfigsForOldestSupportedClient also provide good coverage for this.
	it("selectVersionRoundedDown", () => {
		const versions: [string, string][] = [
			["2.0.0", "x"],
			["3.0.0", "x"],
			["2.5.0", "x"],
		];
		// Matching versions
		assert.equal(selectVersionRoundedDown("2.0.0", versions), versions[0]);
		assert.equal(selectVersionRoundedDown("2.5.0", versions), versions[2]);
		assert.equal(selectVersionRoundedDown("3.0.0", versions), versions[1]);
		// Between versions
		assert.equal(selectVersionRoundedDown("2.6.0", versions), versions[2]);
		// Below lowest version
		assert.equal(selectVersionRoundedDown("1.5.0", versions), undefined);
		// Empty
		assert.equal(selectVersionRoundedDown("2.0.0", []), undefined);

		// Custom compare function: reversed so rounds up instead of down
		assert.equal(
			selectVersionRoundedDown("2.1.0", versions, (a, b) => compare(b, a)),
			versions[2],
		);
	});

	describe("validateConfigMapOverrides", () => {
		type FeatureAType = string;
		type FeatureBType = boolean;
		type FeatureCType = object;
		// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
		type TestConfigFeatures = {
			featureA: FeatureAType;
			featureB: FeatureBType;
			featureC: FeatureCType;
		};
		const testConfigValidationMap = {
			featureA: configValueToOldestSupportedClient([
				["a1", "0.5.0"],
				["a2", "2.0.0"],
				["a3", "5.0.0"],
				["a4", "8.0.0"],
			]),
			featureB: configValueToOldestSupportedClient([
				[false, "0.0.0"],
				[true, "3.0.0"],
			]),
			featureC: configValueToOldestSupportedClient([
				[{ foo: 1 }, "4.0.0"],
				[{ foo: 2 }, "7.0.0"],
				[{ bar: "baz" }, "3.0.0"],
				[{ bar: "bax" }, "8.0.0"],
				[{ qaz: true }, "9.0.0"],
			]),
		} as const satisfies ConfigValidationMap<TestConfigFeatures>;

		const compatibleCases: {
			oldestSupportedClient: SemanticVersion;
			runtimeOptions: Partial<TestConfigFeatures>;
		}[] = [
			{
				oldestSupportedClient: "0.5.0",
				runtimeOptions: { featureA: "a1", featureB: false },
			},
			{
				oldestSupportedClient: "2.0.0",
				runtimeOptions: { featureB: false, featureA: "a2" },
			},
			{
				oldestSupportedClient: "5.0.0",
				runtimeOptions: { featureA: "a3", featureB: true, featureC: { foo: 1, bax: 10 } },
			},
			{
				oldestSupportedClient: "8.0.0",
				runtimeOptions: { featureA: "a1", featureC: { foo: 1, qaz: 10 } },
			},
			{
				oldestSupportedClient: "9.0.0",
				runtimeOptions: { featureC: { foo: 2, bar: "bax", qaz: true }, featureA: "a4" },
			},
			{
				oldestSupportedClient: "2.0.0",
				runtimeOptions: { featureC: { notDocSchemaAffecting: true }, featureA: "a1" },
			},
		];

		const incompatibleCases: {
			oldestSupportedClient: SemanticVersion;
			runtimeOptions: Partial<TestConfigFeatures>;
			expectedErrorMessage: string;
		}[] = [
			{
				oldestSupportedClient: "0.5.0",
				runtimeOptions: { featureA: "a2" },
				expectedErrorMessage: `Runtime option featureA:"a2" requires runtime version 2.0.0. Please update oldestSupportedClient (currently 0.5.0) to 2.0.0 or later to proceed.`,
			},
			{
				oldestSupportedClient: "2.0.0",
				runtimeOptions: { featureB: true },
				expectedErrorMessage: `Runtime option featureB:true requires runtime version 3.0.0. Please update oldestSupportedClient (currently 2.0.0) to 3.0.0 or later to proceed.`,
			},
			{
				oldestSupportedClient: "2.0.0",
				runtimeOptions: { featureA: "a1", featureB: true },
				expectedErrorMessage: `Runtime option featureB:true requires runtime version 3.0.0. Please update oldestSupportedClient (currently 2.0.0) to 3.0.0 or later to proceed.`,
			},
			{
				oldestSupportedClient: "6.0.0",
				runtimeOptions: { featureC: { foo: 2 } },
				expectedErrorMessage: `Runtime option featureC:{"foo":2} requires runtime version 7.0.0. Please update oldestSupportedClient (currently 6.0.0) to 7.0.0 or later to proceed.`,
			},
			{
				oldestSupportedClient: "3.0.0",
				runtimeOptions: { featureA: "a1", featureC: { bar: "baz", foo: 2 } },
				expectedErrorMessage: `Runtime option featureC:{"bar":"baz","foo":2} requires runtime version 7.0.0. Please update oldestSupportedClient (currently 3.0.0) to 7.0.0 or later to proceed.`,
			},
			{
				oldestSupportedClient: "7.0.0",
				runtimeOptions: { featureC: { foo: 2, bar: "bax" } },
				expectedErrorMessage: `Runtime option featureC:{"foo":2,"bar":"bax"} requires runtime version 8.0.0. Please update oldestSupportedClient (currently 7.0.0) to 8.0.0 or later to proceed.`,
			},
			{
				oldestSupportedClient: "8.5.0",
				runtimeOptions: { featureC: { foo: 2, bar: "bax", qaz: true } },
				expectedErrorMessage: `Runtime option featureC:{"foo":2,"bar":"bax","qaz":true} requires runtime version 9.0.0. Please update oldestSupportedClient (currently 8.5.0) to 9.0.0 or later to proceed.`,
			},
		];

		for (const test of compatibleCases) {
			it(`does not throw for compatible options: ${JSON.stringify(test)}`, () => {
				assert.doesNotThrow(() => {
					validateConfigMapOverrides(
						test.oldestSupportedClient,
						test.runtimeOptions,
						testConfigValidationMap,
					);
				});
			});
		}
		for (const test of incompatibleCases) {
			it(`throws for incompatible options: ${JSON.stringify({ oldestSupportedClient: test.oldestSupportedClient, runtimeOptions: test.runtimeOptions })}`, () => {
				assert.throws(
					() => {
						validateConfigMapOverrides(
							test.oldestSupportedClient,
							test.runtimeOptions,
							testConfigValidationMap,
						);
					},
					(error: Error) => {
						assert(isFluidError(error));
						return error.message === test.expectedErrorMessage;
					},
				);
			});
		}
	});

	describe("oldestSupportedClient validation", () => {
		it("rejects patch versions for major version 3", () => {
			// Note that these tests can't be covered by the test suite below since some of the details will change as the package version changes.
			// Thus we test they error here, but not exactly which error message is thrown.
			const version = "3.0.1";
			assert.equal(isValidOldestSupportedClient(version), false);
			assert.throws(
				() => validateOldestSupportedClient(version),
				(error: Error) => {
					assert(isFluidError(error));
					return error.message.startsWith(
						`Version ${version} is not a valid OldestSupportedClientVersion`,
					);
				},
			);
		});

		it("rejects prerelease versions", () => {
			for (const version of ["2.116.1-beta.1", "3.0.0-test"] as const) {
				assert.equal(isValidOldestSupportedClient(version), false);
				assert.throws(
					() => validateOldestSupportedClient(version),
					(error: Error) => {
						assert(isFluidError(error));
						return error.message.startsWith(
							`Version ${version} is not a valid OldestSupportedClientVersion`,
						);
					},
				);
			}
		});

		const testCases: {
			version: SemanticVersion;
			checks: {
				isValidSemver: boolean;
				isGteLowestMinVersion: boolean;
				isLtePkgVersion: boolean;
				isValidOldestSupportedClientVersion: boolean;
			};
		}[] = [
			{
				version: cleanedPackageVersion,
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: true,
					isLtePkgVersion: true,
					isValidOldestSupportedClientVersion: true,
				},
			},
			{
				version: oldestSupportedClientVersionFloor,
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: true,
					isLtePkgVersion: true,
					isValidOldestSupportedClientVersion: true,
				},
			},
			{
				version: "3.999999.1",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: true,
					isLtePkgVersion: false,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				version: "3.999999.0-test",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: true,
					isLtePkgVersion: false,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				version: "2.0.0-defaults",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: false,
					isLtePkgVersion: true,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				version: "2.116.1-beta.1",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: true,
					isLtePkgVersion: true,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				version: "1.99.0",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: false,
					isLtePkgVersion: true,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				version: "0.0.0",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: false,
					isLtePkgVersion: true,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				version: "1000000.0.0",
				checks: {
					isValidSemver: true,
					isGteLowestMinVersion: true,
					isLtePkgVersion: false,
					isValidOldestSupportedClientVersion: false,
				},
			},
			{
				// @ts-expect-error This intentionally exercises runtime validation of an invalid semantic-version shape.
				version: "1.2",
				checks: {
					isValidSemver: false,
					isGteLowestMinVersion: false,
					isLtePkgVersion: false,
					isValidOldestSupportedClientVersion: false,
				},
			},
		];

		for (const testCase of testCases) {
			it(`checkValidOldestSupportedClientVerbose return value for ${testCase.version} matches expected result.`, () => {
				const {
					isValidSemver,
					isGteLowestMinVersion,
					isLtePkgVersion,
					isValidOldestSupportedClientVersion,
				} = checkValidOldestSupportedClientVerbose(testCase.version);
				assert.deepEqual(isValidSemver, testCase.checks.isValidSemver);
				assert.deepEqual(isGteLowestMinVersion, testCase.checks.isGteLowestMinVersion);
				assert.deepEqual(isLtePkgVersion, testCase.checks.isLtePkgVersion);
				assert.deepEqual(
					isValidOldestSupportedClientVersion,
					testCase.checks.isValidOldestSupportedClientVersion,
				);
			});
		}
	});
});
