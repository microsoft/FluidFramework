/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { shouldAllowGcTombstoneEnforcement } from "../../gc";

describe("Garbage Collection Helpers Tests", () => {
	describe("shouldAllowGcTombstoneEnforcement", () => {
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
		testCases.forEach(({ persisted, current, expectedShouldAllowValue }) => {
			it(`persisted=${persisted}, current=${current}`, () => {
				const shouldAllow = shouldAllowGcTombstoneEnforcement(persisted, current);
				assert.equal(shouldAllow, expectedShouldAllowValue);
			});
		});
	});
});
