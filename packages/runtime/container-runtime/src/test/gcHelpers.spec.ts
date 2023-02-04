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
				description: "Min version undefined - DON'T disable GC enforcement",
				createContainerRuntimeVersion: "0.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: undefined,
				expectedShouldDisableValue: false,
			},
			{
				description: "Min Version invalid - DON'T disable GC enforcement",
				createContainerRuntimeVersion: "0.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "not a valid version",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value unreleased; Min Version defined - DON'T disable GC enforcement",
				createContainerRuntimeVersion: "2.0.0-dev.1.2.3.45678",
				gcEnforcementMinCreateContainerRuntimeVersion: "3.0.0",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value newer than Min Version - DON'T disable GC enforcement",
				createContainerRuntimeVersion: "2.0.0-internal.3.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "2.0.0-internal.2.3.1",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value equal to Min Version - DON'T disable GC enforcement",
				createContainerRuntimeVersion: "2.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "2.0.0",
				expectedShouldDisableValue: false,
			},
			{
				description: "Persisted value older than Min Version - DO disable GC enforcement",
				createContainerRuntimeVersion: "1.0.0",
				gcEnforcementMinCreateContainerRuntimeVersion: "2.0.0",
				expectedShouldDisableValue: true,
			},
			{
				description: "No persisted value; Min Version defined - DO disable GC enforcement",
				createContainerRuntimeVersion: undefined,
				gcEnforcementMinCreateContainerRuntimeVersion: "1.0.0",
				expectedShouldDisableValue: true,
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
	});
});
