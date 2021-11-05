/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { runGarbageCollection } from "@fluidframework/garbage-collector";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IGarbageCollectionData } from "@fluidframework/runtime-definitions";
import { ReadAndParseBlob, RefreshSummaryResult } from "@fluidframework/runtime-utils";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";

import { IGCRuntimeOptions } from "./containerRuntime";
import { getLocalStorageFeatureGate } from "./localStorageFeatureGates";
import {
    getGCVersion,
    GCVersion,
    IContainerRuntimeMetadata,
    metadataBlobName,
} from "./summaryFormat";

/** This is the current version of garbage collection. */
const GCVersion = 1;

// Local storage key to turn GC on / off.
const runGCKey = "FluidRunGC";
// Local storage key to turn GC test mode on / off.
const gcTestModeKey = "FluidGCTestMode";
// Local storage key to turn GC sweep on / off.
const runSweepKey = "FluidRunSweep";

/** The used state statistics of a node. */
export interface IUsedStateStats {
    totalNodeCount: number;
    unusedNodeCount: number;
}

/** The statistics of the system state after a garbage collection run. */
export interface IGCStats {
    totalNodes: number;
    deletedNodes: number;
    totalDataStores: number;
    deletedDataStores: number;
}

/** Defines the APIs for the runtime object to be passed to the garbage collector. */
export interface IGarbageCollectionRuntime {
    /** Returns the garbage collection data of the runtime. */
    getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
    /** After GC has run, called to notify the runtime of routes that are used in it. */
    updateUsedRoutes(usedRoutes: string[]): IUsedStateStats;
}

/** Defines the contract for the garbage collector. */
export interface IGarbageCollector {
    /** Tells whether GC should run or not. */
    readonly shouldRunGC: boolean;
    /**
     * This tracks two things:
     * 1. Whether GC is enabled - If this is 0, GC is disabled. If this is > 0, GC is enabled.
     * 2. If GC is enabled, the version of GC used to generate the GC data written in a summary.
     */
    readonly gcSummaryFeatureVersion: number;
    /** Tells whether the GC version has changed compared to the version in the latest summary. */
    readonly hasGCVersionChanged: boolean;
    /** Run garbage collection and update the reference / used state of the system. */
    collectGarbage(
        options: { logger?: ITelemetryLogger, runGC?: boolean, runSweep?: boolean, fullGC?: boolean },
    ): Promise<IGCStats>;
    /** Called when the latest summary of the system has been refreshed. */
    latestSummaryStateRefreshed(result: RefreshSummaryResult, readAndParseBlob: ReadAndParseBlob): Promise<void>;
}

/**
 * The garbage collector for the container runtime. It consolidates the garbage collection functionality and maintains
 * its state across summaries.
 */
export class GarbageCollector implements IGarbageCollector {
    public static create(
        provider: IGarbageCollectionRuntime,
        gcOptions: IGCRuntimeOptions,
        deleteUnusedRoutes: (unusedRoutes: string[]) => void,
        baseLogger: ITelemetryLogger,
        existing: boolean,
        metadata?: IContainerRuntimeMetadata,
    ): IGarbageCollector {
        return new GarbageCollector(provider, gcOptions, deleteUnusedRoutes, baseLogger, existing, metadata);
    }

    /**
     * Tells whether GC should be run based on the GC options and local storage flags.
     */
    public readonly shouldRunGC: boolean;

    /**
     * This tracks two things:
     * 1. Whether GC is enabled - If this is 0, GC is disabled. If this is > 0, GC is enabled.
     * 2. If GC is enabled, the version of GC used to generate the GC data written in a summary.
     */
    public get gcSummaryFeatureVersion(): number {
        return this.gcEnabled ? this.currentGCVersion : 0;
    }

    /**
     * Tells whether the GC version has changed compared to the version in the latest summary.
     */
    public get hasGCVersionChanged(): boolean {
        // The current version can differ from the latest summary version in two cases:
        // 1. The summary this client loaded with has data from a different GC version.
        // 2. This client's latest summary was updated from a snapshot that has a different GC version.
        return this.shouldRunGC && this.latestSummaryGCVersion !== this.currentGCVersion;
    }

    /**
     * Tracks if GC is enabled for this document. This is specified during document creation and doesn't change
     * throughout its lifetime.
     */
    private readonly gcEnabled: boolean;
    private readonly shouldRunSweep: boolean;
    private readonly testMode: boolean;
    private readonly logger: ITelemetryLogger;

    // The current GC version that this container is running.
    private readonly currentGCVersion = GCVersion;
    // This is the version of GC data in the latest summary being tracked.
    private latestSummaryGCVersion: GCVersion;

