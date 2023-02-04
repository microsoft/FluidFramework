/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { shouldDisableGcEnforcementForOldContainer } from "../garbageCollectionHelpers";

//* ONLY
//* ONLY
//* ONLY
//* ONLY
//* ONLY
//* ONLY
describe.only("Garbage Collection Helpers Tests", () => {
	describe("shouldDisableGcEnforcementForOldContainer", () => {
		const testCases: {
			description: string;
			createContainerRuntimeVersion: string | undefined;
			gcEnforcementMinCreateContainerRuntimeVersion: string | undefined;
			expectedShouldDisableValue: boolean;
		}[] = [
			{
				description: "Both versions undefined - DON'T disable",
				createContainerRuntimeVersion: undefined,
				gcEnforcementMinCreateContainerRuntimeVersion: undefined,
				expectedShouldDisableValue: false,
			},
			{
				description: "Min version undefined - DON'T disable",
				createContainerRuntimeVersion: "0.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: undefined,
				expectedShouldDisableValue: false,
			},
			{
				description: "Min Version invalid - DON'T disable",
				createContainerRuntimeVersion: "0.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "not a valid version",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value unreleased; Min Version defined - DON'T disable",
				createContainerRuntimeVersion: "2.0.0-dev.1.2.3.45678",
				gcEnforcementMinCreateContainerRuntimeVersion: "3.0.0",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value newer than Min Version - DON'T disable",
				createContainerRuntimeVersion: "2.0.0-internal.3.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "2.0.0-internal.2.3.1",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value equal to Min Version - DON'T disable",
				createContainerRuntimeVersion: "2.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "2.0.0",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value older than Min Version - DO disable",
				createContainerRuntimeVersion: "1.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "2.0.0",
				expectedShouldDisableValue: true,
			},
			{
				description: "No persisted value; Min Version defined - DO disable",
				createContainerRuntimeVersion: undefined,
				gcEnforcementMinCreateContainerRuntimeVersion: "1.0.0",
				expectedShouldDisableValue: true,
			},
			{
				description: "Invalid persisted value - DON'T disable",
				createContainerRuntimeVersion: "2.0.0-dev.3.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "3.0.0",
				expectedShouldDisableValue: false,
			},
		];
		testCases.forEach(({
			description,
			createContainerRuntimeVersion,
			gcEnforcementMinCreateContainerRuntimeVersion,
			expectedShouldDisableValue,
		}) => {
			it(description, () => {
				const shouldDisable = shouldDisableGcEnforcementForOldContainer(
					createContainerRuntimeVersion,
					gcEnforcementMinCreateContainerRuntimeVersion);
				assert.equal(shouldDisable, expectedShouldDisableValue, "sweepEnabled incorrect");
			});
		});

		it("sort test", () => {
			function compareFn(a: string, b: string) {
				return shouldDisableGcEnforcementForOldContainer(a, b) ? -1 : 1;
			}
			const inputs = [
				"999.999.999",
				"2.0.0-internal.1.2.3",
				"1.2.3",
				"2.0.0-internal.1.2.4",
				"2.0.0-internal.1.2.2",
				"2.0.0-internal.1.3.2",
				"2.0.0-internal.2.0.0",
				"3.0.0-internal.0.0.1",
				"1.0.0-internal.9.0.0",
				"3.0.0",
				"2.0.0",
				"2.2.0",
				"2.2.2-internal.1.2.3",
				"2.2.2",
			];
			const sorted = [
				"1.0.0-internal.9.0.0",
				"1.2.3",
				"2.0.0-internal.1.2.2",
				"2.0.0-internal.1.2.3",
				"2.0.0-internal.1.2.4",
				"2.0.0-internal.1.3.2",
				"2.0.0-internal.2.0.0",
				"2.0.0",
				"2.2.0",
				"2.2.2-internal.1.2.3",
				"2.2.2",
				"3.0.0-internal.0.0.1",
				"3.0.0",
				"999.999.999",
			];
			const output = inputs.sort(compareFn);
			assert.deepEqual(output, sorted, "Sort didn't go as expected");
		});
		//* Add a test case that compares 2.0.0-internal.2.3.1 with the current pkgVersion to ensure it's always good
	});
});
