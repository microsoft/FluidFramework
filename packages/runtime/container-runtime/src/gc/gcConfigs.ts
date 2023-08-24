/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MonitoringContext, UsageError } from "@fluidframework/telemetry-utils";
import { IContainerRuntimeMetadata } from "../summary";
import {
	currentGCVersion,
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	disableTombstoneKey,
	GCFeatureMatrix,
	gcSweepGenerationOptionName,
	gcTestModeKey,
	gcTombstoneGenerationOptionName,
	GCVersion,
	gcVersionUpgradeToV3Key,
	IGarbageCollectorConfigs,
	IGCRuntimeOptions,
	maxSnapshotCacheExpiryMs,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	stableGCVersion,
} from "./gcDefinitions";
import { getGCVersion, shouldAllowGcSweep } from "./gcHelpers";

/**
 * Generates configurations for the Garbage Collector that it uses to determine what to run and how.
 * @param mc - The monitoring context for reading configs from the config provider.
 * @param createParams - The creation params:
 * gcOptions - The garbage collector runtime options.
 * metadata - The container runtime's createParams.metadata.
 * existing - Whether the container is new or an existing one.
 * @returns The garbage collector configurations.
 */
export function generateGCConfigs(
	mc: MonitoringContext,
	createParams: {
		gcOptions: IGCRuntimeOptions;
		metadata: IContainerRuntimeMetadata | undefined;
		existing: boolean;
	},
): IGarbageCollectorConfigs {
	let gcEnabled: boolean;
	let sessionExpiryTimeoutMs: number | undefined;
	let sweepTimeoutMs: number | undefined;
	let persistedGcFeatureMatrix: GCFeatureMatrix | undefined;
	let gcVersionInBaseSnapshot: GCVersion | undefined;

	/**
	 * The following GC state is enabled during container creation and cannot be changed throughout its lifetime:
	 * 1. Whether running GC mark phase is allowed or not.
	 * 2. Whether running GC sweep phase is allowed or not.
	 * 3. Whether GC session expiry is enabled or not.
	 * For existing containers, we get this information from the createParams.metadata blob of its summary.
	 */
	if (createParams.existing) {
		gcVersionInBaseSnapshot = getGCVersion(createParams.metadata);
		// Existing documents which did not have createParams.metadata blob or had GC disabled have version as 0. For all
		// other existing documents, GC is enabled.
		gcEnabled = gcVersionInBaseSnapshot > 0;
		sessionExpiryTimeoutMs = createParams.metadata?.sessionExpiryTimeoutMs;
		sweepTimeoutMs =
			createParams.metadata?.sweepTimeoutMs ?? computeSweepTimeout(sessionExpiryTimeoutMs); // Backfill old documents that didn't persist this
		persistedGcFeatureMatrix = createParams.metadata?.gcFeatureMatrix;
	} else {
		const tombstoneGeneration = createParams.gcOptions[gcTombstoneGenerationOptionName];
		const sweepGeneration = createParams.gcOptions[gcSweepGenerationOptionName];

		// Sweep should not be enabled (via sweepGeneration value) without enabling GC mark phase.
		if (sweepGeneration !== undefined && createParams.gcOptions.gcAllowed === false) {
			throw new UsageError("GC sweep phase cannot be enabled without enabling GC mark phase");
		}

		// This Test Override only applies for new containers
		const testOverrideSweepTimeoutMs = mc.config.getNumber(
			"Fluid.GarbageCollection.TestOverride.SweepTimeoutMs",
		);

		// For new documents, GC is enabled by default. It can be explicitly disabled by setting the gcAllowed
		// flag in GC options to false.
		gcEnabled = createParams.gcOptions.gcAllowed !== false;

		// Set the Session Expiry if GC is enabled and session expiry flag isn't explicitly set to false.
		if (gcEnabled && mc.config.getBoolean(runSessionExpiryKey) !== false) {
			sessionExpiryTimeoutMs =
				createParams.gcOptions.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs;
		}
		sweepTimeoutMs = testOverrideSweepTimeoutMs ?? computeSweepTimeout(sessionExpiryTimeoutMs);

		if (tombstoneGeneration !== undefined || sweepGeneration !== undefined) {
			persistedGcFeatureMatrix = {
				tombstoneGeneration,
				sweepGeneration,
			};
		}
	}

	// Is sweepEnabled for this document?
	const sweepEnabled = shouldAllowGcSweep(
		persistedGcFeatureMatrix ?? {} /* persistedGenerations */,
		createParams.gcOptions[gcSweepGenerationOptionName] /* currentGeneration */,
	);

	// If version upgrade is not enabled, fall back to the stable GC version.
	const gcVersionInEffect =
		mc.config.getBoolean(gcVersionUpgradeToV3Key) === true ? currentGCVersion : stableGCVersion;

	// The GC version is up-to-date if the GC version in effect is at least equal to the GC version in base snapshot.
	// If it is not up-to-date, there is a newer version of GC out there which is more reliable than this. So, GC
	// should not run as it may produce incorrect / unreliable state.
	const isGCVersionUpToDate =
		gcVersionInBaseSnapshot === undefined || gcVersionInEffect >= gcVersionInBaseSnapshot;

	/**
	 * Whether GC should run or not. The following conditions have to be met to run sweep:
	 * 1. GC should be enabled for this container.
	 * 2. GC should not be disabled via disableGC GC option.
	 * 3. The current GC version should be greater of equal to the GC version in the base snapshot.
	 * These conditions can be overridden via runGCKey feature flag.
	 */
	const shouldRunGC =
		mc.config.getBoolean(runGCKey) ??
		(gcEnabled && !createParams.gcOptions.disableGC && isGCVersionUpToDate);

	/**
	 * Whether sweep should run or not. The following conditions have to be met to run sweep:
	 *
	 * 1. Overall GC or mark phase must be enabled (this.configs.shouldRunGC).
	 * 2. Sweep timeout should be available. Without this, we wouldn't know when an object should be deleted.
	 * 3. The driver must implement the policy limiting the age of snapshots used for loading. Otherwise
	 * the Sweep Timeout calculation is not valid. We use the persisted value to ensure consistency over time.
	 * 4. Sweep should be enabled for this container. This can be overridden via runSweep
	 * feature flag.
	 */
	const shouldRunSweep =
		shouldRunGC &&
		sweepTimeoutMs !== undefined &&
		(mc.config.getBoolean(runSweepKey) ?? sweepEnabled);

	// Override inactive timeout if test config or gc options to override it is set.
	const inactiveTimeoutMs =
		mc.config.getNumber("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs") ??
		createParams.gcOptions.inactiveTimeoutMs ??
		defaultInactiveTimeoutMs;

	// Inactive timeout must be greater than sweep timeout since a node goes from active -> inactive -> sweep ready.
	if (sweepTimeoutMs !== undefined && inactiveTimeoutMs > sweepTimeoutMs) {
		throw new UsageError("inactive timeout should not be greater than the sweep timeout");
	}

	const throwOnInactiveLoad: boolean | undefined = createParams.gcOptions.throwOnInactiveLoad;

	// Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
	const testMode =
		mc.config.getBoolean(gcTestModeKey) ?? createParams.gcOptions.runGCInTestMode === true;
	// Whether we are running in tombstone mode. This is enabled by default if sweep won't run. It can be disabled
	// via feature flags.
	const tombstoneMode = !shouldRunSweep && mc.config.getBoolean(disableTombstoneKey) !== true;
	const runFullGC = createParams.gcOptions.runFullGC;

	return {
		gcEnabled,
		sweepEnabled,
		shouldRunGC,
		shouldRunSweep,
		runFullGC,
		testMode,
		tombstoneMode,
		sessionExpiryTimeoutMs,
		sweepTimeoutMs,
		inactiveTimeoutMs,
		throwOnInactiveLoad,
		persistedGcFeatureMatrix,
		gcVersionInBaseSnapshot,
		gcVersionInEffect,
	};
}

/**
 * Sweep timeout is the time after which unreferenced content can be swept.
 * Sweep timeout = session expiry timeout + snapshot cache expiry timeout + one day buffer.
 *
 * The snapshot cache expiry timeout cannot be known precisely but the upper bound is 5 days.
 * The buffer is added to account for any clock skew or other edge cases.
 * We use server timestamps throughout so the skew should be minimal but make it 1 day to be safe.
 */
function computeSweepTimeout(sessionExpiryTimeoutMs: number | undefined): number | undefined {
	const bufferMs = oneDayMs;
	return sessionExpiryTimeoutMs && sessionExpiryTimeoutMs + maxSnapshotCacheExpiryMs + bufferMs;
}
