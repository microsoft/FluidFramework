/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConfigProvider } from "@fluidframework/telemetry-utils";
import { UsageError } from "@fluidframework/driver-utils";
import { unreachableCase } from "@fluidframework/common-utils";
import { getGCVersion, IGCMetadata } from "./summaryFormat";
import { IGCRuntimeOptions } from "./containerRuntime";
import { runSessionExpiryKey } from "./garbageCollection";

/** All known test mode configurations */
export interface IGCTestConfig {
    /**
     Sweep V0 is a test mode for using a very short timeout in order to enable testing of real sweep behavior.
     It's similar to testMode but rather than deleting immediately, it exercises the Sweep timers and codepaths
    */
    SweepV0?: {
        sessionExpiryTimeoutMs: number;
    };
}

/** All known test mode names */
export type GCTestMode = keyof IGCTestConfig;

export const oneDayMs = 1 * 24 * 60 * 60 * 1000;

export const defaultInactiveTimeoutMs = 7 * oneDayMs; // 7 days
export const defaultSessionExpiryDurationMs = 30 * oneDayMs; // 30 days
const defaultBufferMs = oneDayMs; // 1 day

/**
 * This type encapsulates state that is enabled during container creation and cannot be changed throughout its lifetime:
 * - Whether running GC mark phase is allowed or not
 * - Whether running GC sweep phase is allowed or not
 * - Whether GC session expiry is enabled or not, and what the timeout is.
 * - What Buffer is used when calculating file Sweep Timeout.
 * - The Test Mode under which this file was created and must be loaded.
 * For existing containers, we get this information from the metadata blob of its summary.
 * For new containers, we compute these from several sources, and then write them to the metadata blob.
 */
export type GcContainerConfig =
    // Common props regardless of sweepAllowed
    {
        readonly gcAllowed: boolean;

        /** The GC Version from the summary we loaded from. May be overwritten in subsequent summaries */
        readonly prevSummaryGCVersion?: number;
        /** Which Test Mode is this file under, if any? These tend to be incompatible with non-test environments */
        readonly testMode: GCTestMode | undefined;

        /**
         * This is not read from the file, but is hardcoded and assumed stable for the lifetime of the container.
         * NOTE: This assumption is not sound and needs to be addressed before enabling Sweep broadly.
         */
        readonly snapshotCacheExpiryMs: number | undefined;
        readonly sessionExpiryTimeoutMs: number | undefined;
        readonly sweepTimeoutBufferMs: number;
     }
    & (
        | {
            readonly sweepAllowed: false;
        }
        | {
            readonly sweepAllowed: true;

            // These props are more constrained in type when sweepAllowed is true
            readonly gcAllowed: true;
            readonly snapshotCacheExpiryMs: number;
            readonly sessionExpiryTimeoutMs: number;
        }
    );

export function configForExistingContainer(
    metadata: IGCMetadata | undefined,
    providedSnapshotCacheExpiryMs: number | undefined,
): GcContainerConfig {
    // Crash if we see a test mode we don't recognize, since we don't know how it's implemented or should be used
    const testMode = metadata?.gcTestMode;
    if (testMode !== undefined && testMode !== "SweepV0") {
        unreachableCase(testMode, `Cannot open container created under unknown GC Test Mode [${testMode}]`);
    }

    // Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
    // other existing documents, GC is enabled.
    const prevSummaryGCVersion = getGCVersion(metadata);
    const gcAllowed = prevSummaryGCVersion > 0;

    const sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
    if (!gcAllowed
        || metadata?.sweepEnabled !== true
        || sessionExpiryTimeoutMs === undefined
    ) {
        return {
            sweepAllowed: false,
            gcAllowed,
            testMode,
            prevSummaryGCVersion,
            snapshotCacheExpiryMs: undefined, // This value is irrelevant is sweep isn't allowed
            sessionExpiryTimeoutMs,
            sweepTimeoutBufferMs: defaultBufferMs,
        };
    }

    const sweepV0: boolean = testMode === "SweepV0";
    const snapshotCacheExpiryMs = sweepV0
        ? 0 // Ignore snapshot expiry for SweepV0
        : providedSnapshotCacheExpiryMs;
    //* unsure about this, but can't see another way
    if (snapshotCacheExpiryMs === undefined) {
        throw new UsageError("If Sweep is allowed for this container, snapshotCacheExpiryMs is required");
    }
    const sweepTimeoutBufferMs = metadata.sweepTimeoutBufferMs ?? defaultBufferMs; // For SweepV0 we expect it to be set
    const configData: GcContainerConfig = {
        sweepAllowed: true,
        gcAllowed: true,
        testMode,
        snapshotCacheExpiryMs,
        sessionExpiryTimeoutMs,
        sweepTimeoutBufferMs,
        prevSummaryGCVersion,
    };
    return configData;
}

