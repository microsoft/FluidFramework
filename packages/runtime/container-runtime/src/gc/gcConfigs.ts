/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/driver-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import { IGCRuntimeOptions } from "..";
import { IContainerRuntimeMetadata } from "../summary";
import {
	defaultInactiveTimeoutMs,
	defaultSessionExpiryDurationMs,
	disableTombstoneKey,
	gcTestModeKey,
	IGarbageCollectorConfigs,
	oneDayMs,
	runGCKey,
	runSessionExpiryKey,
	runSweepKey,
	trackGCStateKey,
} from "./gcDefinitions";

/**
 * Generates configurations for the Garbage Collector that it uses to determine what to run and how.
 * @param gcOptions - The garbage collector runtime options.
 * @param metadata - The container runtime's metadata.
 * @param baseSnapshotGCVersion - The GC version of the base snapshot.
 * @param existing - Whether the container is new or an existing one.
 * @param mc - The monitoring context for reading configs from the config provider.
 * @returns The garbage collector configurations.
 */
export function generateGCConfigs(
	gcOptions: IGCRuntimeOptions,
	metadata: IContainerRuntimeMetadata | undefined,
	baseSnapshotGCVersion: number | undefined,
	existing: boolean,
	mc: MonitoringContext,
): IGarbageCollectorConfigs {
	const configs: IGarbageCollectorConfigs = {
		gcEnabled: false,
		sweepEnabled: false,
		shouldRunGC: false,
		shouldRunSweep: false,
		testMode: false,
		tombstoneMode: false,
		trackGCState: false,
		sessionExpiryTimeoutMs: undefined,
		sweepTimeoutMs: undefined,
		inactiveTimeoutMs: 0,
	};

	/**
	 * Sweep timeout is the time after which unreferenced content can be swept.
	 * Sweep timeout = session expiry timeout + snapshot cache expiry timeout + one day buffer.
	 *
	 * The snapshot cache expiry timeout cannot be known precisely but the upper bound is 5 days.
	 * The buffer is added to account for any clock skew or other edge cases.
	 * We use server timestamps throughout so the skew should be minimal but make it 1 day to be safe.
	 */
	const computeSweepTimeout = (sessionExpiryTimeoutMs: number | undefined) => {
		const maxSnapshotCacheExpiryMs = 5 * oneDayMs;
		const bufferMs = oneDayMs;
		return (
			sessionExpiryTimeoutMs && sessionExpiryTimeoutMs + maxSnapshotCacheExpiryMs + bufferMs
		);
	};

	/**
	 * The following GC state is enabled during container creation and cannot be changed throughout its lifetime:
	 * 1. Whether running GC mark phase is allowed or not.
	 * 2. Whether running GC sweep phase is allowed or not.
	 * 3. Whether GC session expiry is enabled or not.
	 * For existing containers, we get this information from the metadata blob of its summary.
	 */
	if (existing) {
		assert(
			baseSnapshotGCVersion !== undefined,
			"previous summary must have GC version for existing container",
		);
		// Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
		// other existing documents, GC is enabled.
		configs.gcEnabled = baseSnapshotGCVersion > 0;
		configs.sweepEnabled = metadata?.sweepEnabled ?? false;
		configs.sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
		configs.sweepTimeoutMs =
			metadata?.sweepTimeoutMs ?? computeSweepTimeout(configs.sessionExpiryTimeoutMs); // Backfill old documents that didn't persist this
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
		configs.gcEnabled = gcOptions.gcAllowed !== false;
		// The sweep phase has to be explicitly enabled by setting the sweepAllowed flag in GC options to true.
		configs.sweepEnabled = gcOptions.sweepAllowed === true;

		// Set the Session Expiry only if the flag is enabled and GC is enabled.
		if (mc.config.getBoolean(runSessionExpiryKey) && configs.gcEnabled) {
			configs.sessionExpiryTimeoutMs =
				gcOptions.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs;
		}
		configs.sweepTimeoutMs =
			testOverrideSweepTimeoutMs ?? computeSweepTimeout(configs.sessionExpiryTimeoutMs);
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
	configs.shouldRunGC =
		mc.config.getBoolean(runGCKey) ??
		// GC must be enabled for the document.
		(configs.gcEnabled &&
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
	configs.shouldRunSweep =
		configs.shouldRunGC &&
		configs.sweepTimeoutMs !== undefined &&
		(mc.config.getBoolean(runSweepKey) ?? configs.sweepEnabled);

	configs.trackGCState = mc.config.getBoolean(trackGCStateKey) === true;

	// Override inactive timeout if test config or gc options to override it is set.
	configs.inactiveTimeoutMs =
		mc.config.getNumber("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs") ??
		gcOptions.inactiveTimeoutMs ??
		defaultInactiveTimeoutMs;

	// Inactive timeout must be greater than sweep timeout since a node goes from active -> inactive -> sweep ready.
	if (
		configs.sweepTimeoutMs !== undefined &&
		configs.inactiveTimeoutMs > configs.sweepTimeoutMs
	) {
		throw new UsageError("inactive timeout should not be greater than the sweep timeout");
	}

	// Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
	configs.testMode = mc.config.getBoolean(gcTestModeKey) ?? gcOptions.runGCInTestMode === true;
	// Whether we are running in tombstone mode. This is enabled by default if sweep won't run. It can be disabled
	// via feature flags.
	configs.tombstoneMode =
		!configs.shouldRunSweep && mc.config.getBoolean(disableTombstoneKey) !== true;

	return configs;
}
