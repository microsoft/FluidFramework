/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, LazyPromise, Timer } from "@fluidframework/common-utils";
import {
    cloneGCData,
    concatGarbageCollectionStates,
    concatGarbageCollectionData,
    IGCResult,
    runGarbageCollection,
    unpackChildNodesGCDetails,
} from "@fluidframework/garbage-collector";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    gcBlobKey,
    IGarbageCollectionData,
    IGarbageCollectionState,
    IGarbageCollectionSummaryDetails,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import {
    ReadAndParseBlob,
    RefreshSummaryResult,
    SummaryTreeBuilder,
} from "@fluidframework/runtime-utils";
import {
    ChildLogger,
    loggerToMonitoringContext,
    MonitoringContext,
    PerformanceEvent,
 } from "@fluidframework/telemetry-utils";

import { IGCRuntimeOptions } from "./containerRuntime";
import { getSummaryForDatastores } from "./dataStores";
import {
    getGCVersion,
    GCVersion,
    IContainerRuntimeMetadata,
    metadataBlobName,
    ReadFluidDataStoreAttributes,
    dataStoreAttributesBlobName,
} from "./summaryFormat";

/** This is the current version of garbage collection. */
const GCVersion = 1;

// The key for the GC tree in summary.
export const gcTreeKey = "gc";
// They prefix for GC blobs in the GC tree in summary.
export const gcBlobPrefix = "__gc";

// Local storage key to turn GC on / off.
const runGCKey = "Fluid.GarbageCollection.RunGC";
// Local storage key to turn GC test mode on / off.
const gcTestModeKey = "Fluid.GarbageCollection.GCTestMode";
// Local storage key to turn GC sweep on / off.
const runSweepKey = "Fluid.GarbageCollection.RunSweep";

const defaultDeleteTimeoutMs = 7 * 24 * 60 * 60 * 1000; // 7 days

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
    updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number): IUsedStateStats;
}

/** Defines the contract for the garbage collector. */
export interface IGarbageCollector {
    /** Tells whether GC should run or not. */
    readonly shouldRunGC: boolean;
    /**
     * This tracks two things:
     * 1. Whether GC is enabled - If this is 0, GC is disabled. If this is greater than 0, GC is enabled.
     * 2. If GC is enabled, the version of GC used to generate the GC data written in a summary.
     */
    readonly gcSummaryFeatureVersion: number;
    /** Tells whether the GC version has changed compared to the version in the latest summary. */
    readonly hasGCVersionChanged: boolean;
    /** Tells whether GC data should be written to the root of the summary tree. */
    readonly writeDataAtRoot: boolean;
    /** Run garbage collection and update the reference / used state of the system. */
    collectGarbage(
        options: { logger?: ITelemetryLogger, runGC?: boolean, runSweep?: boolean, fullGC?: boolean },
    ): Promise<IGCStats>;
    /** Summarizes the GC data and returns it as a summary tree. */
    summarize(): ISummaryTreeWithStats | undefined;
    /** Returns a map of each data store id to its GC details in the base summary. */
    getDataStoreBaseGCDetails(): Promise<Map<string, IGarbageCollectionSummaryDetails>>;
    /** Called when the latest summary of the system has been refreshed. */
    latestSummaryStateRefreshed(result: RefreshSummaryResult, readAndParseBlob: ReadAndParseBlob): Promise<void>;
    /** Called when a node is changed. Used to detect and log when an inactive node is changed. */
    nodeChanged(id: string): void;
    /** Called when a reference is added to a node. Used to identify nodes that were referenced between summaries. */
    addedOutboundReference(fromNodeId: string, toNodeId: string): void;
}

/**
 * Helper class that tracks the state of an unreferenced node such as the time it was unreferenced. It also sets
 * the node's state to inactive if it remains unreferenced for a given amount of time (inactiveTimeoutMs).
 */
class UnreferencedStateTracker {
    private inactive: boolean = false;
    // Keeps track of all inactive events that are logged. This is used to limit the log generation for each event to 1
    // so that it is not noisy.
    private readonly inactiveEventsLogged: Set<string> = new Set();
    private readonly timer: Timer | undefined;

