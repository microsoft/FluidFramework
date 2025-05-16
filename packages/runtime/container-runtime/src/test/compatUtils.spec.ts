/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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

	describe.only("getValidationForRuntimeOptions", () => {
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
				"0.5.0": ["a1", { foo: 1 }, true],
				"2.0.0": ["a2", false],
				"8.0.0": ["a4"],
				"5.0.0": ["a3", { bar: 2 }],
			},
			featureB: {
				"0.0.0-defaults": ["b1", { bar: 2 }, false],
				"3.0.0": ["b2", true],
				"9.0.0": ["b4", { baz: 3 }],
				"6.0.0": ["b3"],
			},
			featureC: {
				"1.0.0": ["c1", false],
				"4.0.0": ["c2", { obj: true }],
				"10.0.0": ["c4", true],
				"7.0.0": ["c3"],
			},
			featureD: {
				"5.5.0": ["d3", true],
				"0.1.0": ["d1", { deep: { a: 1 } }],
				"2.5.0": ["d2", false],
				"8.5.0": ["d4", { nested: { b: 2 } }],
			},
			featureE: {
				"3.5.0": ["e2", { foo: "bar" }, true],
				"9.5.0": ["e4"],
				"6.5.0": ["e3", false],
				"0.9.0": ["e1"],
			},
			featureF: {
				"4.5.0": ["f2", false],
				"1.5.0": ["f1", { obj: 42 }, true],
				"10.5.0": ["f4", { deep: { x: 9 } }],
				"7.5.0": ["f3"],
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
				runtimeOptions: { featureD: "d4", featureF: { deep: { x: 9 } } },
			},
		];

		const incompatibleCases: {
			minVersionForCollab: SemanticVersion;
			runtimeOptions: Partial<ITestConfigValidationMap>;
		}[] = [
			{
				minVersionForCollab: "0.5.0",
				runtimeOptions: { featureA: "a2" },
			},
			{
				minVersionForCollab: "0.0.0-defaults",
				runtimeOptions: { featureB: "b2" },
			},
			{
				minVersionForCollab: "1.0.0",
				runtimeOptions: { featureC: "c2" },
			},
			{
				minVersionForCollab: "8.0.0",
				runtimeOptions: { featureD: { nested: { b: 2 } } },
			},
			{
				minVersionForCollab: "9.0.0",
				runtimeOptions: { featureF: { obj: 42, deep: { x: 9 } } },
			},
		];

		for (const test of incompatibleCases) {
			it(`throws for incompatible options: ${JSON.stringify(test)}`, () => {
				assert.throws(() => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call
					getValidationForRuntimeOptions(
						test.minVersionForCollab,
						test.runtimeOptions,
						testConfigValidationMap,
					);
				});
			});
		}
		for (const test of compatibleCases) {
			it(`does not throw for compatible options: ${JSON.stringify(test)}`, () => {
				assert.doesNotThrow(() => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
