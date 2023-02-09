/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { GCVersion } from "./summaryFormat";

/** The stable version of garbage collection in production. */
export const stableGCVersion: GCVersion = 1;
/** The current version of garbage collection. */
export const currentGCVersion: GCVersion = 2;

/** This undocumented GC Option (on ContainerRuntime Options) allows an app to disable enforcing GC on old documents by incrementing this value */
export const gcTombstoneGenerationOptionName = "gcTombstoneGeneration";

// Feature gate key to turn GC on / off.
export const runGCKey = "Fluid.GarbageCollection.RunGC";
// Feature gate key to turn GC sweep on / off.
export const runSweepKey = "Fluid.GarbageCollection.RunSweep";
// Feature gate key to turn GC test mode on / off.
export const gcTestModeKey = "Fluid.GarbageCollection.GCTestMode";
// Feature gate key to expire a session after a set period of time.
export const runSessionExpiryKey = "Fluid.GarbageCollection.RunSessionExpiry";
// Feature gate key to write the gc blob as a handle if the data is the same.
export const trackGCStateKey = "Fluid.GarbageCollection.TrackGCState";
// Feature gate key to turn GC sweep log off.
export const disableSweepLogKey = "Fluid.GarbageCollection.DisableSweepLog";
// Feature gate key to disable the tombstone feature, i.e., tombstone information is not read / written into summary.
export const disableTombstoneKey = "Fluid.GarbageCollection.DisableTombstone";
// Feature gate to enable throwing an error when tombstone object is loaded (requested).
export const throwOnTombstoneLoadKey = "Fluid.GarbageCollection.ThrowOnTombstoneLoad";
// Feature gate to enable throwing an error when tombstone object is used (e.g. outgoing or incoming ops).
export const throwOnTombstoneUsageKey = "Fluid.GarbageCollection.ThrowOnTombstoneUsage";
// Feature gate to enable GC version upgrade.
export const gcVersionUpgradeToV2Key = "Fluid.GarbageCollection.GCVersionUpgradeToV2";
// Feature gate to enable GC sweep for datastores.
// TODO: Remove Test from the flag when we are confident to turn on sweep
export const sweepDatastoresKey = "Fluid.GarbageCollection.Test.SweepDataStores";

// One day in milliseconds.
export const oneDayMs = 1 * 24 * 60 * 60 * 1000;

export const defaultInactiveTimeoutMs = 7 * oneDayMs; // 7 days
export const defaultSessionExpiryDurationMs = 30 * oneDayMs; // 30 days
