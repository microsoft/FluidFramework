/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/driver-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import { IGCRuntimeOptions } from "..";
import { IContainerRuntimeMetadata } from "../summary";
import {
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	disableTombstoneKey,
	GCFeatureMatrix,
	gcTestModeKey,
	gcTombstoneGenerationOptionName,
	GCVersion,
	IGarbageCollectorConfigs,
	maxSnapshotCacheExpiryMs,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	trackGCStateKey,
} from "./gcDefinitions";
import { getGCVersion } from "./gcHelpers";

/**
 * Generates configurations for the Garbage Collector that it uses to determine what to run and how.
 * @param gcOptions - The garbage collector runtime options.
 * @param metadata - The container runtime's metadata.
 * @param existing - Whether the container is new or an existing one.
 * @param mc - The monitoring context for reading configs from the config provider.
 * @returns The garbage collector configurations.
 */
export function generateGCConfigs(
	gcOptions: IGCRuntimeOptions,
	metadata: IContainerRuntimeMetadata | undefined,
	existing: boolean,
	mc: MonitoringContext,
): IGarbageCollectorConfigs {
	let gcEnabled: boolean;
	let sweepEnabled: boolean;
	let sessionExpiryTimeoutMs: number | undefined;
	let sweepTimeoutMs: number | undefined;
	let persistedGcFeatureMatrix: GCFeatureMatrix | undefined;
	let gcVersionInBaseSnapshot: GCVersion | undefined;

	/**
	 * The following GC state is enabled during container creation and cannot be changed throughout its lifetime:
	 * 1. Whether running GC mark phase is allowed or not.
	 * 2. Whether running GC sweep phase is allowed or not.
	 * 3. Whether GC session expiry is enabled or not.
	 * For existing containers, we get this information from the metadata blob of its summary.
	 */
	if (existing) {
		gcVersionInBaseSnapshot = getGCVersion(metadata);
		// Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
		// other existing documents, GC is enabled.
		gcEnabled = gcVersionInBaseSnapshot > 0;
		sweepEnabled = metadata?.sweepEnabled ?? false;
		sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
		sweepTimeoutMs = metadata?.sweepTimeoutMs ?? computeSweepTimeout(sessionExpiryTimeoutMs); // Backfill old documents that didn't persist this
		persistedGcFeatureMatrix = metadata?.gcFeatureMatrix;
	} else {
		// Sweep should not be enabled without enabling GC mark phase. We could silently disable sweep in this
		// scenario but explicitly failing makes it clearer and promotes correct usage.
		if (gcOptions.sweepAllowed && gcOptions.gcAllowed === false) {
			throw new UsageError("GC sweep phase cannot be enabled without enabling GC mark phase");
		}

		// This Test Override only applies for new containers
		const testOverrideSweepTimeoutMs = mc.config.getNumber(
			"Fluid.GarbageCollection.TestOverride.SweepTimeoutMs",
		);

		// For new documents, GC is enabled by default. It can be explicitly disabled by setting the gcAllowed
		// flag in GC options to false.
		gcEnabled = gcOptions.gcAllowed !== false;
		// The sweep phase has to be explicitly enabled by setting the sweepAllowed flag in GC options to true.
		sweepEnabled = gcOptions.sweepAllowed === true;

		// Set the Session Expiry only if the flag is enabled and GC is enabled.
		if (mc.config.getBoolean(runSessionExpiryKey) && gcEnabled) {
			sessionExpiryTimeoutMs =
				gcOptions.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs;
		}
		sweepTimeoutMs = testOverrideSweepTimeoutMs ?? computeSweepTimeout(sessionExpiryTimeoutMs);

		if (gcOptions[gcTombstoneGenerationOptionName] !== undefined) {
			persistedGcFeatureMatrix = {
				tombstoneGeneration: gcOptions[gcTombstoneGenerationOptionName],
			};
		}
	}

	/**
	 * Whether GC should run or not. The following conditions have to be met to run sweep:
	 *
	 * 1. GC should be enabled for this container.
	 *
	 * 2. GC should not be disabled via disableGC GC option.
	 *
	 * These conditions can be overridden via runGCKey feature flag.
	 */
	const shouldRunGC =
		mc.config.getBoolean(runGCKey) ??
		// GC must be enabled for the document.
		(gcEnabled &&
			// GC must not be disabled via GC options.
			!gcOptions.disableGC);

	/**
	 * Whether sweep should run or not. The following conditions have to be met to run sweep:
	 *
	 * 1. Overall GC or mark phase must be enabled (this.configs.shouldRunGC).
	 * 2. Sweep timeout should be available. Without this, we wouldn't know when an object should be deleted.
	 * 3. The driver must implement the policy limiting the age of snapshots used for loading. Otherwise
	 * the Sweep Timeout calculation is not valid. We use the persisted value to ensure consistency over time.
	 * 4. Sweep should be enabled for this container (this.sweepEnabled). This can be overridden via runSweep
	 * feature flag.
	 */
	const shouldRunSweep =
		shouldRunGC &&
		sweepTimeoutMs !== undefined &&
		(mc.config.getBoolean(runSweepKey) ?? sweepEnabled);

	// Override inactive timeout if test config or gc options to override it is set.
	const inactiveTimeoutMs =
		mc.config.getNumber("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs") ??
		gcOptions.inactiveTimeoutMs ??
		defaultInactiveTimeoutMs;

	// Inactive timeout must be greater than sweep timeout since a node goes from active -> inactive -> sweep ready.
	if (sweepTimeoutMs !== undefined && inactiveTimeoutMs > sweepTimeoutMs) {
		throw new UsageError("inactive timeout should not be greater than the sweep timeout");
	}

	// Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
	const testMode = mc.config.getBoolean(gcTestModeKey) ?? gcOptions.runGCInTestMode === true;
	// Whether we are running in tombstone mode. This is enabled by default if sweep won't run. It can be disabled
	// via feature flags.
	const tombstoneMode = !shouldRunSweep && mc.config.getBoolean(disableTombstoneKey) !== true;
	const trackGCState = mc.config.getBoolean(trackGCStateKey) === true;

	return {
		gcEnabled,
		sweepEnabled,
		shouldRunGC,
		shouldRunSweep,
		testMode,
		tombstoneMode,
		trackGCState,
		sessionExpiryTimeoutMs,
		sweepTimeoutMs,
		inactiveTimeoutMs,
		persistedGcFeatureMatrix,
		gcVersionInBaseSnapshot,
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
function computeSweepTimeout(sessionExpiryTimeoutMs: number | undefined) {
	const bufferMs = oneDayMs;
	return sessionExpiryTimeoutMs && sessionExpiryTimeoutMs + maxSnapshotCacheExpiryMs + bufferMs;
}
