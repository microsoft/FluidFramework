/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeVersionComparableAsString, shouldDisableGcEnforcementForOldContainer } from "../garbageCollectionHelpers";
import { pkgVersion } from "../packageVersion";

describe("Garbage Collection Helpers Tests", () => {
	describe("makeVersionComparableAsString", () => {
		it("Current version can be made comparable", function () {
			// The only accepted pre-release version format is -internal (e.g 2.0.0-internal.1.2.3)
			// We do use other pre-release versions in some non-publishing pipelines, so exclude those known cases
			if (pkgVersion.includes("-") && !pkgVersion.includes("-internal.")) {
				this.skip();
			}

			assert.notEqual(makeVersionComparableAsString(pkgVersion), undefined, "pkgVersion should be parsed properly");
		});
		it("hello", () => {
			assert.equal(makeVersionComparableAsString("2.0.0-internal.1.4.18"), "0002.0000.0000-internal.0001.0004.0018");
			assert.equal(makeVersionComparableAsString("2.0.0-internal.1.4.1"),  "0002.0000.0000-internal.0001.0004.0008");
		});
	});
	describe("shouldDisableGcEnforcementForOldContainer", () => {
		const testCases: {
			description: string;
			createContainerRuntimeVersion: string | undefined;
			gcEnforcementCurrentValue: string | undefined;
			expectedShouldDisableValue: boolean;
		}[] = [
			{
				description: "Both versions undefined - DON'T disable",
				createContainerRuntimeVersion: undefined,
				gcEnforcementCurrentValue: undefined,
				expectedShouldDisableValue: false,
			},
			{
				description: "Min version undefined - DON'T disable",
				createContainerRuntimeVersion: "0.0.0",
				gcEnforcementCurrentValue: undefined,
				expectedShouldDisableValue: false,
			},
			{
				description: "Min Version invalid - DON'T disable",
				createContainerRuntimeVersion: "0.0.0",
				gcEnforcementCurrentValue: "not a valid version",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value unreleased; Min Version defined - DON'T disable",
				createContainerRuntimeVersion: "2.0.0-dev.1.2.3.45678",
				gcEnforcementCurrentValue: "3.0.0",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value newer than Min Version - DON'T disable",
				createContainerRuntimeVersion: "2.0.0-internal.3.0.0",
				gcEnforcementCurrentValue: "2.0.0-internal.2.3.1",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value equal to Min Version - DON'T disable",
				createContainerRuntimeVersion: "2.0.0",
				gcEnforcementCurrentValue: "2.0.0",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value older than Min Version - DO disable",
				createContainerRuntimeVersion: "1.0.0",
				gcEnforcementCurrentValue: "2.0.0",
				expectedShouldDisableValue: true,
			},
			{
				description: "No persisted value; Min Version defined - DO disable",
				createContainerRuntimeVersion: undefined,
				gcEnforcementCurrentValue: "1.0.0",
				expectedShouldDisableValue: true,
			},
			{
				description: "Invalid persisted value - DON'T disable",
				createContainerRuntimeVersion: "2.0.0-dev.3.0.0",
				gcEnforcementCurrentValue: "3.0.0",
				expectedShouldDisableValue: false,
			},
		];
		testCases.forEach(
			({
				description,
				createContainerRuntimeVersion,
				gcEnforcementCurrentValue,
				expectedShouldDisableValue,
			}) => {
				it(description, () => {
					const shouldDisable = shouldDisableGcEnforcementForOldContainer(
						createContainerRuntimeVersion,
						gcEnforcementCurrentValue,
					);
					assert.equal(
						shouldDisable,
						expectedShouldDisableValue,
						"sweepEnabled incorrect",
					);
				});
			},
		);

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
		//* Double digits
	});
});
