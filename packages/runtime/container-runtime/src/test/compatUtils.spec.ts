/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	getConfigsForCompatMode,
	type ConfigMap,
	type SemanticVersion,
} from "../compatUtils.js";

describe("compatUtils", () => {
	describe("getConfigsForCompatMode", () => {
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
			// We use string instead of SemanticVersion for `minVersionForCollab`
			// so we can test versions that don't start with 1 or 2.
			minVersionForCollab: string;
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
				const config = getConfigsForCompatMode(
					testCase.minVersionForCollab as SemanticVersion,
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
});