    constructor(
        public readonly unreferencedTimestampMs: number,
        inactiveTimeoutMs: number,
    ) {
        // If the timeout has already expired, the node should become inactive immediately. Otherwise, start a timer of
        // inactiveTimeoutMs after which the node will become inactive.
        if (inactiveTimeoutMs <= 0) {
            this.inactive = true;
        } else {
            this.timer = new Timer(inactiveTimeoutMs, () => { this.inactive = true; });
            this.timer.start();
        }
    }

    /** Stop tracking this node. Reset the unreferenced timer, if any, and reset inactive state. */
    public stopTracking() {
        this.timer?.clear();
        this.inactive = false;
    }

    /** Logs an error with the given properties if the node  is inactive. */
    public logIfInactive(
        logger: ITelemetryLogger,
        eventName: string,
        currentTimestampMs: number,
        deleteTimeoutMs: number,
        inactiveNodeId: string,
    ) {
        if (this.inactive && !this.inactiveEventsLogged.has(eventName)) {
            logger.sendErrorEvent({
                eventName,
                age: currentTimestampMs - this.unreferencedTimestampMs,
                timeout: deleteTimeoutMs,
                id: inactiveNodeId,
            });
            this.inactiveEventsLogged.add(eventName);
        }
    }
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
        getCurrentTimestampMs: () => number,
        baseSnapshot: ISnapshotTree | undefined,
        readAndParseBlob: ReadAndParseBlob,
        baseLogger: ITelemetryLogger,
        existing: boolean,
        metadata?: IContainerRuntimeMetadata,
    ): IGarbageCollector {
        return new GarbageCollector(
            provider,
            gcOptions,
            deleteUnusedRoutes,
            getCurrentTimestampMs,
            baseSnapshot,
            readAndParseBlob,
            baseLogger,
            existing,
            metadata,
        );
    }

    /**
     * Tells whether GC should be run based on the GC options and local storage flags.
     */
    public readonly shouldRunGC: boolean;

    /**
     * This tracks two things:
     * 1. Whether GC is enabled - If this is 0, GC is disabled. If this is greater than 0, GC is enabled.
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
    private readonly mc: MonitoringContext;

    /**
     * Tells whether the GC data should be written to the root of the summary tree. We do this under 2 conditions:
     * 1. If `writeDataAtRoot` GC option is enabled.
     * 2. If the base summary has the GC data written at the root. This is to support forward compatibility where when
     *    we start writing the GC data at root, older versions can detect that and write at root too.
     */
    private _writeDataAtRoot: boolean = false;
    public get writeDataAtRoot(): boolean {
        return this._writeDataAtRoot;
    }

    // The current GC version that this container is running.
    private readonly currentGCVersion = GCVersion;
    // This is the version of GC data in the latest summary being tracked.
    private latestSummaryGCVersion: GCVersion;

    // Keeps track of the GC state from the last run.
    private gcDataFromLastRun: IGarbageCollectionData | undefined;
    // Keeps a list of references (edges in the GC graph) between GC runs. Each entry has a node id and a list of
    // outbound routes from that node.
    private readonly referencesSinceLastRun: Map<string, string[]> = new Map();

    // Promise when resolved initializes the base state of the nodes from the base summary state.
    private readonly initializeBaseStateP: Promise<void>;
    // The map of data store ids to their GC details in the base summary returned in getDataStoreGCDetails().
    private readonly dataStoreGCDetailsP: Promise<Map<string, IGarbageCollectionSummaryDetails>>;
    // The time after which an unreferenced node can be deleted. Currently, we only set the node's state to expired.
    private readonly deleteTimeoutMs: number;
    // Map of node ids to their unreferenced state tracker.
    private readonly unreferencedNodesState: Map<string, UnreferencedStateTracker> = new Map();

    protected constructor(
        private readonly provider: IGarbageCollectionRuntime,
        private readonly gcOptions: IGCRuntimeOptions,
        /** After GC has run, called to delete objects in the runtime whose routes are unused. */
        private readonly deleteUnusedRoutes: (unusedRoutes: string[]) => void,
        /** Returns the current timestamp to be assigned to nodes that become unreferenced. */
        private readonly getCurrentTimestampMs: () => number,
        baseSnapshot: ISnapshotTree | undefined,
        readAndParseBlob: ReadAndParseBlob,
        baseLogger: ITelemetryLogger,
        existing: boolean,
        metadata?: IContainerRuntimeMetadata,
    ) {
        this.mc = loggerToMonitoringContext(
            ChildLogger.create(baseLogger, "GarbageCollector"));

        this.deleteTimeoutMs = this.gcOptions.deleteTimeoutMs ?? defaultDeleteTimeoutMs;

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
        this.shouldRunGC = this.mc.config.getBoolean(runGCKey) ?? (
            // GC must be enabled for the document.
            this.gcEnabled
            // GC must not be disabled via GC options.
            && !gcOptions.disableGC
        );

        // Whether GC sweep phase should run or not. If this is false, only GC mark phase is run. Can override with
        // localStorage flag.
        this.shouldRunSweep = this.shouldRunGC &&
            (this.mc.config.getBoolean(runSweepKey) ?? gcOptions.runSweep === true);

        // Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
        this.testMode = this.mc.config.getBoolean(gcTestModeKey) ?? gcOptions.runGCInTestMode === true;

        // If `writeDataAtRoot` GC option is true, we should write the GC data into the root of the summary tree. This
        // GC option is used for testing only. It will be removed once we start writing GC data into root by default.
        this._writeDataAtRoot = this.gcOptions.writeDataAtRoot === true;

        // Get the GC state from the GC blob in the base snapshot. Use LazyPromise because we only want to do
        // this once since it involves fetching blobs from storage which is expensive.
        const baseSummaryStateP = new LazyPromise<IGarbageCollectionState | undefined>(async () => {
            if (baseSnapshot === undefined) {
                return undefined;
            }

            // For newer documents, GC data should be present in the GC tree in the root of the snapshot.
            const gcSnapshotTree = baseSnapshot.trees[gcTreeKey];
            if (gcSnapshotTree !== undefined) {
                // forward-compat - If a newer version has written the GC tree at root, we should also do the same.
                this._writeDataAtRoot = true;
                return getGCStateFromSnapshot(gcSnapshotTree, readAndParseBlob);
            }

            // back-compat - Older documents will have the GC blobs in each data store's summary tree. Get them and
            // consolidate into IGarbageCollectionState format.
            // Add a node for the root node that is not present in older snapshot format.
            const gcState: IGarbageCollectionState = { gcNodes: { "/": { outboundRoutes: [] } } };
            const dataStoreSnaphotTree = getSummaryForDatastores(baseSnapshot, metadata);
            assert(dataStoreSnaphotTree !== undefined,
                0x2a8 /* "Expected data store snapshot tree in base snapshot" */);
            for (const [dsId, dsSnapshotTree] of Object.entries(dataStoreSnaphotTree.trees)) {
                const blobId = dsSnapshotTree.blobs[gcBlobKey];
                if (blobId === undefined) {
                    continue;
                }

                const gcSummaryDetails = await readAndParseBlob<IGarbageCollectionSummaryDetails>(blobId);
                // If there are no nodes for this data store, skip it.
                if (gcSummaryDetails.gcData?.gcNodes === undefined) {
                    continue;
                }

                const dsRootId = `/${dsId}`;
                // Since we used to write GC data at data store level, we won't have an entry for the root ("/").
                // Construct that entry by adding root data store ids to its outbound routes.
                const initialSnapshotDetails = await readAndParseBlob<ReadFluidDataStoreAttributes>(
                    dsSnapshotTree.blobs[dataStoreAttributesBlobName],
                );
                if (initialSnapshotDetails.isRootDataStore) {
                    gcState.gcNodes["/"].outboundRoutes.push(dsRootId);
                }

                for (const [id, outboundRoutes] of Object.entries(gcSummaryDetails.gcData.gcNodes)) {
                    // Prefix the data store id to the GC node ids to make them relative to the root from being
                    // relative to the data store. Similar to how its done in DataStore::getGCData.
                    const rootId = id === "/" ? dsRootId : `${dsRootId}${id}`;
                    gcState.gcNodes[rootId] = { outboundRoutes: Array.from(outboundRoutes) };
                }
                assert(gcState.gcNodes[dsRootId] !== undefined,
                    0x2a9 /* `GC nodes for data store ${dsId} not in GC blob` */);
                gcState.gcNodes[dsRootId].unreferencedTimestampMs = gcSummaryDetails.unrefTimestamp;
            }

            // If there is only one node (root node just added above), either GC is disabled or we are loading from the
            // very first summary generated by detached container. In both cases, GC was not run - return undefined.
            return Object.keys(gcState.gcNodes).length === 1 ? undefined : gcState;
        });

        // Set up the initializer which initializes the base GC state from the base snapshot. Use lazy promise because
        // we only do this once - the very first time we run GC.
        this.initializeBaseStateP = new LazyPromise<void>(async () => {
            const currentTimestampMs = this.getCurrentTimestampMs();
            const baseState =  await baseSummaryStateP;
            if (baseState === undefined) {
                return;
            }

            const gcNodes: { [ id: string ]: string[] } = {};
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                const unreferencedTimestampMs = nodeData.unreferencedTimestampMs;
                if (unreferencedTimestampMs !== undefined) {
                    // Get how long it has been since the node was unreferenced. Start a timeout for the remaining time
                    // left for it to be eligible for deletion.
                    const unreferencedDurationMs = currentTimestampMs - unreferencedTimestampMs;
                    this.unreferencedNodesState.set(
                        nodeId,
                        new UnreferencedStateTracker(
                            unreferencedTimestampMs,
                            this.deleteTimeoutMs - unreferencedDurationMs,
                        ),
                    );
                }
                gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
            }
            this.gcDataFromLastRun = { gcNodes };
        });

        // Get the GC details for each data store from the GC state in the base summary. This is returned in
        // getDataStoreBaseGCDetails and is used to initialize each data store's base GC details.
        this.dataStoreGCDetailsP = new LazyPromise<Map<string, IGarbageCollectionSummaryDetails>>(async () => {
            const baseState = await baseSummaryStateP;
            if (baseState === undefined) {
                return new Map();
            }

            const gcNodes: { [ id: string ]: string[] } = {};
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
            }
            // Run GC on the nodes in the base summary to get the routes used in each node in the container.
            // This is an optimization for space (vs performance) wherein we don't need to store the used routes of
            // each node in the summary.
            const usedRoutes = runGarbageCollection(
                gcNodes,
                [ "/" ],
                this.mc.logger,
            ).referencedNodeIds;

            const dataStoreGCDetailsMap = unpackChildNodesGCDetails({ gcData: { gcNodes }, usedRoutes });
            // Currently, the data stores write the GC data. So, we need to update it's base GC details with the
            // unreferenced timestamp. Once we start writing the GC data here, we won't need to do this anymore.
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                if (nodeData.unreferencedTimestampMs !== undefined) {
                    const dataStoreGCDetails = dataStoreGCDetailsMap.get(nodeId.slice(1));
                    if (dataStoreGCDetails !== undefined) {
                        dataStoreGCDetails.unrefTimestamp = nodeData.unreferencedTimestampMs;
                    }
                }
            }
            return dataStoreGCDetailsMap;
        });
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
            logger = this.mc.logger,
            runSweep = this.shouldRunSweep,
            fullGC = this.gcOptions.runFullGC === true || this.hasGCVersionChanged,
        } = options;

        return PerformanceEvent.timedExecAsync(logger, { eventName: "GarbageCollection" }, async (event) => {
            await this.initializeBaseStateP;

            const gcStats: {
                deletedNodes?: number,
                totalNodes?: number,
                deletedDataStores?: number,
                totalDataStores?: number,
            } = {};

            // Get the runtime's GC data and run GC on the reference graph in it.
            const gcData = await this.provider.getGCData(fullGC);

            this.updateStateSinceLatestRun(gcData);

            const gcResult = runGarbageCollection(
                gcData.gcNodes,
                [ "/" ],
                logger,
            );

            const currentTimestampMs = this.getCurrentTimestampMs();
            // Update the current state of the system based on the GC run.
            this.updateCurrentState(gcData, gcResult, currentTimestampMs);

            const dataStoreUsedStateStats =
                this.provider.updateUsedRoutes(gcResult.referencedNodeIds, currentTimestampMs);

            if (runSweep) {
                // Placeholder for running sweep logic.
            }

            // Update stats to be reported in the peformance event.
            gcStats.deletedNodes = gcResult.deletedNodeIds.length;
            gcStats.totalNodes = gcResult.referencedNodeIds.length + gcResult.deletedNodeIds.length;
            gcStats.deletedDataStores = dataStoreUsedStateStats.unusedNodeCount;
            gcStats.totalDataStores = dataStoreUsedStateStats.totalNodeCount;

            // If we are running in GC test mode, delete objects for unused routes. This enables testing scenarios
            // involving access to deleted data.
            if (this.testMode) {
                this.deleteUnusedRoutes(gcResult.deletedNodeIds);
            }
            event.end(gcStats);
            return gcStats as IGCStats;
        },
        { end: true, cancel: "error" });
    }

    /**
     * Summarizes the GC data and returns it as a summary tree.
     * We current write the entire GC state in a single blob. This can be modified later to write multiple
     * blobs. All the blob keys should start with `gcBlobPrefix`.
     */
    public summarize(): ISummaryTreeWithStats | undefined {
        if (!this.shouldRunGC || this.gcDataFromLastRun === undefined) {
            return;
        }

        const gcState: IGarbageCollectionState = { gcNodes: {} };
        for (const [nodeId, outboundRoutes] of Object.entries(this.gcDataFromLastRun.gcNodes)) {
            gcState.gcNodes[nodeId] = {
                outboundRoutes,
                unreferencedTimestampMs: this.unreferencedNodesState.get(nodeId)?.unreferencedTimestampMs,
            };
        }

        const builder = new SummaryTreeBuilder();
        builder.addBlob(`${gcBlobPrefix}_root`, JSON.stringify(gcState));
        return builder.getSummaryTree();
    }

    /**
     * Returns a map of data store ids to their base GC details generated from the base summary.This is used to
     * initialize the data stores with their base GC state.
     */
    public async getDataStoreBaseGCDetails(): Promise<Map<string, IGarbageCollectionSummaryDetails>> {
        return this.dataStoreGCDetailsP;
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
     * Called when a node with the given id is changed. If the node is inactive, log an error.
     */
    public nodeChanged(id: string) {
        // Prefix "/" if needed to make it relative to the root.
        const nodeId = id.startsWith("/") ? id : `/${id}`;
        this.unreferencedNodesState.get(nodeId)?.logIfInactive(
            this.mc.logger,
            "inactiveObjectChanged",
            this.getCurrentTimestampMs(),
            this.deleteTimeoutMs,
            nodeId,
        );
    }

    /**
     * Called when an outbound reference is added to a node. This is used to identify all nodes that have been
     * referenced between summaries so that their unreferenced timestamp can be reset.
     *
     * @param fromNodeId - The node from which the reference is added.
     * @param toNodeId - The node to which the reference is added.
     */
    public addedOutboundReference(fromNodeId: string, toNodeId: string) {
        const outboundRoutes = this.referencesSinceLastRun.get(fromNodeId) ?? [];
        outboundRoutes.push(toNodeId);
        this.referencesSinceLastRun.set(fromNodeId, outboundRoutes);
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

    /**
     * Updates the state of the system as per the current GC run. It does the following:
     * 1. Sets up the current GC state as per the gcData.
     * 2. Starts tracking for nodes that have become unreferenced in this run.
     * 3. Clears tracking for nodes that were unreferenced but became referenced in this run.
     * @param gcData - The data representing the reference graph on which GC is run.
     * @param gcResult - The result of the GC run on the gcData.
     * @param currentTimestampMs - The current timestamp to be used for unreferenced nodes' timestamp.
     */
    private updateCurrentState(gcData: IGarbageCollectionData, gcResult: IGCResult, currentTimestampMs: number) {
        this.gcDataFromLastRun = cloneGCData(gcData);
        this.referencesSinceLastRun.clear();

        // Iterate through the deleted nodes and start tracking if they became unreferenced in this run.
        for (const nodeId of gcResult.deletedNodeIds) {
            // The time when the node became unreferenced. This is added to the current GC state.
            let unreferencedTimestampMs: number = currentTimestampMs;
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker !== undefined) {
                unreferencedTimestampMs = nodeStateTracker.unreferencedTimestampMs;
            } else {
                // Start tracking this node as it became unreferenced in this run.
                this.unreferencedNodesState.set(
                    nodeId,
                    new UnreferencedStateTracker(unreferencedTimestampMs, this.deleteTimeoutMs),
                );
            }
        }

        // Iterate through the referenced nodes and stop tracking if they were unreferenced before.
        for (const nodeId of gcResult.referencedNodeIds) {
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker !== undefined) {
                // If this node has been unreferenced for longer than deleteTimeoutMs and is being referenced,
                // log an error as this may mean the deleteTimeoutMs is not long enough.
                nodeStateTracker.logIfInactive(
                    this.mc.logger,
                    "inactiveObjectRevived",
                    currentTimestampMs,
                    this.deleteTimeoutMs,
                    nodeId,
                );
                // Stop tracking so as to clear out any running timers.
                nodeStateTracker.stopTracking();
                // Delete the node as we don't need to track it any more.
                this.unreferencedNodesState.delete(nodeId);
            }
        }
    }

    /**
     * Since GC runs periodically, the GC data that is generated only tells us the state of the world at that point in
     * time. It's possible that nodes transition from `unreferenced -> referenced -> unreferenced` between two runs. The
     * unreferenced timestamp of such nodes needs to be reset as they may have been accessed when they were referenced.
     *
     * This function identifies nodes that were referenced since last run and removes their unreferenced state, if any.
     * If these nodes are currently unreferenced, they will be assigned new unreferenced state by the current run.
     */
    private updateStateSinceLatestRun(currentGCData: IGarbageCollectionData) {
        // If we haven't run GC before or no references were added since the last run, there is nothing to do.
        if (this.gcDataFromLastRun === undefined || this.referencesSinceLastRun.size === 0) {
            return;
        }

        /**
         * Generate a super set of the GC data that contains the nodes and edges from last run, plus any new node and
         * edges that have been added since then. To do this, combine the GC data from the last run and the current
         * run, and then add the references since last run.
         *
         * Note on why we need to combine the data from previous run, current run and all references in between -
         * 1. We need data from last run because some of its references may have been deleted since then. If those
         *    references added new outbound references before getting deleted, we need to detect them.
         * 2. We need new outbound references since last run because some of them may have been deleted later. If those
         *    references added new outbound references before getting deleted, we need to detect them.
         * 3. We need data from the current run because currently we may not detect when DDSs are referenced:
         *    - We don't require DDSs handles to be stored in a referenced DDS. For this, we need GC at DDS level
         *      which is tracked by https://github.com/microsoft/FluidFramework/issues/8470.
         *    - A new data store may have "root" DDSs already created and we don't detect them today.
         */
        const gcDataSuperSet = concatGarbageCollectionData(this.gcDataFromLastRun, currentGCData);
        this.referencesSinceLastRun.forEach((outboundRoutes: string[], sourceNodeId: string) => {
            if (gcDataSuperSet.gcNodes[sourceNodeId] === undefined) {
                gcDataSuperSet.gcNodes[sourceNodeId] = outboundRoutes;
            } else {
                gcDataSuperSet.gcNodes[sourceNodeId].push(...outboundRoutes);
            }
        });

        /**
         * Run GC on the above reference graph to find all nodes that are referenced. For each one, if they are
         * unreferenced, stop tracking them and remove from unreferenced list.
         * Some of these nodes may be unreferenced now and if so, the current run will add unreferenced state for them.
         */
        const gcResult = runGarbageCollection(gcDataSuperSet.gcNodes, ["/"], this.mc.logger);
        for (const nodeId of gcResult.referencedNodeIds) {
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker !== undefined) {
                // Stop tracking so as to clear out any running timers.
                nodeStateTracker.stopTracking();
                // Delete the node as we don't need to track it any more.
                this.unreferencedNodesState.delete(nodeId);
            }
        }
    }
}

/**
 * Gets the garbage collection state from the given snapshot tree. The GC state may be written into multiple blobs.
 * Merge the GC state from all such blobs and return the merged GC state.
*/
async function getGCStateFromSnapshot(
    gcSnapshotTree: ISnapshotTree,
    readAndParseBlob: ReadAndParseBlob,
): Promise<IGarbageCollectionState> {
    let rootGCState: IGarbageCollectionState = { gcNodes: {} };
    for (const key of Object.keys(gcSnapshotTree.blobs)) {
        // Skip blobs that do not stsart with the GC prefix.
        if (!key.startsWith(gcBlobPrefix)) {
            continue;
        }

        const blobId = gcSnapshotTree.blobs[key];
        if (blobId === undefined) {
            continue;
        }
        const gcState = await readAndParseBlob<IGarbageCollectionState>(blobId);
        assert(gcState !== undefined, 0x2ad /* "GC blob missing from snapshot" */);
        // Merge the GC state of this blob into the root GC state.
        rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
    }
    return rootGCState;
}
