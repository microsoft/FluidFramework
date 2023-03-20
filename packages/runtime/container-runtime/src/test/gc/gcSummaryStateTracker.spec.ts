/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { GCSummaryStateTracker, GCVersion } from "../../gc";

type GCSummaryStateTrackerWithPrivates = Omit<GCSummaryStateTracker, "latestSummaryGCVersion"> & {
	latestSummaryGCVersion: GCVersion;
};

describe("Garbage Collection Tests", () => {
	describe("GCSummaryStateTracker", () => {
		describe("latestSummaryGCVersion", () => {
			it("Persisted < Current: Do Need Reset", () => {
				const tracker: GCSummaryStateTrackerWithPrivates = new GCSummaryStateTracker(
					{
						shouldRunGC: true,
						tombstoneMode: false,
						gcVersionInBaseSnapshot: 0,
						gcVersionInEffect: 1,
					},
					true /* wasGCRunInBaseSnapshot */,
				) as any;
				assert.equal(tracker.doesGCStateNeedReset, false, "Precondition 1");
				assert.equal(tracker.currentGCVersion, 1, "Precondition 2");
				assert.equal(
					tracker.doesSummaryStateNeedReset,
					true,
					"Should need reset: Persisted GC Version was old",
				);
			});

			it("Persisted === Current: Don't Need Reset", () => {
				const tracker: GCSummaryStateTrackerWithPrivates = new GCSummaryStateTracker(
					{
						shouldRunGC: true,
						tombstoneMode: false,
						gcVersionInBaseSnapshot: 1,
						gcVersionInEffect: 1,
					},
					true /* wasGCRunInBaseSnapshot */,
				) as any;
				assert.equal(tracker.doesGCStateNeedReset, false, "Precondition 1");
				assert.equal(tracker.currentGCVersion, 1, "Precondition 2");
				assert.equal(
					tracker.doesSummaryStateNeedReset,
					false,
					"Shouldn't need reset: GC Versions match",
				);
			});

			it("Persisted > Current: Do Need Reset", () => {
				// Set value to true for gcVersionUpgradeToV2Key
				const tracker: GCSummaryStateTrackerWithPrivates = new GCSummaryStateTracker(
					{
						shouldRunGC: true,
						tombstoneMode: false,
						gcVersionInBaseSnapshot: 2,
						gcVersionInEffect: 1,
					},
					true /* wasGCRunInBaseSnapshot */,
				) as any;
				assert.equal(tracker.doesGCStateNeedReset, false, "Precondition 1");
				assert.equal(tracker.currentGCVersion, 1, "Precondition 2");

				// This covers the case where we rolled back an upgrade. Containers that successfully "upgraded" (reset) shouldn't need to do it again.
				assert.equal(
					tracker.doesSummaryStateNeedReset,
					true,
					"Should need reset: Persisted GC Version is not old",
				);
			});
		});
	});
});
