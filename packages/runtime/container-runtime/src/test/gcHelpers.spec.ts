/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { shouldDisableGcEnforcement } from "../garbageCollectionHelpers";

describe("Garbage Collection Helpers Tests", () => {
	describe("shouldDisableGcEnforcement", () => {
		const testCases: {
			persisted: number | undefined;
			current: number | undefined;
			expectedShouldDisableValue: boolean;
		}[] = [
			{
				persisted: undefined,
				current: undefined,
				expectedShouldDisableValue: false,
			},
			{
				persisted: undefined,
				current: 1,
				expectedShouldDisableValue: true,
			},
			{
				persisted: 1,
				current: undefined,
				expectedShouldDisableValue: true,
			},
			{
				persisted: 1,
				current: 1,
				expectedShouldDisableValue: false,
			},
			{
				persisted: 1,
				current: 2,
				expectedShouldDisableValue: false,
			},
			{
				persisted: 2,
				current: 1,
				expectedShouldDisableValue: false,
			},
		];
		testCases.forEach(
			({
				persisted,
				current,
				expectedShouldDisableValue,
			}) => {
				it(`persisted=${persisted}, current=${current}`, () => {
					const shouldDisable = shouldDisableGcEnforcement(
						persisted,
						current,
					);
					assert.equal(
						shouldDisable,
						expectedShouldDisableValue,
					);
				});
			},
		);
	});
});
