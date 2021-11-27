/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, LazyPromise, Timer } from "@fluidframework/common-utils";
import { IGCResult, runGarbageCollection } from "@fluidframework/garbage-collector";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
} from "@fluidframework/runtime-definitions";
import { ReadAndParseBlob, RefreshSummaryResult } from "@fluidframework/runtime-utils";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";

import { IGCRuntimeOptions } from "./containerRuntime";
import { getSummaryForDatastores } from "./dataStores";
import { getLocalStorageFeatureGate } from "./localStorageFeatureGates";
import {
    gcBlobName,
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
    /** Called when a node is changed. Used to detect and log when an inactive node is changed. */
    nodeChanged(id: string): void;
}

/** The garbage collection data of each node in the reference graph. */
interface IGCNodeData {
    /** The set of routes to other nodes in the graph. */
    outboundRoutes: string[];
    /** If the node is unreferenced, the timestamp of when it was marked unreferenced. */
    unreferencedTimestampMs?: number;
}

/**
 * The garbage collection state of the reference graph. It contains a list of all the nodes in the graph and their
 * GC data.
 */
interface IGCState {
    gcNodes: { [ id: string ]: IGCNodeData };
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
        public readonly unrefencedTimestampMs: number,
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
                unreferencedDuratonMs: currentTimestampMs - this.unrefencedTimestampMs,
                deleteTimeoutMs,
                inactiveNodeId,
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

    // The current state - each node's GC data and unreferenced timestamp.
    private currentGCState: IGCState | undefined;

    // Promise when resolved initializes the base state of the nodes from the base summary state.
    private readonly initializeBaseStateP: Promise<void>;
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
        this.logger = ChildLogger.create(baseLogger, "GarbageCollector");

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

        // Get the GC state from the GC blob in the base snapshot. Use LazyPromise because we only want to do
        // this once since it involves fetching blobs from storage which is expensive.
        const baseSummaryStateP = new LazyPromise<IGCState>(async () => {
            const gcState: IGCState = { gcNodes: {} };
            if (baseSnapshot === undefined) {
                return gcState;
            }

            // Get GC blobs from each data store's summary tree. Get them and consolidate into IGCState format.
            const dataStoreSnaphotTree = getSummaryForDatastores(baseSnapshot, metadata);
            assert(dataStoreSnaphotTree !== undefined, "Expected data store snapshot tree in base snapshot");
            for (const [dsId, dsSnapshotTree] of Object.entries(dataStoreSnaphotTree.trees)) {
                const blobId = dsSnapshotTree.blobs[gcBlobName];
                if (blobId === undefined) {
                    continue;
                }

                const gcSummaryDetails = await readAndParseBlob<IGarbageCollectionSummaryDetails>(blobId);
                // If there are no nodes for this data store, skip it.
                if (gcSummaryDetails.gcData?.gcNodes === undefined || gcSummaryDetails.gcData.gcNodes === {}) {
                    continue;
                }
                const dsRootId = `/${dsId}`;
                for (const [id, outboundRoutes] of Object.entries(gcSummaryDetails.gcData.gcNodes)) {
                    // Prefix the data store id to the GC node ids to make them relative to the root from being
                    // relative to the data store. Similar to how its done in DataStore::getGCData.
                    const rootId = id === "/" ? dsRootId : `${dsRootId}${id}`;
                    gcState.gcNodes[rootId] = { outboundRoutes: Array.from(outboundRoutes) };
                }
                assert(gcState.gcNodes[dsRootId] !== undefined, `GC nodes for data store ${dsId} not in GC blob`);
                gcState.gcNodes[dsRootId].unreferencedTimestampMs = gcSummaryDetails.unrefTimestamp;
            }
            return gcState;
        });

        // Set up the initializer which initializes the base GC state from the base snapshot. Use lazy promise because
        // we only do this once - the very first time we run GC.
        this.initializeBaseStateP = new LazyPromise<void>(async () => {
            const gcNodes: { [ id: string ]: IGCNodeData } = {};
            const baseState = await baseSummaryStateP;
            if (baseState === undefined) {
                this.currentGCState = { gcNodes };
                return;
            }

            // Set up tracking for the nodes in the base summary state and add them to GC nodes.
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                const unreferencedTimestampMs = nodeData.unreferencedTimestampMs;
                if (unreferencedTimestampMs !== undefined) {
                    // Get how long it has been since the node was unreferenced. Start a timeout for the remaining time
                    // left for it to be eligible for deletion.
                    const unreferencedDurationMs = this.getCurrentTimestampMs() - unreferencedTimestampMs;
                    this.unreferencedNodesState.set(
                        nodeId,
                        new UnreferencedStateTracker(
                            unreferencedTimestampMs,
                            this.deleteTimeoutMs - unreferencedDurationMs,
                        ),
                    );
                }

                gcNodes[nodeId] = {
                    outboundRoutes: Array.from(nodeData.outboundRoutes),
                    unreferencedTimestampMs,
                };
            }
            this.currentGCState = { gcNodes };
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
            logger = this.logger,
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
            this.logger,
            "inactiveObjectChanged",
            this.getCurrentTimestampMs(),
            this.deleteTimeoutMs,
            nodeId,
        );
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
        this.currentGCState = { gcNodes: {} };
        for (const [id, outboundRoutes] of Object.entries(gcData.gcNodes)) {
            this.currentGCState.gcNodes[id] = { outboundRoutes: Array.from(outboundRoutes) };
        }

        // Iterate through the deleted nodes and start tracking if they became unreferenced in this run.
        for (const nodeId of gcResult.deletedNodeIds) {
            assert(this.currentGCState.gcNodes[nodeId] !== undefined, "Unexpected node when running GC");

            // The time when the node became unreferenced. This is added to the current GC state.
            let unreferencedTimestampMs: number = currentTimestampMs;
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker !== undefined) {
                unreferencedTimestampMs = nodeStateTracker.unrefencedTimestampMs;
            } else {
                // Start tracking this node as it became unreferenced in this run.
                this.unreferencedNodesState.set(
                    nodeId,
                    new UnreferencedStateTracker(unreferencedTimestampMs, this.deleteTimeoutMs),
                );
            }
            this.currentGCState.gcNodes[nodeId].unreferencedTimestampMs = unreferencedTimestampMs;
        }

        // Iterate through the referenced nodes and stop tracking if they were unreferenced before.
        for (const nodeId of gcResult.referencedNodeIds) {
            assert(this.currentGCState.gcNodes[nodeId] !== undefined, "Unexpected node when running GC");
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker !== undefined) {
                // If this node has been unreferenced for longer than deleteTimeoutMs and is being referenced,
                // log an error as this may mean the deleteTimeoutMs is not long enough.
                nodeStateTracker.logIfInactive(
                    this.logger,
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
}
