/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	dataStoreNodePathOnly,
	shouldAllowGcSweep,
	urlToGCNodePath,
	// eslint-disable-next-line import/no-internal-modules
} from "../../gc/gcHelpers.js";
import { GCFeatureMatrix } from "../../gc/index.js";

describe("Garbage Collection Helpers Tests", () => {
	describe("[TEMP] shouldAllowGcTombstoneEnforcement - Show behavior change as it's replaced by shouldAllowGcSweep", () => {
		const testCases: {
			persisted: number | undefined;
			current: number | undefined;
			expectedShouldAllowValue: boolean;
		}[] = [
			{
				persisted: undefined,
				current: undefined,
				expectedShouldAllowValue: true,
			},
			{
				persisted: undefined,
				current: 1,
				expectedShouldAllowValue: false,
			},
			{
				persisted: 1,
				current: undefined,
				expectedShouldAllowValue: true,
			},
			{
				persisted: 1,
				current: 1,
				expectedShouldAllowValue: true,
			},
			{
				persisted: 1,
				current: 2,
				expectedShouldAllowValue: false,
			},
			{
				persisted: 2,
				current: 1,
				expectedShouldAllowValue: false,
			},
		];
		for (const { persisted, current, expectedShouldAllowValue } of testCases) {
			it(`persisted=${persisted}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcSweep({ tombstoneGeneration: persisted }, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		}
	});

	describe("shouldAllowGcSweep", () => {
		const testCases: {
			persisted: GCFeatureMatrix;
			current: number | undefined;
			expectedShouldAllowValue: boolean;
		}[] = [
			{
				persisted: {},
				current: undefined,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { gcGeneration: 1 },
				current: undefined,
				expectedShouldAllowValue: true,
			},
			{
				persisted: {},
				current: 0,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { tombstoneGeneration: 0 },
				current: 0,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { tombstoneGeneration: 1 },
				current: 1,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { tombstoneGeneration: 1 },
				current: 0,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { gcGeneration: 0 },
				current: 0,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { gcGeneration: 1 },
				current: 1,
				expectedShouldAllowValue: true,
			},
			{
				persisted: { gcGeneration: 1 },
				current: 2,
				expectedShouldAllowValue: false,
			},
			{
				persisted: { gcGeneration: 2 },
				current: 1,
				expectedShouldAllowValue: false,
			},
		];
		for (const { persisted, current, expectedShouldAllowValue } of testCases) {
			it(`persisted=${JSON.stringify(persisted)}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcSweep(persisted, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		}
	});

	describe("dataStoreNodePathOnly", () => {
		const testCases: {
			path: string;
			expected: string;
		}[] = [
			{
				path: "/",
				expected: "/",
			},
			{
				path: "/a",
				expected: "/a",
			},
			{
				path: "/a/b",
				expected: "/a",
			},
			{
				path: "/a/b/c",
				expected: "/a",
			},
		];
		for (const { path, expected } of testCases) {
			it(`path=${path}`, () => {
				const result = dataStoreNodePathOnly(path);
				assert.equal(result, expected);
			});
		}
	});

	describe("urlToGCNodePath", () => {
		const testCases: {
			url: string;
			expected: string;
		}[] = [
			{
				url: "/a",
				expected: "/a",
			},
			{
				url: "/a/",
				expected: "/a",
			},
			{
				url: "/a/b",
				expected: "/a/b",
			},
			{
				url: "/a/b/",
				expected: "/a/b",
			},
			{
				url: "/a?x=1",
				expected: "/a",
			},
			{
				url: "/a/?x=1",
				expected: "/a",
			},
			{
				url: "/a/b?x=1",
				expected: "/a/b",
			},
			{
				url: "/a/b/?x=1",
				expected: "/a/b",
			},
		];
		for (const { url, expected } of testCases) {
			it(`url=${url}`, () => {
				const result = urlToGCNodePath(url);
				assert.equal(result, expected);
			});
		}
	});
});
