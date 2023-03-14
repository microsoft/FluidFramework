/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockLogger,
	MonitoringContext,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils";
import { GCSummaryStateTracker, GCVersion } from "../../gc";

type GCSummaryStateTrackerWithPrivates = Omit<GCSummaryStateTracker, "latestSummaryGCVersion"> & {
	latestSummaryGCVersion: GCVersion;
};

describe("Garbage Collection Tests", () => {
	//* ONLY
	describe.only("GCSummaryStateTracker", () => {
		const mockLogger = new MockLogger();
		const mc: MonitoringContext = mixinMonitoringContext(mockLogger);
		describe("latestSummaryGCVersion", () => {
			it("Persisted < Current: Do Need Reset", () => {
				const tracker: GCSummaryStateTrackerWithPrivates = new GCSummaryStateTracker(
					true /* shouldRunGC */,
					false /* tombstoneMode */,
					mc,
					true /* wasGCRunInBaseSnapshot */,
					0 /* gcVersionInBaseSnapshot */,
				) as any;
				assert.equal(tracker.doesGCStateNeedReset(), false, "Precondition 1");
				assert.equal(tracker.currentGCVersion, 1, "Precondition 2");
				assert.equal(
					tracker.doesSummaryStateNeedReset(),
					true,
					"Should need reset: Persisted GC Version was old",
				);
			});

			it("Persisted === Current: Don't Need Reset", () => {
				const tracker: GCSummaryStateTrackerWithPrivates = new GCSummaryStateTracker(
					true /* shouldRunGC */,
					false /* tombstoneMode */,
					mc,
					true /* wasGCRunInBaseSnapshot */,
					1 /* gcVersionInBaseSnapshot */,
				) as any;
				assert.equal(tracker.doesGCStateNeedReset(), false, "Precondition 1");
				assert.equal(tracker.currentGCVersion, 1, "Precondition 2");
				assert.equal(
					tracker.doesSummaryStateNeedReset(),
					false,
					"Shouldn't need reset: GC Versions match",
				);
			});

			it("Persisted > Current: Don't Need Reset", () => {
				// Set value to true for gcVersionUpgradeToV2Key
				//*				const mc: MonitoringContext = mixinMonitoringContext(mockLogger, { getRawConfig: (name: string) => name === gcVersionUpgradeToV2Key ? true : undefined });
				const tracker: GCSummaryStateTrackerWithPrivates = new GCSummaryStateTracker(
					true /* shouldRunGC */,
					false /* tombstoneMode */,
					mc,
					true /* wasGCRunInBaseSnapshot */,
					2 /* gcVersionInBaseSnapshot */,
				) as any;
				assert.equal(tracker.doesGCStateNeedReset(), false, "Precondition 1");
				assert.equal(tracker.currentGCVersion, 1, "Precondition 2");

				// This covers the case where we rolled back an upgrade. Containers that successfully "upgraded" (reset) shouldn't need to do it again.
				assert.equal(
					tracker.doesSummaryStateNeedReset(),
					false,
					"Shouldn't need reset: Persisted GC Version is not old",
				);
			});
		});
	});
});
