/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConfigProvider } from "@fluidframework/telemetry-utils";
import { UsageError } from "@fluidframework/driver-utils";
import { unreachableCase } from "@fluidframework/common-utils";
import { getGCVersion, IGCMetadata } from "./summaryFormat";
import { IGCRuntimeOptions } from "./containerRuntime";

/** All known test mode configurations */
export interface IGCTestConfig {
    SweepV0?: {
        sessionExpiryTimeoutMs: number;
    };
}

/** All known test mode names */
export type GCTestMode = keyof IGCTestConfig;

// Feature gate key to expire a session after a set period of time.
export const runSessionExpiryKey = "Fluid.GarbageCollection.RunSessionExpiry";

export const oneDayMs = 1 * 24 * 60 * 60 * 1000;

const defaultCacheExpiryTimeoutMs = 2 * oneDayMs; // 2 days, matches the same variable in odsp-driver
const defaultInactiveTimeoutMs = 7 * oneDayMs; // 7 days
export const defaultSessionExpiryDurationMs = 30 * oneDayMs; // 30 days
const defaultBufferMs = oneDayMs; // 1 day

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type GcSessionConfig = {
    containerConfig: GcContainerConfig;
    gcEnabled: boolean;
    sweepEnabled: boolean;
    sessionExpiryTimeoutMs?: number;
};

export type GcContainerConfig =
    // Common props regardless of sweepAllowed
    {
        prevSummaryGCVersion?: number;
    }
    & (
        // Different sets of props depending on sweepAllowed
        | {
            sweepAllowed: false;
            gcAllowed: boolean;
        }
        | {
            sweepAllowed: true;
            gcAllowed: true;

            testMode: GCTestMode | undefined;
            snapshotCacheExpiryMs: number;
            sessionExpiryTimeoutMs: number;
            sweepTimeoutBufferMs: number;
            inactiveTimeoutMs: number;
        }
    );

//* TODO: Add logging of different config sources and outcome (either here or in GC.ts)

export function configForExistingContainer(
    metadata?: IGCMetadata,
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
            prevSummaryGCVersion,
        };
    }

    const sweepV0: boolean = testMode === "SweepV0";
    const snapshotCacheExpiryMs = sweepV0 ? 0 : defaultCacheExpiryTimeoutMs; // Ignore snapshot expiry for SweepV0
    const sweepTimeoutBufferMs = metadata.sweepTimeoutBufferMs ?? defaultBufferMs; // For SweepV0 we expect it to be set
    const inactiveTimeoutMs = sweepV0 ? sessionExpiryTimeoutMs / 2 : defaultInactiveTimeoutMs;
    const configData: GcContainerConfig = {
        sweepAllowed: true,
        gcAllowed: true,
        testMode,
        snapshotCacheExpiryMs,
        sessionExpiryTimeoutMs,
        sweepTimeoutBufferMs,
        inactiveTimeoutMs,
        prevSummaryGCVersion,
    };
    return configData;
}

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
): GcContainerConfig {
    const sessionExpiryEnabled = settings.getBoolean(runSessionExpiryKey);
    const sweepAllowed = options.sweepAllowed === true && sessionExpiryEnabled;
    const gcAllowed = options.gcAllowed !== false; // default to true

    if (!sweepAllowed) {
        return {
            sweepAllowed: false,
            gcAllowed,
        };
    }

    if (!gcAllowed) {
        // Sweep should not be enabled without enabling GC mark phase. We could silently disable sweep in this
        // scenario but explicitly failing makes it clearer and promotes correct usage.
        throw new UsageError("GC sweep phase cannot be enabled without enabling GC mark phase");
    }

    const sweepV0Config = getTestConfigFromSettings<"SweepV0">("SweepV0", settings);
    const sweepV0: boolean = sweepV0Config !== undefined;
    const snapshotCacheExpiryMs = sweepV0 ? 0 : defaultCacheExpiryTimeoutMs; // Ignore snapshot expiry for SweepV0
    //* Test case:  Adding in reading from settings and options here
    const sessionExpiryTimeoutMs =
        sweepV0Config?.sessionExpiryTimeoutMs
        ?? options.sessionExpiryTimeoutMs
        ?? defaultSessionExpiryDurationMs;
    // For SweepV0, use half sessionExpiry for both inactiveObject and buffer (and snapshot expiry is 0)
    // This will give even spacing between unreferenced, inactive, session expiring, and swept.
    const inactiveTimeoutMs = sweepV0 ? sessionExpiryTimeoutMs / 2 : defaultInactiveTimeoutMs;
    const sweepTimeoutBufferMs = sweepV0 ? sessionExpiryTimeoutMs / 2 : defaultBufferMs;
    const containerConfig: GcContainerConfig = {
        gcAllowed: true,
        sweepAllowed: true,
        testMode: sweepV0 ? "SweepV0" : undefined,
        snapshotCacheExpiryMs,
        sessionExpiryTimeoutMs,
        sweepTimeoutBufferMs,
        inactiveTimeoutMs,
    };
    return containerConfig;
}

export function configForSession(
    containerConfig: GcContainerConfig,
    options: IGCRuntimeOptions,
    settings: IConfigProvider,
): GcSessionConfig {
    //* TODO: Double-check this (I'm sure it's wrong)
    const sessionConfig: GcSessionConfig = {
        containerConfig,
        gcEnabled: options.disableGC !== true,
        sweepEnabled: containerConfig.sweepAllowed && options.disableGC !== true,
        sessionExpiryTimeoutMs: undefined, //* Put TestOverride answer here, if still supported
    };
    return sessionConfig;
}
