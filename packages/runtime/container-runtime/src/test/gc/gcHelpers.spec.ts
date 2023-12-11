/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { GCFeatureMatrix } from "../../gc";
// eslint-disable-next-line import/no-internal-modules
import { shouldAllowGcSweep } from "../../gc/gcHelpers";

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
				expectedShouldAllowValue: false, // Default (if no current) is now false to align with Sweep (Delete) behavior
			},
			{
				persisted: undefined,
				current: 1,
				expectedShouldAllowValue: false,
			},
			{
				persisted: 1,
				current: undefined,
				expectedShouldAllowValue: false, // Default (if no current) is now false to align with Sweep (Delete) behavior
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
		testCases.forEach(({ persisted, current, expectedShouldAllowValue }) => {
			it(`persisted=${persisted}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcSweep({ tombstoneGeneration: persisted }, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		});
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
				expectedShouldAllowValue: false,
			},
			{
				persisted: { gcGeneration: 1 },
				current: undefined,
				expectedShouldAllowValue: false,
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
			{
				persisted: { gcGeneration: 1, tombstoneGeneration: 0 },
				current: 1,
				expectedShouldAllowValue: true,
			},
			// This case will never happen in practice, but we want to make sure it's handled correctly
			{
				persisted: { gcGeneration: 1, tombstoneGeneration: 0 },
				current: 0,
				expectedShouldAllowValue: false, // if gcGeneration is provided, don't check against tombstoneGeneration
			},
		];
		testCases.forEach(({ persisted, current, expectedShouldAllowValue }) => {
			it(`persisted=${JSON.stringify(persisted)}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcSweep(persisted, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		});
	});
});
