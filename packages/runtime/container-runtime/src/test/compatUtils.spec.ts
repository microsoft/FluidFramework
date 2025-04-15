/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	defaultCompatibilityMode,
	getConfigsForCompatMode,
	type IConfigMap,
	type SemanticVersion,
} from "../compatUtils.js";
import { enabledCompressionConfig } from "../compressionDefinitions.js";

describe("compatUtils", () => {
	describe("getConfigsForCompatMode", () => {
		it("returns correct configs for compatibilityMode = defaultCompatibilityMode", () => {
			const result = getConfigsForCompatMode(
				defaultCompatibilityMode as SemanticVersion,
				testConfigMap,
			);
			// We should return the hardcoded default configs for pre-3.0-default, even if using a different config map
			assert.deepEqual(result, {
				gcOptions: {},
				flushMode: FlushMode.TurnBased,
				compressionOptions: enabledCompressionConfig,
				enableRuntimeIdCompressor: undefined as unknown as "on" | "delayed",
				enableGroupedBatching: true,
				explicitSchemaControl: false,
			});
		});
		const testConfigMap: IConfigMap = {
			featureA: {
				"0.5.0": "a1",
				"2.0.0": "a2",
				"8.0.0": "a4",
				"5.0.0": "a3",
			},
			featureB: {
				"0.0.1": "b1",
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
			compatibilityMode: SemanticVersion;
			expectedConfig: Record<string, string | undefined>;
		}[] = [
			{
				compatibilityMode: "0.5.0",
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
				compatibilityMode: "1.0.0",
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
				compatibilityMode: "1.5.0",
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
				compatibilityMode: "2.0.0",
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
				compatibilityMode: "2.1.5",
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
				compatibilityMode: "2.5.0",
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
				compatibilityMode: "3.0.0",
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
				compatibilityMode: "3.7.2",
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
				compatibilityMode: "5.0.1",
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
				compatibilityMode: "6.9.9",
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
				compatibilityMode: "8.2.3",
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
				compatibilityMode: "9.7.0",
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
				compatibilityMode: "10.0.0",
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
			it(`returns correct configs for compatibilityMode = "${testCase.compatibilityMode}"`, () => {
				const config = getConfigsForCompatMode(testCase.compatibilityMode, testConfigMap);
				assert.deepEqual(
					config,
					testCase.expectedConfig,
					`Failed for compatibilityMode: ${testCase.compatibilityMode}`,
				);
			});
		}
	});
});
