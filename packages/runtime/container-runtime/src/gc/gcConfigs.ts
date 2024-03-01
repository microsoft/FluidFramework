/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MonitoringContext,
	UsageError,
	validatePrecondition,
} from "@fluidframework/telemetry-utils";
import { IContainerRuntimeMetadata } from "../summary/index.js";
import {
	nextGCVersion,
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	disableTombstoneKey,
	GCFeatureMatrix,
	gcTestModeKey,
	GCVersion,
	gcVersionUpgradeToV4Key,
	IGarbageCollectorConfigs,
	IGCRuntimeOptions,
	maxSnapshotCacheExpiryMs,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	stableGCVersion,
	throwOnTombstoneLoadOverrideKey,
	throwOnTombstoneUsageKey,
	gcDisableThrowOnTombstoneLoadOptionName,
	defaultSweepGracePeriodMs,
	gcGenerationOptionName,
	IGCMetadata_Deprecated,
	disableDatastoreSweepKey,
	gcDisableDataStoreSweepOptionName,
} from "./gcDefinitions.js";
import { getGCVersion, shouldAllowGcSweep } from "./gcHelpers.js";

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
		isSummarizerClient: boolean;
	},
): IGarbageCollectorConfigs {
	let gcEnabled: boolean;
	let sessionExpiryTimeoutMs: number | undefined;
	let tombstoneTimeoutMs: number | undefined;
	let persistedGcFeatureMatrix: GCFeatureMatrix | undefined;
	let gcVersionInBaseSnapshot: GCVersion | undefined;

	/**
	 * The following GC state is enabled during container creation and cannot be changed throughout its lifetime:
	 * 1. Whether running GC mark phase is allowed or not.
	 * 2. Whether running GC sweep phase is allowed or not.
	 * 3. Whether GC session expiry is enabled or not.
	 * For existing containers, we get this information from the metadata blob of its summary.
	 */
	if (createParams.existing) {
		const metadata = createParams.metadata;
		gcVersionInBaseSnapshot = getGCVersion(metadata);
		// Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
		// other existing documents, GC is enabled.
		gcEnabled = gcVersionInBaseSnapshot > 0;
		sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
		const legacyPersistedSweepTimeoutMs = (metadata as IGCMetadata_Deprecated)?.sweepTimeoutMs;
		tombstoneTimeoutMs =
			metadata?.tombstoneTimeoutMs ??
			legacyPersistedSweepTimeoutMs ?? // Backfill old documents that have sweepTimeoutMs instead of tombstoneTimeoutMs
			computeTombstoneTimeout(sessionExpiryTimeoutMs); // Backfill old documents that didn't persist either value
		persistedGcFeatureMatrix = metadata?.gcFeatureMatrix;
	} else {
		// This Test Override only applies for new containers
		const testOverrideTombstoneTimeoutMs = mc.config.getNumber(
			"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs",
		);

		// For new documents, GC is enabled by default. It can be explicitly disabled by setting the gcAllowed
		// flag in GC options to false.
		gcEnabled = createParams.gcOptions.gcAllowed !== false;

		// Set the Session Expiry if GC is enabled and session expiry flag isn't explicitly set to false.
		if (gcEnabled && mc.config.getBoolean(runSessionExpiryKey) !== false) {
			sessionExpiryTimeoutMs =
				createParams.gcOptions.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs;
		}
		tombstoneTimeoutMs =
			testOverrideTombstoneTimeoutMs ?? computeTombstoneTimeout(sessionExpiryTimeoutMs);

		const gcGeneration = createParams.gcOptions[gcGenerationOptionName];
		if (gcGeneration !== undefined) {
			persistedGcFeatureMatrix = { gcGeneration };
		}
	}

	// The persisted GC generation must indicate Sweep is allowed for this document,
	// according to the GC Generation option provided this session.
	// Note that if no generation option is provided, Sweep is allowed for any document.
	const sweepAllowed = shouldAllowGcSweep(
		persistedGcFeatureMatrix ?? {} /* featureMatrix */,
		createParams.gcOptions[gcGenerationOptionName] /* currentGeneration */,
	);

	// If version upgrade is not enabled, fall back to the stable GC version.
	const gcVersionInEffect =
		mc.config.getBoolean(gcVersionUpgradeToV4Key) === true ? nextGCVersion : stableGCVersion;

	// The GC version is up-to-date if the GC version in effect is at least equal to the GC version in base snapshot.
	// If it is not up-to-date, there is a newer version of GC out there which is more reliable than this. So, GC
	// should not run as it may produce incorrect / unreliable state.
	const isGCVersionUpToDate =
		gcVersionInBaseSnapshot === undefined || gcVersionInEffect >= gcVersionInBaseSnapshot;

	/**
	 * Whether GC should run or not. The following conditions have to be met to run sweep:
	 * 1. GC should be enabled for this container.
	 * 2. GC should not be disabled via disableGC GC option.
	 * 3. The current GC version should be greater or equal to the GC version in the base snapshot.
	 *
	 * These conditions can be overridden via the RunGC feature flag.
	 */
	const shouldRunGC =
		mc.config.getBoolean(runGCKey) ??
		(gcEnabled && !createParams.gcOptions.disableGC && isGCVersionUpToDate);

	/**
	 * Whether sweep should run or not. This refers to whether Tombstones should fail on load and whether
	 * sweep-ready nodes should be deleted.
	 *
	 * Assuming overall GC is enabled and tombstoneTimeout is provided, the following conditions have to be met to run sweep:
	 *
	 * 1. Sweep should be allowed in this container.
	 * 2. Sweep should be enabled for this session, optionally restricted to attachment blobs only.
	 *
	 * These conditions can be overridden via the RunSweep feature flag.
	 */
	const sweepEnabled: boolean =
		!shouldRunGC || tombstoneTimeoutMs === undefined
			? false
			: mc.config.getBoolean(runSweepKey) ??
			  (sweepAllowed && createParams.gcOptions.enableGCSweep === true);
	const disableDatastoreSweep =
		mc.config.getBoolean(disableDatastoreSweepKey) === true ||
		createParams.gcOptions[gcDisableDataStoreSweepOptionName] === true;
	const shouldRunSweep: IGarbageCollectorConfigs["shouldRunSweep"] = sweepEnabled
		? disableDatastoreSweep
			? "ONLY_BLOBS"
			: "YES"
		: "NO";

	// Override inactive timeout if test config or gc options to override it is set.
	const inactiveTimeoutMs =
		mc.config.getNumber("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs") ??
		createParams.gcOptions.inactiveTimeoutMs ??
		defaultInactiveTimeoutMs;

	// Inactive timeout must be greater than tombstone timeout since a node goes from active -> inactive -> sweep ready.
	if (tombstoneTimeoutMs !== undefined && inactiveTimeoutMs > tombstoneTimeoutMs) {
		throw new UsageError("inactive timeout should not be greater than the tombstone timeout");
	}

	// Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
	const testMode =
		mc.config.getBoolean(gcTestModeKey) ?? createParams.gcOptions.runGCInTestMode === true;
	// Whether we are running in tombstone mode. If disabled, tombstone data will not be written to or read from snapshots,
	// and objects will not be marked as tombstoned even if they pass to the "TombstoneReady" state during the session.
	const tombstoneMode = mc.config.getBoolean(disableTombstoneKey) !== true;
	const runFullGC = createParams.gcOptions.runFullGC;

	const sweepGracePeriodMs =
		createParams.gcOptions.sweepGracePeriodMs ?? defaultSweepGracePeriodMs;
	validatePrecondition(sweepGracePeriodMs >= 0, "sweepGracePeriodMs must be non-negative", {
		sweepGracePeriodMs,
	});

	const throwOnInactiveLoad: boolean | undefined = createParams.gcOptions.throwOnInactiveLoad;

	const throwOnTombstoneLoadConfig =
		mc.config.getBoolean(throwOnTombstoneLoadOverrideKey) ??
		createParams.gcOptions[gcDisableThrowOnTombstoneLoadOptionName] !== true;
	const throwOnTombstoneLoad =
		throwOnTombstoneLoadConfig && sweepAllowed && !createParams.isSummarizerClient;
	const throwOnTombstoneUsage =
		mc.config.getBoolean(throwOnTombstoneUsageKey) === true &&
		sweepAllowed &&
		!createParams.isSummarizerClient;

	return {
		gcEnabled, // For this document
		sweepEnabled: sweepAllowed, // For this document (based on current GC Generation option)
		shouldRunGC, // For this session
		shouldRunSweep, // For this session
		runFullGC,
		testMode,
		tombstoneMode,
		sessionExpiryTimeoutMs,
		tombstoneTimeoutMs,
		sweepGracePeriodMs,
		inactiveTimeoutMs,
		persistedGcFeatureMatrix,
		gcVersionInBaseSnapshot,
		gcVersionInEffect,
		throwOnInactiveLoad,
		throwOnTombstoneLoad,
		throwOnTombstoneUsage,
	};
}

/**
 * Tombstone timeout is the time after which unreferenced content is guaranteed not to be revived (re-referenced).
 * Tombstone timeout = session expiry timeout + snapshot cache expiry timeout + one day buffer.
 *
 * The snapshot cache expiry timeout cannot be known precisely but the upper bound is 5 days.
 * The buffer is added to account for any clock skew or other edge cases.
 * We use server timestamps throughout so the skew should be minimal but make it 1 day to be safe.
 *
 * If there is no Session Expiry timeout, GC can never guarantee an object won't be revived, so return undefined.
 */
function computeTombstoneTimeout(sessionExpiryTimeoutMs: number | undefined): number | undefined {
	const bufferMs = oneDayMs;
	return sessionExpiryTimeoutMs && sessionExpiryTimeoutMs + maxSnapshotCacheExpiryMs + bufferMs;
}
