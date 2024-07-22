/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MonitoringContext,
	UsageError,
	validatePrecondition,
} from "@fluidframework/telemetry-utils/internal";

import { IContainerRuntimeMetadata } from "../summary/index.js";

import {
	GCFeatureMatrix,
	GCVersion,
	IGCMetadata_Deprecated,
	IGCRuntimeOptions,
	IGarbageCollectorConfigs,
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
	disableDatastoreSweepKey,
	disableTombstoneKey,
	gcDisableDataStoreSweepOptionName,
	gcDisableThrowOnTombstoneLoadOptionName,
	gcGenerationOptionName,
	gcTestModeKey,
	maxSnapshotCacheExpiryMs,
	oneDayMs,
	runSessionExpiryKey,
	throwOnTombstoneLoadOverrideKey,
	throwOnTombstoneUsageKey,
} from "./gcDefinitions.js";
import { getGCVersion, getGCVersionInEffect, shouldAllowGcSweep } from "./gcHelpers.js";

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
	let gcEnabled: boolean = true;
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
		// Existing documents which did not have metadata blob or had GC disabled have GC version as 0. GC will be
		// disabled for these documents.
		gcEnabled = gcVersionInBaseSnapshot !== 0;
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

		// Set the Session Expiry if session expiry flag isn't explicitly set to false.
		if (mc.config.getBoolean(runSessionExpiryKey) !== false) {
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
		!gcEnabled || tombstoneTimeoutMs === undefined
			? false
			: sweepAllowed && createParams.gcOptions.enableGCSweep === true;
	const disableDatastoreSweep =
		mc.config.getBoolean(disableDatastoreSweepKey) === true ||
		createParams.gcOptions[gcDisableDataStoreSweepOptionName] === true;
	const shouldRunSweep: IGarbageCollectorConfigs["shouldRunSweep"] = sweepEnabled
		? disableDatastoreSweep
			? "ONLY_BLOBS"
			: "YES"
		: "NO";

	// If we aren't running sweep, also disable AutoRecovery which also emits the GC op.
	// This gives a simple control surface for compability concerns around introducing the new op.
	const tombstoneAutorecoveryEnabled = shouldRunSweep !== "NO";

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
		tombstoneAutorecoveryEnabled,
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
		gcVersionInEffect: getGCVersionInEffect(mc.config),
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
function computeTombstoneTimeout(
	sessionExpiryTimeoutMs: number | undefined,
): number | undefined {
	const bufferMs = oneDayMs;
	return (
		sessionExpiryTimeoutMs && sessionExpiryTimeoutMs + maxSnapshotCacheExpiryMs + bufferMs
	);
}
