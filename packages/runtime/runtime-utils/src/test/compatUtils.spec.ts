/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import { isFluidError } from "@fluidframework/telemetry-utils/internal";

import {
	getConfigsForMinVersionForCollab,
	validateConfigMapOverrides,
	type ConfigMap,
	type SemanticVersion,
	type ConfigValidationMap,
	configValueToMinVersionForCollab,
	lowestMinVersionForCollab,
	checkValidMinVersionForCollabVerbose,
	cleanedPackageVersion,
	validateMinimumVersionForCollab,
} from "../compatibilityBase.js";
import { pkgVersion } from "../packageVersion.js";

describe("compatibilityBase", () => {
	it("cleanedPackageVersion", () => {
		validateMinimumVersionForCollab(cleanedPackageVersion);
	});

	describe("getConfigsForMinVersionForCollab", () => {
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
				"2.0.0-defaults": "a1",
				"2.50.0": "a4",
				"2.40.0": "a3",
				"1.0.0": "a0",
			},
			featureB: {
				"1.0.0": "b1",
				"2.30.0": "b2",
				"2.60.0": "b4",
				"2.46.0": "b3",
			},
			featureC: {
				"1.0.0": "c1",
				"2.40.0": "c2",
				"2.70.0": "c4",
				"2.50.0": "c3",
			},
			featureD: {
				"2.46.0": "d3",
				"2.5.0": "d2",
				"2.55.0": "d4",
				"1.0.0": "d1",
			},
			featureE: {
				"2.35.0": "e2",
				"2.73.0": "e4",
				"2.65.0": "e3",
				"1.0.0": "e1",
			},
			featureF: {
				"1.0.0": 0,
				"2.45.0": 2,
				"1.5.0": 1,
				"2.71.0": 4,
				"2.65.0": 3,
			},
		};

		const testCases: {
			minVersionForCollab: MinimumVersionForCollab;
			expectedConfig: ITestConfigMap;
		}[] = [
			{
				minVersionForCollab: "1.0.0",
				expectedConfig: {
					featureA: "a0",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					featureF: 0,
				},
			},
			{
				minVersionForCollab: "1.5.0",
				expectedConfig: {
					featureA: "a0",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					featureF: 1,
				},
			},
			{
				minVersionForCollab: "2.0.0-defaults",
				expectedConfig: {
					featureA: "a1",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					featureF: 1,
				},
			},
			{
				minVersionForCollab: "2.0.0",
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
				minVersionForCollab: "2.1.5",
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
				minVersionForCollab: "2.5.0",
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
				minVersionForCollab: "2.30.0",
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
				minVersionForCollab: "2.37.2",
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
				minVersionForCollab: "2.45.1",
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
				minVersionForCollab: "2.49.9",
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
				minVersionForCollab: "2.50.0",
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
				minVersionForCollab: "2.52.3",
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
				minVersionForCollab: "2.63.0",
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
				minVersionForCollab: cleanedPackageVersion,
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
			it(`returns correct configs for minVersionForCollab = "${testCase.minVersionForCollab}"`, () => {
				const config = getConfigsForMinVersionForCollab(
					testCase.minVersionForCollab,
					testConfigMap,
				);
				assert.deepEqual(
					config,
					testCase.expectedConfig,
					`Failed for minVersionForCollab: ${testCase.minVersionForCollab}`,
				);
			});
		}
	});

	describe("validateRuntimeOptions", () => {
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
			featureA: configValueToMinVersionForCollab([
				["a1", "0.5.0"],
				["a2", "2.0.0"],
				["a3", "5.0.0"],
				["a4", "8.0.0"],
			]),
			featureB: configValueToMinVersionForCollab([
				[false, "0.0.0"],
				[true, "3.0.0"],
			]),
			featureC: configValueToMinVersionForCollab([
				[{ foo: 1 }, "4.0.0"],
				[{ foo: 2 }, "7.0.0"],
				[{ bar: "baz" }, "3.0.0"],
				[{ bar: "bax" }, "8.0.0"],
				[{ qaz: true }, "9.0.0"],
			]),
		} as const satisfies ConfigValidationMap<TestConfigFeatures>;

		const compatibleCases: {
			minVersionForCollab: SemanticVersion;
			runtimeOptions: Partial<TestConfigFeatures>;
		}[] = [
			{
				minVersionForCollab: "0.5.0",
				runtimeOptions: { featureA: "a1", featureB: false },
			},
			{
				minVersionForCollab: "2.0.0",
				runtimeOptions: { featureB: false, featureA: "a2" },
			},
			{
				minVersionForCollab: "5.0.0",
				runtimeOptions: { featureA: "a3", featureB: true, featureC: { foo: 1, bax: 10 } },
			},
			{
				minVersionForCollab: "8.0.0",
				runtimeOptions: { featureA: "a1", featureC: { foo: 1, qaz: 10 } },
			},
			{
				minVersionForCollab: "9.0.0",
				runtimeOptions: { featureC: { foo: 2, bar: "bax", qaz: true }, featureA: "a4" },
			},
			{
				minVersionForCollab: "1.0.0",
				runtimeOptions: { featureC: { notDocSchemaAffecting: true }, featureA: "a1" },
			},
		];

		const incompatibleCases: {
			minVersionForCollab: SemanticVersion;
			runtimeOptions: Partial<TestConfigFeatures>;
			expectedErrorMessage: string;
		}[] = [
			{
				minVersionForCollab: "0.5.0",
				runtimeOptions: { featureA: "a2" },
				expectedErrorMessage: `Runtime option featureA:"a2" requires runtime version 2.0.0. Please update minVersionForCollab (currently 0.5.0) to 2.0.0 or later to proceed.`,
			},
			{
				minVersionForCollab: "2.0.0",
				runtimeOptions: { featureB: true },
				expectedErrorMessage: `Runtime option featureB:true requires runtime version 3.0.0. Please update minVersionForCollab (currently 2.0.0) to 3.0.0 or later to proceed.`,
			},
			{
				minVersionForCollab: "2.0.0",
				runtimeOptions: { featureA: "a1", featureB: true },
				expectedErrorMessage: `Runtime option featureB:true requires runtime version 3.0.0. Please update minVersionForCollab (currently 2.0.0) to 3.0.0 or later to proceed.`,
			},
			{
				minVersionForCollab: "6.0.0",
				runtimeOptions: { featureC: { foo: 2 } },
				expectedErrorMessage: `Runtime option featureC:{"foo":2} requires runtime version 7.0.0. Please update minVersionForCollab (currently 6.0.0) to 7.0.0 or later to proceed.`,
			},
			{
				minVersionForCollab: "3.0.0",
				runtimeOptions: { featureA: "a1", featureC: { bar: "baz", foo: 2 } },
				expectedErrorMessage: `Runtime option featureC:{"bar":"baz","foo":2} requires runtime version 7.0.0. Please update minVersionForCollab (currently 3.0.0) to 7.0.0 or later to proceed.`,
			},
			{
				minVersionForCollab: "7.0.0",
				runtimeOptions: { featureC: { foo: 2, bar: "bax" } },
				expectedErrorMessage: `Runtime option featureC:{"foo":2,"bar":"bax"} requires runtime version 8.0.0. Please update minVersionForCollab (currently 7.0.0) to 8.0.0 or later to proceed.`,
			},
			{
				minVersionForCollab: "8.5.0",
				runtimeOptions: { featureC: { foo: 2, bar: "bax", qaz: true } },
				expectedErrorMessage: `Runtime option featureC:{"foo":2,"bar":"bax","qaz":true} requires runtime version 9.0.0. Please update minVersionForCollab (currently 8.5.0) to 9.0.0 or later to proceed.`,
			},
		];

		for (const test of compatibleCases) {
			it(`does not throw for compatible options: ${JSON.stringify(test)}`, () => {
				assert.doesNotThrow(() => {
					validateConfigMapOverrides(
						test.minVersionForCollab,
						test.runtimeOptions,
						testConfigValidationMap,
					);
				});
			});
		}
		for (const test of incompatibleCases) {
			it(`throws for incompatible options: ${JSON.stringify({ minVersionForCollab: test.minVersionForCollab, runtimeOptions: test.runtimeOptions })}`, () => {
				assert.throws(
					() => {
						validateConfigMapOverrides(
							test.minVersionForCollab,
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

	describe("minVersionForCollab validation", () => {
		const testCases: {
			version: MinimumVersionForCollab;
			checks: {
				isValidSemver: boolean;
				isGteLowestMinVersion: boolean;
				isLtePkgVersion: boolean;
			};
		}[] = [
			{
				version: pkgVersion,
				checks: { isValidSemver: true, isGteLowestMinVersion: true, isLtePkgVersion: true },
			},
			{
				version: lowestMinVersionForCollab,
				checks: { isValidSemver: true, isGteLowestMinVersion: true, isLtePkgVersion: true },
			},
			{
				// Cast since this is not a valid MinimumVersionForCollab, but is a valid semver.
				version: "0.0.0" as MinimumVersionForCollab,
				checks: { isValidSemver: true, isGteLowestMinVersion: false, isLtePkgVersion: true },
			},
			{
				// Cast since this is not a valid MinimumVersionForCollab, but is a valid semver.
				version: "1000000.0.0" as MinimumVersionForCollab,
				checks: { isValidSemver: true, isGteLowestMinVersion: true, isLtePkgVersion: false },
			},
			{
				// Cast since this is not a valid MinimumVersionForCollab and is not a valid semver.
				version: "1.2" as MinimumVersionForCollab,
				checks: { isValidSemver: false, isGteLowestMinVersion: false, isLtePkgVersion: false },
			},
		];

		for (const testCase of testCases) {
			it(`checkValidMinVersionForCollabVerbose return value for ${testCase.version} matches expected result.`, () => {
				const { isValidSemver, isGteLowestMinVersion, isLtePkgVersion } =
					checkValidMinVersionForCollabVerbose(testCase.version);
				assert.deepEqual(isValidSemver, testCase.checks.isValidSemver);
				assert.deepEqual(isGteLowestMinVersion, testCase.checks.isGteLowestMinVersion);
				assert.deepEqual(isLtePkgVersion, testCase.checks.isLtePkgVersion);
			});
		}
	});
});
