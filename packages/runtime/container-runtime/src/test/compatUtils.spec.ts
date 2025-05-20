/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { isFluidError } from "@fluidframework/telemetry-utils/internal";

import {
	getConfigsForMinVersionForCollab,
	getValidationForRuntimeOptions,
	type ConfigMap,
	type SemanticVersion,
	type ConfigValidationMap,
} from "../compatUtils.js";

describe("compatUtils", () => {
	describe("getConfigsForMinVersionForCollab", () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- type required for ConfigMap processing
		type ITestConfigMap = {
			featureA: string;
			featureB: string;
			featureC: string;
			featureD: string;
			featureE: string;
			featureF: string;
		};
		const testConfigMap: ConfigMap<ITestConfigMap> = {
			featureA: {
				"0.5.0": "a1",
				"2.0.0": "a2",
				"8.0.0": "a4",
				"5.0.0": "a3",
			},
			featureB: {
				"0.0.0-defaults": "b1",
				"3.0.0": "b2",
				"9.0.0": "b4",
				"6.0.0": "b3",
			},
			featureC: {
				"1.0.0": "c1",
				"4.0.0": "c2",
				"10.0.0": "c4",
				"7.0.0": "c3",
			},
			featureD: {
				"5.5.0": "d3",
				"0.1.0": "d1",
				"2.5.0": "d2",
				"8.5.0": "d4",
			},
			featureE: {
				"3.5.0": "e2",
				"9.5.0": "e4",
				"6.5.0": "e3",
				"0.9.0": "e1",
			},
			featureF: {
				"4.5.0": "f2",
				"1.5.0": "f1",
				"10.5.0": "f4",
				"7.5.0": "f3",
			},
		};

		const testCases: {
			minVersionForCollab: SemanticVersion;
			expectedConfig: Partial<ITestConfigMap>;
		}[] = [
			{
				minVersionForCollab: "0.5.0",
				expectedConfig: {
					featureA: "a1",
					featureB: "b1",
					// featureC: undefined,
					featureD: "d1",
					// featureE: undefined,
					// featureF: undefined,
				},
			},
			{
				minVersionForCollab: "1.0.0",
				expectedConfig: {
					featureA: "a1",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					// featureF: undefined,
				},
			},
			{
				minVersionForCollab: "1.5.0",
				expectedConfig: {
					featureA: "a1",
					featureB: "b1",
					featureC: "c1",
					featureD: "d1",
					featureE: "e1",
					featureF: "f1",
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
					featureF: "f1",
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
					featureF: "f1",
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
					featureF: "f1",
				},
			},
			{
				minVersionForCollab: "3.0.0",
				expectedConfig: {
					featureA: "a2",
					featureB: "b2",
					featureC: "c1",
					featureD: "d2",
					featureE: "e1",
					featureF: "f1",
				},
			},
			{
				minVersionForCollab: "3.7.2",
				expectedConfig: {
					featureA: "a2",
					featureB: "b2",
					featureC: "c1",
					featureD: "d2",
					featureE: "e2",
					featureF: "f1",
				},
			},
			{
				minVersionForCollab: "5.0.1",
				expectedConfig: {
					featureA: "a3",
					featureB: "b2",
					featureC: "c2",
					featureD: "d2",
					featureE: "e2",
					featureF: "f2",
				},
			},
			{
				minVersionForCollab: "6.9.9",
				expectedConfig: {
					featureA: "a3",
					featureB: "b3",
					featureC: "c2",
					featureD: "d3",
					featureE: "e3",
					featureF: "f2",
				},
			},
			{
				minVersionForCollab: "8.2.3",
				expectedConfig: {
					featureA: "a4",
					featureB: "b3",
					featureC: "c3",
					featureD: "d3",
					featureE: "e3",
					featureF: "f3",
				},
			},
			{
				minVersionForCollab: "9.7.0",
				expectedConfig: {
					featureA: "a4",
					featureB: "b4",
					featureC: "c3",
					featureD: "d4",
					featureE: "e4",
					featureF: "f3",
				},
			},
			{
				minVersionForCollab: "10.0.0",
				expectedConfig: {
					featureA: "a4",
					featureB: "b4",
					featureC: "c4",
					featureD: "d4",
					featureE: "e4",
					featureF: "f3",
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

	describe("getValidationForRuntimeOptions", () => {
		type FeatureTestType = string | boolean | object;
		// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- type required for ConfigValidationMap processing
		type ITestConfigValidationMap = {
			featureA: FeatureTestType;
			featureB: FeatureTestType;
			featureC: FeatureTestType;
			featureD: FeatureTestType;
			featureE: FeatureTestType;
			featureF: FeatureTestType;
		};
		const testConfigValidationMap: ConfigValidationMap<ITestConfigValidationMap> = {
			featureA: {
				"a1": "0.5.0",
				"a2": "2.0.0",
				"a3": "5.0.0",
				"a4": "8.0.0",
				"false": "2.0.0",
				"true": "0.5.0",
				foo: {
					"1": "0.5.0",
					"2": "2.0.0",
				},
				bar: {
					"2": "5.0.0",
					"3": "8.0.0",
				},
			},
			featureB: {
				"b1": "0.0.0-defaults",
				"b2": "3.0.0",
				"b3": "6.0.0",
				"b4": "9.0.0",
				"false": "0.0.0-defaults",
				"true": "3.0.0",
			},
			featureC: {
				"c1": "1.0.0",
				"c2": "4.0.0",
				"c3": "7.0.0",
				"c4": "10.0.0",
				"false": "1.0.0",
				obj: {
					"true": "4.0.0",
					"false": "7.0.0",
				},
				"true": "10.0.0",
			},
			featureD: {
				"d1": "0.1.0",
				"d2": "2.5.0",
				"d3": "5.5.0",
				"d4": "8.5.0",
				"true": "5.5.0",
				"false": "2.5.0",
				"delay": "8.0.0",
			},
			featureE: {
				"e1": "0.9.0",
				"e2": "3.5.0",
				"e3": "6.5.0",
				"e4": "9.5.0",
				foo: {
					"bar": "3.5.0",
					"baz": "6.5.0",
				},
				"true": "3.5.0",
				"false": "6.5.0",
			},
			featureF: {
				"f1": "1.5.0",
				"f2": "4.5.0",
				"f3": "7.5.0",
				"f4": "10.5.0",
				obj: {
					"42": "1.5.0",
					"true": "10.5.0",
				},
				"true": "1.5.0",
				"false": "4.5.0",
			},
		};

		const compatibleCases: {
			minVersionForCollab: SemanticVersion;
			runtimeOptions: Partial<ITestConfigValidationMap>;
		}[] = [
			{
				minVersionForCollab: "1.0.0",
				runtimeOptions: { featureC: "c1", featureD: "d1" },
			},
			{
				minVersionForCollab: "2.5.0",
				runtimeOptions: { featureA: "a2", featureD: "d2" },
			},
			{
				minVersionForCollab: "9.0.0",
				runtimeOptions: { featureA: "a4", featureD: "d4" },
			},
			{
				minVersionForCollab: "10.0.0",
				runtimeOptions: { featureC: "c4", featureA: "a4", featureB: { baz: 3 } },
			},
			{
				minVersionForCollab: "10.5.0",
				runtimeOptions: { featureD: "d4", featureF: { obj: true, nonExistent: true } },
			},
		];

		const incompatibleCases: {
			minVersionForCollab: SemanticVersion;
			runtimeOptions: Partial<ITestConfigValidationMap>;
			expectedErrorMessage: string;
		}[] = [
			{
				minVersionForCollab: "0.5.0",
				runtimeOptions: { featureA: "a2" },
				expectedErrorMessage: `Runtime option featureA:"a2" is not compatible with minVersionForCollab: 0.5.0.`,
			},
			{
				minVersionForCollab: "0.0.0-defaults",
				runtimeOptions: { featureB: "b2" },
				expectedErrorMessage: `Runtime option featureB:"b2" is not compatible with minVersionForCollab: 0.0.0-defaults.`,
			},
			{
				minVersionForCollab: "5.0.0",
				runtimeOptions: { featureA: { foo: 2, bar: 3 } },
				expectedErrorMessage: `Runtime option featureA:${JSON.stringify({ foo: 2, bar: 3 })} is not compatible with minVersionForCollab: 5.0.0.`,
			},
			{
				minVersionForCollab: "7.0.0",
				runtimeOptions: { featureB: "b1", featureD: "delay" },
				expectedErrorMessage: `Runtime option featureD:"delay" is not compatible with minVersionForCollab: 7.0.0.`,
			},
			{
				minVersionForCollab: "9.0.0",
				runtimeOptions: { featureA: "a3", featureF: { obj: true } },
				expectedErrorMessage: `Runtime option featureF:${JSON.stringify({ obj: true })} is not compatible with minVersionForCollab: 9.0.0.`,
			},
		];

		for (const test of incompatibleCases) {
			it(`throws for incompatible options: ${JSON.stringify(test)}`, () => {
				assert.throws(
					() => {
						getValidationForRuntimeOptions(
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
		for (const test of compatibleCases) {
			it(`does not throw for compatible options: ${JSON.stringify(test)}`, () => {
				assert.doesNotThrow(() => {
					getValidationForRuntimeOptions(
						test.minVersionForCollab,
						test.runtimeOptions,
						testConfigValidationMap,
					);
				});
			});
		}
	});
});