/**
 * Check the GC TestConfig setting key for a JSON-serialized specification of the given test mode,
 * parsing the JSON and returning the test config data
 */
function getTestConfigFromSettings<TMode extends GCTestMode>(
    testMode: TMode,
    settings: IConfigProvider,
): IGCTestConfig[TMode] | undefined {
    const rawConfigValue = settings.getString("Fluid.GarbageCollection.TestConfig") ?? "";
    try {
        const testConfigs = JSON.parse(rawConfigValue) as IGCTestConfig;
        return testConfigs[testMode];
    } catch (e) {
        return undefined;
    }
}

export function configForNewContainer(
    options: IGCRuntimeOptions,
    settings: IConfigProvider,
    providedSnapshotCacheExpiryMs: number | undefined,
): GcContainerConfig {
    // Note: If SessionExpiry is not enabled for the session when a container is created,
    // it (and sweep) will always be disabled for that container.
    const sessionExpiryEnabled = settings.getBoolean(runSessionExpiryKey);
    //* Test case:  Adding in reading from settings and options here
    let sessionExpiryTimeoutMs = sessionExpiryEnabled
        ? (options.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs)
        : undefined;
    const sweepAllowed = options.sweepAllowed === true && sessionExpiryEnabled;
    const gcAllowed = options.gcAllowed !== false; // default is true

    if (!sweepAllowed) {
        return {
            sweepAllowed: false,
            gcAllowed,
            testMode: undefined,
            snapshotCacheExpiryMs: providedSnapshotCacheExpiryMs,
            sessionExpiryTimeoutMs,
            sweepTimeoutBufferMs: defaultBufferMs,
        };
    }

    if (!gcAllowed) {
        // Sweep should not be enabled without enabling GC mark phase. We could silently disable sweep in this
        // scenario but explicitly failing makes it clearer and promotes correct usage.
        throw new UsageError("GC sweep phase cannot be enabled without enabling GC mark phase");
    }

    const sweepV0Config = getTestConfigFromSettings<"SweepV0">("SweepV0", settings);
    const sweepV0: boolean = sweepV0Config !== undefined;

    const snapshotCacheExpiryMs = sweepV0
        ? 0 // Ignore snapshot expiry for SweepV0
        : providedSnapshotCacheExpiryMs;
    if (snapshotCacheExpiryMs === undefined) {
        throw new UsageError("If Sweep is allowed for this new container, snapshotCacheExpiryMs is required");
    }

    if (sweepV0Config !== undefined) {
        sessionExpiryTimeoutMs = sweepV0Config.sessionExpiryTimeoutMs;
    }
    // For SweepV0, use half sessionExpiry for both inactiveObject and buffer (and snapshot expiry is 0)
    // This will give even spacing between unreferenced, inactive, session expiring, and swept.
    const sweepTimeoutBufferMs = sweepV0 ? sessionExpiryTimeoutMs / 2 : defaultBufferMs;
    const containerConfig: GcContainerConfig = {
        gcAllowed: true,
        sweepAllowed: true,
        testMode: sweepV0 ? "SweepV0" : undefined,
        snapshotCacheExpiryMs,
        sessionExpiryTimeoutMs,
        sweepTimeoutBufferMs,
    };
    return containerConfig;
}
