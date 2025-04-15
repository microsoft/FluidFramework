/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	getConfigsForCompatMode,
	type IContainerRuntimeOptionsVersionDependent,
	type SemanticVersion,
} from "../compatUtils.js";
import {
	disabledCompressionConfig,
	enabledCompressionConfig,
} from "../compressionDefinitions.js";

describe("compatUtils", () => {
	describe("getConfigsForCompatMode", () => {
		it('returns correct configs compatibilityMode "pre-3.0-default"', () => {
			const result = getConfigsForCompatMode("pre-3.0-default", testConfigMap);
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
		const testConfigMap: {
			[K in keyof IContainerRuntimeOptionsVersionDependent]: {
				[version: SemanticVersion]: IContainerRuntimeOptionsVersionDependent[K];
			};
		} = {
			enableGroupedBatching: {
				"1.0.0": false,
				"2.3.4": true,
			},
			compressionOptions: {
				"1.0.0": disabledCompressionConfig,
				"2.1.0": enabledCompressionConfig,
			},
			enableRuntimeIdCompressor: {
				"1.0.0": undefined as unknown as "on" | "delayed",
				"2.20.0": "on",
			},
			explicitSchemaControl: {
				"1.0.0": false,
				"2.10.0": true,
			},
			flushMode: {
				"1.0.0": FlushMode.Immediate,
				"2.0.0": FlushMode.TurnBased,
			},
			gcOptions: {
				"1.0.0": {},
				"3.0.0": { enableGCSweep: true },
			},
		};
		const testCases = [
			{
				compatibilityMode: "1.0.0",
				expectedConfig: {
					enableGroupedBatching: false,
					compressionOptions: disabledCompressionConfig,
					enableRuntimeIdCompressor: undefined,
					explicitSchemaControl: false,
					flushMode: FlushMode.Immediate,
					gcOptions: {},
				},
			},
			{
				compatibilityMode: "1.3.6",
				expectedConfig: {
					enableGroupedBatching: false,
					compressionOptions: disabledCompressionConfig,
					enableRuntimeIdCompressor: undefined,
					explicitSchemaControl: false,
					flushMode: FlushMode.Immediate,
					gcOptions: {},
				},
			},
			{
				compatibilityMode: "2.0.0",
				expectedConfig: {
					enableGroupedBatching: false,
					compressionOptions: disabledCompressionConfig,
					enableRuntimeIdCompressor: undefined,
					explicitSchemaControl: false,
					flushMode: FlushMode.TurnBased,
					gcOptions: {},
				},
			},
			{
				compatibilityMode: "2.5.1",
				expectedConfig: {
					enableGroupedBatching: true,
					compressionOptions: enabledCompressionConfig,
					enableRuntimeIdCompressor: undefined,
					explicitSchemaControl: false,
					flushMode: FlushMode.TurnBased,
					gcOptions: {},
				},
			},
			{
				compatibilityMode: "2.10.5",
				expectedConfig: {
					enableGroupedBatching: true,
					compressionOptions: enabledCompressionConfig,
					enableRuntimeIdCompressor: undefined,
					explicitSchemaControl: true,
					flushMode: FlushMode.TurnBased,
					gcOptions: {},
				},
			},
			{
				compatibilityMode: "2.50.4",
				expectedConfig: {
					enableGroupedBatching: true,
					compressionOptions: enabledCompressionConfig,
					enableRuntimeIdCompressor: "on",
					explicitSchemaControl: true,
					flushMode: FlushMode.TurnBased,
					gcOptions: {},
				},
			},
			{
				compatibilityMode: "3.0.0",
				expectedConfig: {
					enableGroupedBatching: true,
					compressionOptions: enabledCompressionConfig,
					enableRuntimeIdCompressor: "on",
					explicitSchemaControl: true,
					flushMode: FlushMode.TurnBased,
					gcOptions: { enableGCSweep: true },
				},
			},
		];
		for (const testCase of testCases) {
			it(`returns correct configs compatibilityMode "${testCase.compatibilityMode}"`, () => {
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