    protected constructor(
        private readonly provider: IGarbageCollectionRuntime,
        private readonly gcOptions: IGCRuntimeOptions,
        /**
         * After GC has run, called to delete objects in the runtime whose routes are unused. This is not part of the
         * provider because its specific to this garbage collector implementation and is not part of the contract.
         */
        private readonly deleteUnusedRoutes: (unusedRoutes: string[]) => void,
        baseLogger: ITelemetryLogger,
        existing: boolean,
        metadata?: IContainerRuntimeMetadata,
    ) {
        this.logger = ChildLogger.create(baseLogger, "GarbageCollector");

        let prevSummaryGCVersion: number | undefined;
        // GC can only be enabled during creation. After that, it can never be enabled again. So, for existing
        // documents, we get this information from the metadata blob.
        if (existing) {
            prevSummaryGCVersion = getGCVersion(metadata);
            // Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
            // other exsiting documents, GC is enabled.
            this.gcEnabled = prevSummaryGCVersion > 0;
        } else {
            // For new documents, GC has to be exlicitly enabled via the gcAllowed flag in GC options.
            this.gcEnabled = gcOptions.gcAllowed === true;
        }
        // For existing document, the latest summary is the one that we loaded from. So, use its GC version as the
        // latest tracked GC version. For new documents, we will be writing the first summary with the current version.
        this.latestSummaryGCVersion = prevSummaryGCVersion ?? this.currentGCVersion;

        // Whether GC should run or not. Can override with localStorage flag.
        this.shouldRunGC = getLocalStorageFeatureGate(runGCKey) ?? (
            // GC must be enabled for the document.
            this.gcEnabled
            // GC must not be disabled via GC options.
            && !gcOptions.disableGC
        );

        // Whether GC sweep phase should run or not. If this is false, only GC mark phase is run. Can override with
        // localStorage flag.
        this.shouldRunSweep = this.shouldRunGC &&
            (getLocalStorageFeatureGate(runSweepKey) ?? gcOptions.runSweep === true);

        // Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
        this.testMode = getLocalStorageFeatureGate(gcTestModeKey) ?? gcOptions.runGCInTestMode === true;
    }

    /**
     * Runs garbage collection and udpates the reference / used state of the nodes in the container.
     * @returns the number of data stores that have been marked as unreferenced.
     */
    public async collectGarbage(
        options: {
            /** Logger to use for logging GC events */
            logger?: ITelemetryLogger,
            /** True to run GC sweep phase after the mark phase */
            runSweep?: boolean,
            /** True to generate full GC data */
            fullGC?: boolean,
        },
    ): Promise<IGCStats> {
        const {
            logger = this.logger,
            runSweep = this.shouldRunSweep,
            fullGC = this.gcOptions.runFullGC === true || this.hasGCVersionChanged,
        } = options;

        return PerformanceEvent.timedExecAsync(logger, { eventName: "GarbageCollection" }, async (event) => {
            const gcStats: {
                deletedNodes?: number,
                totalNodes?: number,
                deletedDataStores?: number,
                totalDataStores?: number,
            } = {};

            // Get the runtime's GC data and run GC on the reference graph in it.
            const gcData = await this.provider.getGCData(fullGC);
            const { referencedNodeIds, deletedNodeIds } = runGarbageCollection(
                gcData.gcNodes,
                [ "/" ],
                logger,
            );

            // Remove this node's route ("/") and notify data stores of routes that are used in it.
            const usedRoutes = referencedNodeIds.filter((id: string) => { return id !== "/"; });
            const dataStoreUsedStateStats = this.provider.updateUsedRoutes(usedRoutes);

            if (runSweep) {
                // Placeholder for running sweep logic.
            }

            // Update stats to be reported in the peformance event.
            gcStats.deletedNodes = deletedNodeIds.length;
            gcStats.totalNodes = referencedNodeIds.length + deletedNodeIds.length;
            gcStats.deletedDataStores = dataStoreUsedStateStats.unusedNodeCount;
            gcStats.totalDataStores = dataStoreUsedStateStats.totalNodeCount;

            // If we are running in GC test mode, delete objects for unused routes. This enables testing scenarios
            // involving access to deleted data.
            if (this.testMode) {
                this.deleteUnusedRoutes(deletedNodeIds);
            }
            event.end(gcStats);
            return gcStats as IGCStats;
        },
        { end: true, cancel: "error" });
    }

    /**
     * Called when the latest summary of the system has been refreshed. This will be used to update the state of the
     * latest summary tracked.
     */
    public async latestSummaryStateRefreshed(
        result: RefreshSummaryResult,
        readAndParseBlob: ReadAndParseBlob,
    ): Promise<void> {
        if (!this.shouldRunGC || !result.latestSummaryUpdated) {
            return;
        }

        // If the summary was tracked by this client, it was the one that generated the summary in the first place.
        // Basically, it was written in the current GC version.
        if (result.wasSummaryTracked) {
            this.latestSummaryGCVersion = this.currentGCVersion;
            return;
        }
        // If the summary was not tracked by this client, update latest GC version from the snapshot in the result as
        // that is now the latest summary.
        await this.updateSummaryGCVersionFromSnapshot(result.snapshot, readAndParseBlob);
    }

    /**
     * Update the latest summary GC version from the metadata blob in the given snapshot.
     */
    private async updateSummaryGCVersionFromSnapshot(snapshot: ISnapshotTree, readAndParseBlob: ReadAndParseBlob) {
        const metadataBlobId = snapshot.blobs[metadataBlobName];
        if (metadataBlobId) {
            const metadata = await readAndParseBlob<IContainerRuntimeMetadata>(metadataBlobId);
            this.latestSummaryGCVersion = getGCVersion(metadata);
        }
    }
}
