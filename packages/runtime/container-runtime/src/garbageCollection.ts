/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryPerformanceEvent } from "@fluidframework/common-definitions";
import { assert, LazyPromise, Timer } from "@fluidframework/common-utils";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ClientSessionExpiredError, DataProcessingError } from "@fluidframework/container-utils";
import { IRequestHeader } from "@fluidframework/core-interfaces";
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
    IGarbageCollectionDetailsBase,
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
    TelemetryDataTag,
} from "@fluidframework/telemetry-utils";

import { IGCRuntimeOptions, RuntimeHeaders } from "./containerRuntime";
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

// Feature gate key to turn GC on / off.
const runGCKey = "Fluid.GarbageCollection.RunGC";
// Feature gate key to turn GC test mode on / off.
const gcTestModeKey = "Fluid.GarbageCollection.GCTestMode";
// Feature gate key to turn GC sweep on / off.
const runSweepKey = "Fluid.GarbageCollection.RunSweep";
// Feature gate key to write GC data at the root of the summary tree.
const writeAtRootKey = "Fluid.GarbageCollection.WriteDataAtRoot";
// Feature gate key to expire a session after a set period of time.
const runSessionExpiry = "Fluid.GarbageCollection.RunSessionExpiry";
// Feature gate key to log error messages if GC reference validation fails.
const logUnknownOutboundReferencesKey = "Fluid.GarbageCollection.LogUnknownOutboundReferences";

const defaultDeleteTimeoutMs = 7 * 24 * 60 * 60 * 1000; // 7 days
export const defaultSessionExpiryDurationMs = 30 * 24 * 60 * 60 * 1000; // 30 days

/** The statistics of the system state after a garbage collection run. */
export interface IGCStats {
    /** The number of nodes in the container. */
    nodeCount: number;
    /** The number of data stores in the container. */
    dataStoreCount: number;
    /** The number of attachment blobs in the container. */
    attachmentBlobCount: number;
    /** The number of unreferenced nodes in the container. */
    unrefNodeCount: number;
    /** The number of unreferenced data stores in the container. */
    unrefDataStoreCount: number;
    /** The number of unreferenced attachment blobs in the container. */
    unrefAttachmentBlobCount: number;
    /** The number of nodes whose reference state updated since last GC run. */
    updatedNodeCount: number;
    /** The number of data stores whose reference state updated since last GC run. */
    updatedDataStoreCount: number;
    /** The number of attachment blobs whose reference state updated since last GC run. */
    updatedAttachmentBlobCount: number;
}

/** The types of GC nodes in the GC reference graph. */
export const GCNodeType = {
    // Nodes that are for data stores.
    DataStore: "DataStore",
    // Nodes that are for attachment blobs, i.e., blobs uploaded via BlobManager.
    Blob: "Blob",
    // Nodes that are neither data store not blobs. For example, root node and DDS nodes.
    Other: "Other",
};
export type GCNodeType = typeof GCNodeType[keyof typeof GCNodeType];

/** The event that is logged when unreferenced node is used after a certain time. */
interface IUnreferencedEvent {
    eventName: string;
    id: string;
    age: number;
    timeout: number;
    lastSummaryTime?: number;
    externalRequest?: boolean;
    viaHandle?: boolean;
}

/** Defines the APIs for the runtime object to be passed to the garbage collector. */
export interface IGarbageCollectionRuntime {
    /** Before GC runs, called to notify the runtime to update any pending GC state. */
    updateStateBeforeGC(): Promise<void>;
    /** Returns the garbage collection data of the runtime. */
    getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
    /** After GC has run, called to notify the runtime of routes that are used in it. */
    updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number): void;
    /** After GC has run, called to delete objects in the runtime whose routes are unused. */
    deleteUnusedRoutes(unusedRoutes: string[]): void;
    /** Returns a referenced timestamp to be used to track unreferenced nodes. */
    getCurrentReferenceTimestampMs(): number | undefined;
    /** Returns the type of the GC node. */
    getNodeType(nodePath: string): GCNodeType;
    /** Called when the runtime should close because of an error. */
    closeFn(error?: ICriticalContainerError): void;
}

/** Defines the contract for the garbage collector. */
export interface IGarbageCollector {
    /** Tells whether GC should run or not. */
    readonly shouldRunGC: boolean;
    /** The time in ms to expire a session for a client for gc. */
    readonly sessionExpiryTimeoutMs: number | undefined;
    /**
     * This tracks two things:
     * 1. Whether GC is enabled - If this is 0, GC is disabled. If this is greater than 0, GC is enabled.
     * 2. If GC is enabled, the version of GC used to generate the GC data written in a summary.
     */
    readonly gcSummaryFeatureVersion: number;
    /** Tells whether the GC state in summary needs to be reset in the next summary. */
    readonly summaryStateNeedsReset: boolean;
    /** Tells whether GC data should be written to the root of the summary tree. */
    readonly writeDataAtRoot: boolean;
    /** Run garbage collection and update the reference / used state of the system. */
    collectGarbage(
        options: { logger?: ITelemetryLogger, runGC?: boolean, runSweep?: boolean, fullGC?: boolean },
    ): Promise<IGCStats>;
    /** Summarizes the GC data and returns it as a summary tree. */
    summarize(): ISummaryTreeWithStats | undefined;
    /** Returns a map of each node id to its base GC details in the base summary. */
    getBaseGCDetails(): Promise<Map<string, IGarbageCollectionDetailsBase>>;
    /** Called when the latest summary of the system has been refreshed. */
    latestSummaryStateRefreshed(result: RefreshSummaryResult, readAndParseBlob: ReadAndParseBlob): Promise<void>;
    /** Called when a node is updated. Used to detect and log when an inactive node is changed or loaded. */
    nodeUpdated(
        nodePath: string,
        reason: "Loaded" | "Changed",
        timestampMs?: number,
        packagePath?: readonly string[],
        requestHeaders?: IRequestHeader,
    ): void;
    /** Called when a reference is added to a node. Used to identify nodes that were referenced between summaries. */
    addedOutboundReference(fromNodePath: string, toNodePath: string): void;
    dispose(): void;
}

/**
 * Helper class that tracks the state of an unreferenced node such as the time it was unreferenced. It also sets
 * the node's state to inactive if it remains unreferenced for a given amount of time (inactiveTimeoutMs).
 */
class UnreferencedStateTracker {
    private _inactive: boolean = false;
    public get inactive(): boolean {
        return this._inactive;
    }

    private timer: Timer | undefined;

    constructor(
        public readonly unreferencedTimestampMs: number,
        private readonly inactiveTimeoutMs: number,
        currentReferenceTimestampMs?: number,
    ) {
        // If there is no current reference timestamp, don't track the node's inactive state. This will happen later
        // when updateTracking is called with a reference timestamp.
        if (currentReferenceTimestampMs !== undefined) {
            this.updateTracking(currentReferenceTimestampMs);
        }
    }

    /**
     * Updates the tracking state based on the provided timestamp.
     */
    public updateTracking(currentReferenceTimestampMs: number) {
        const unreferencedDurationMs = currentReferenceTimestampMs - this.unreferencedTimestampMs;
        // If the timeout has already expired, the node has become inactive.
        if (unreferencedDurationMs > this.inactiveTimeoutMs) {
            this._inactive = true;
            this.timer?.clear();
            return;
        }

        // The node isn't inactive yet. Restart a timer for the duration remaining for it to become inactive.
        const remainingDurationMs = this.inactiveTimeoutMs - unreferencedDurationMs;
        if (this.timer === undefined) {
            this.timer = new Timer(remainingDurationMs, () => { this._inactive = true; });
        }
        this.timer.restart(remainingDurationMs);
    }

    /**
     * Stop tracking this node. Reset the unreferenced timer, if any, and reset inactive state.
     */
    public stopTracking() {
        this.timer?.clear();
        this._inactive = false;
    }
}

/**
 * The garbage collector for the container runtime. It consolidates the garbage collection functionality and maintains
 * its state across summaries.
 *
 * Node - represented as nodeId, it's a node on the GC graph
 * Outbound Route - a path from one node to another node, think `nodeA` -> `nodeB`
 * Graph - all nodes with their respective routes
 *             GC Graph
 *
 *               Node
 *        NodeId = "datastore1"
 *           /             \
 *    OutboundRoute   OutboundRoute
 *         /                 \
 *       Node               Node
 *  NodeId = "dds1"     NodeId = "dds2"
 */
export class GarbageCollector implements IGarbageCollector {
    public static create(
        provider: IGarbageCollectionRuntime,
        gcOptions: IGCRuntimeOptions,
        getNodePackagePath: (nodePath: string) => readonly string[] | undefined,
        getLastSummaryTimestampMs: () => number | undefined,
        baseSnapshot: ISnapshotTree | undefined,
        readAndParseBlob: ReadAndParseBlob,
        baseLogger: ITelemetryLogger,
        existing: boolean,
        metadata?: IContainerRuntimeMetadata,
    ): IGarbageCollector {
        return new GarbageCollector(
            provider,
            gcOptions,
            getNodePackagePath,
            getLastSummaryTimestampMs,
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
     * The time in ms to expire a session for a client for gc.
     */
    public readonly sessionExpiryTimeoutMs: number | undefined;

    /**
     * This tracks two things:
     * 1. Whether GC is enabled - If this is 0, GC is disabled. If this is greater than 0, GC is enabled.
     * 2. If GC is enabled, the version of GC used to generate the GC data written in a summary.
     */
    public get gcSummaryFeatureVersion(): number {
        return this.gcEnabled ? this.currentGCVersion : 0;
    }

    /**
     * Tells whether the GC state needs to be reset in the next summary. We need to do this if:
     * 1. GC was enabled and is now disabled. The GC state needs to be removed and everything becomes referenced.
     * 2. GC was disabled and is now enabled. The GC state needs to be regenerated and added to summary.
     * 3. The GC version in the latest summary is different from the current GC version. This can happen if:
     *    3.1. The summary this client loaded with has data from a different GC version.
     *    3.2. This client's latest summary was updated from a snapshot that has a different GC version.
     */
    public get summaryStateNeedsReset(): boolean {
        return this.initialStateNeedsReset ||
            (this.shouldRunGC && this.latestSummaryGCVersion !== this.currentGCVersion);
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
     * Tells whether the GC data should be written to the root of the summary tree.
     */
    private _writeDataAtRoot: boolean = false;
    public get writeDataAtRoot(): boolean {
        return this._writeDataAtRoot;
     }

    /**
     * Tells whether the initial GC state needs to be reset. This can happen under 2 conditions:
     * 1. The base snapshot contains GC state but GC is disabled. This will happen the first time GC is disabled after
     *    it was enabled before. GC state needs to be removed from summary and all nodes should be marked referenced.
     * 2. The base snapshot does not have GC state but GC is enabled. This will happen the very first time GC runs on
     *    a document and the first time GC is enabled after is was disabled before.
     *
     * Note that the state needs reset only for the very first time summary is generated by this client. After that, the
     * state will be up-to-date and this flag will be reset.
    */
    private initialStateNeedsReset: boolean = false;

    // The current GC version that this container is running.
    private readonly currentGCVersion = GCVersion;
    // This is the version of GC data in the latest summary being tracked.
    private latestSummaryGCVersion: GCVersion;

    // Keeps track of the GC state from the last run.
    private previousGCDataFromLastRun: IGarbageCollectionData | undefined;
    // Keeps a list of references (edges in the GC graph) between GC runs. Each entry has a node id and a list of
    // outbound routes from that node.
    private readonly newReferencesSinceLastRun: Map<string, string[]> = new Map();

    // Promise when resolved initializes the base state of the nodes from the base summary state.
    private readonly initializeBaseStateP: Promise<void>;
    // The map of data store ids to their GC details in the base summary returned in getDataStoreGCDetails().
    private readonly baseGCDetailsP: Promise<Map<string, IGarbageCollectionDetailsBase>>;
    // The time after which an unreferenced node can be deleted. Currently, we only set the node's state to expired.
    private readonly deleteTimeoutMs: number;
    // Map of node ids to their unreferenced state tracker.
    private readonly unreferencedNodesState: Map<string, UnreferencedStateTracker> = new Map();
    // The timeout responsible for closing the container when the session has expired
    private sessionExpiryTimer?: ReturnType<typeof setTimeout>;

    // Keeps track of unreferenced events that are logged for a node. This is used to limit the log generation to one
    // per event per node.
    private readonly loggedUnreferencedEvents: Set<string> = new Set();
    // Queue for unreferenced events that should be logged the next time GC runs.
    private readonly pendingEventsQueue: IUnreferencedEvent[] = [];

    protected constructor(
        private readonly runtime: IGarbageCollectionRuntime,
        private readonly gcOptions: IGCRuntimeOptions,
        /** For a given node path, returns the node's package path. */
        private readonly getNodePackagePath: (nodePath: string) => readonly string[] | undefined,
        /** Returns the timestamp of the last summary generated for this container. */
        private readonly getLastSummaryTimestampMs: () => number | undefined,
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
        // documents, we get this information from the metadata blob. Similarly the session timeout should be
        // consistent across all clients, thus we grab it as well from the metadata blob, and set it once on creation.
        if (existing) {
            prevSummaryGCVersion = getGCVersion(metadata);
            // Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
            // other existing documents, GC is enabled.
            this.gcEnabled = prevSummaryGCVersion > 0;
            this.sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
        } else {
            // For new documents, GC has to be explicitly enabled via the gcAllowed flag in GC options.
            this.gcEnabled = gcOptions.gcAllowed === true;
            // Set the Session Expiry only if the flag is enabled or the test option is set.
            if (this.mc.config.getBoolean(runSessionExpiry) && this.gcEnabled) {
                this.sessionExpiryTimeoutMs = defaultSessionExpiryDurationMs;
            }
        }

        // If session expiry is enabled, we need to close the container when the timeout expires
        if (this.sessionExpiryTimeoutMs !== undefined) {
            const timeoutMs = this.sessionExpiryTimeoutMs;
            setLongTimeout(timeoutMs,
                () => {
                    this.runtime.closeFn(new ClientSessionExpiredError(`Client session expired.`, timeoutMs));
                },
                (timer) => {
                    this.sessionExpiryTimer = timer;
                });
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
            (this.mc.config.getBoolean(runSweepKey) ?? gcOptions.runSweep === true)
            && this.sessionExpiryTimer !== undefined;

        // Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
        this.testMode = this.mc.config.getBoolean(gcTestModeKey) ?? gcOptions.runGCInTestMode === true;

        /**
         * Enable resetting initial state once the following issue is resolved:
         * https://github.com/microsoft/FluidFramework/issues/8878.
         * Currently, the GC tree is not written at root, so we don't know if the base snapshot contains GC tree or not.
         */
        // The GC state needs to be reset if the base snapshot contains GC tree and GC is disabled or it doesn't contain
        // GC tree and GC is enabled.
        // const gcTreePresent = baseSnapshot?.trees[gcTreeKey] !== undefined;
        // this.initialStateNeedsReset = gcTreePresent ? !this.shouldRunGC : this.shouldRunGC;

        // If `writeDataAtRoot` setting is true, write the GC data into the root of the summary tree. We do this so that
        // the roll out can be staged. Once its rolled out everywhere, we will start writing at root by default.
        this._writeDataAtRoot = this.mc.config.getBoolean(writeAtRootKey) ?? this.gcOptions.writeDataAtRoot === true;

        // Get the GC state from the GC blob in the base snapshot. Use LazyPromise because we only want to do
        // this once since it involves fetching blobs from storage which is expensive.
        const baseSummaryStateP = new LazyPromise<IGarbageCollectionState | undefined>(async () => {
            if (baseSnapshot === undefined) {
                return undefined;
            }

            // For newer documents, GC data should be present in the GC tree in the root of the snapshot.
            const gcSnapshotTree = baseSnapshot.trees[gcTreeKey];
            if (gcSnapshotTree !== undefined) {
                // If the GC tree is written at root, we should also do the same.
                this._writeDataAtRoot = true;
                return getGCStateFromSnapshot(gcSnapshotTree, readAndParseBlob);
            }

            // back-compat - Older documents will have the GC blobs in each data store's summary tree. Get them and
            // consolidate into IGarbageCollectionState format.
            // Add a node for the root node that is not present in older snapshot format.
            const gcState: IGarbageCollectionState = { gcNodes: { "/": { outboundRoutes: [] } } };
            const dataStoreSnapshotTree = getSummaryForDatastores(baseSnapshot, metadata);
            assert(dataStoreSnapshotTree !== undefined,
                0x2a8 /* "Expected data store snapshot tree in base snapshot" */);
            for (const [dsId, dsSnapshotTree] of Object.entries(dataStoreSnapshotTree.trees)) {
                const blobId = dsSnapshotTree.blobs[gcBlobKey];
                if (blobId === undefined) {
                    continue;
                }

                const gcSummaryDetails = await readAndParseBlob<IGarbageCollectionDetailsBase>(blobId);
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

        /**
         * Set up the initializer which initializes the base GC state from the base snapshot. Note that the reference
         * timestamp maybe from old ops which were not summarized and stored in the file. So, the unreferenced state
         * may be out of date. This is fine because the state is updated every time GC runs based on the time then.
         */
        this.initializeBaseStateP = new LazyPromise<void>(async () => {
            const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
            const baseState = await baseSummaryStateP;
            if (baseState === undefined) {
                return;
            }

            const gcNodes: { [ id: string ]: string[] } = {};
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                if (nodeData.unreferencedTimestampMs !== undefined) {
                    this.unreferencedNodesState.set(
                        nodeId,
                        new UnreferencedStateTracker(
                            nodeData.unreferencedTimestampMs,
                            this.deleteTimeoutMs,
                            currentReferenceTimestampMs,
                        ),
                    );
                }
                gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
            }
            this.previousGCDataFromLastRun = { gcNodes };
        });

        // Get the GC details for each node from the GC state in the base summary. This is returned in getBaseGCDetails
        // which the caller uses to initialize each node's GC state.
        this.baseGCDetailsP = new LazyPromise<Map<string, IGarbageCollectionDetailsBase>>(async () => {
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
                ["/"],
                this.mc.logger,
            ).referencedNodeIds;

            const baseGCDetailsMap = unpackChildNodesGCDetails({ gcData: { gcNodes }, usedRoutes });
            // Currently, the nodes may write the GC data. So, we need to update it's base GC details with the
            // unreferenced timestamp. Once we start writing the GC data here, we won't need to do this anymore.
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                if (nodeData.unreferencedTimestampMs !== undefined) {
                    const dataStoreGCDetails = baseGCDetailsMap.get(nodeId.slice(1));
                    if (dataStoreGCDetails !== undefined) {
                        dataStoreGCDetails.unrefTimestamp = nodeData.unreferencedTimestampMs;
                    }
                }
            }
            return baseGCDetailsMap;
        });

        // Initialize the base state. The base GC data is used to detect and log when inactive / deleted objects are
        // used in the container.
        if (this.shouldRunGC) {
            this.initializeBaseStateP.catch((error) => {
                const dpe = DataProcessingError.wrapIfUnrecognized(
                    error,
                    "FailedToInitializeGC",
                );
                dpe.addTelemetryProperties({
                    gcEnabled: this.gcEnabled,
                    runSweep: this.shouldRunSweep,
                    writeAtRoot: this._writeDataAtRoot,
                    testMode: this.testMode,
                    sessionExpiry: this.sessionExpiryTimeoutMs,
                });
                throw dpe;
            });
        }
    }

    /**
     * Runs garbage collection and updates the reference / used state of the nodes in the container.
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
            fullGC = this.gcOptions.runFullGC === true || this.summaryStateNeedsReset,
        } = options;

        return PerformanceEvent.timedExecAsync(logger, { eventName: "GarbageCollection" }, async (event) => {
            await this.initializeBaseStateP;

            // Let the runtime update its pending state before GC runs.
            await this.runtime.updateStateBeforeGC();

            // Get the runtime's GC data and run GC on the reference graph in it.
            const gcData = await this.runtime.getGCData(fullGC);
            const gcResult = runGarbageCollection(
                gcData.gcNodes,
                ["/"],
                logger,
            );
            const gcStats = this.generateStatsAndLogEvents(gcResult);

            // Update the state since the last GC run. There can be nodes that were referenced between the last and
            // the current run. We need to identify than and update their unreferenced state if needed.
            this.updateStateSinceLastRun(gcData);

            // Update the current state of the system based on the GC run.
            const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
            this.updateCurrentState(gcData, gcResult, currentReferenceTimestampMs);

            this.runtime.updateUsedRoutes(gcResult.referencedNodeIds, currentReferenceTimestampMs);

            if (runSweep) {
                // Placeholder for running sweep logic.
            }

            // If we are running in GC test mode, delete objects for unused routes. This enables testing scenarios
            // involving access to deleted data.
            if (this.testMode) {
                this.runtime.deleteUnusedRoutes(gcResult.deletedNodeIds);
            }
            event.end({ ...gcStats });
            return gcStats;
        },
        { end: true, cancel: "error" });
    }

    /**
     * Summarizes the GC data and returns it as a summary tree.
     * We current write the entire GC state in a single blob. This can be modified later to write multiple
     * blobs. All the blob keys should start with `gcBlobPrefix`.
     */
    public summarize(): ISummaryTreeWithStats | undefined {
        if (!this.shouldRunGC || this.previousGCDataFromLastRun === undefined) {
            return;
        }

        const gcState: IGarbageCollectionState = { gcNodes: {} };
        for (const [nodeId, outboundRoutes] of Object.entries(this.previousGCDataFromLastRun.gcNodes)) {
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
     * Returns a map of node ids to their base GC details generated from the base summary. This is used by the caller
     * to initialize the GC state of the nodes.
     */
    public async getBaseGCDetails(): Promise<Map<string, IGarbageCollectionDetailsBase>> {
        return this.baseGCDetailsP;
    }

    /**
     * Called when the latest summary of the system has been refreshed. This will be used to update the state of the
     * latest summary tracked.
     */
    public async latestSummaryStateRefreshed(
        result: RefreshSummaryResult,
        readAndParseBlob: ReadAndParseBlob,
    ): Promise<void> {
        // After a summary is successfully submitted and ack'd by this client, the GC state should have been reset in
        // the summary and doesn't need to be reset anymore.
        this.initialStateNeedsReset = false;

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
     * Called when a node with the given id is updated. If the node is inactive, log an error.
     * @param nodePath - The id of the node that changed.
     * @param reason - Whether the node was loaded or changed.
     * @param timestampMs - The timestamp when the node changed.
     * @param packagePath - The package path of the node. This may not be available if the node hasn't been loaded yet.
     * @param requestHeaders - If the node was loaded via request path, the headers in the request.
     */
    public nodeUpdated(
        nodePath: string,
        reason: "Loaded" | "Changed",
        timestampMs?: number,
        packagePath?: readonly string[],
        requestHeaders?: IRequestHeader,
    ) {
        if (!this.shouldRunGC) {
            return;
        }

        this.logIfInactive(
            reason,
            nodePath,
            timestampMs,
            packagePath,
            requestHeaders,
        );
    }

    /**
     * Called when an outbound reference is added to a node. This is used to identify all nodes that have been
     * referenced between summaries so that their unreferenced timestamp can be reset.
     *
     * @param fromNodePath - The node from which the reference is added.
     * @param toNodePath - The node to which the reference is added.
     */
    public addedOutboundReference(fromNodePath: string, toNodePath: string) {
        if (!this.shouldRunGC) {
            return;
        }

        const outboundRoutes = this.newReferencesSinceLastRun.get(fromNodePath) ?? [];
        outboundRoutes.push(toNodePath);
        this.newReferencesSinceLastRun.set(fromNodePath, outboundRoutes);

        // If the node that got referenced is inactive, log an event as that may indicate use-after-delete.
        this.logIfInactive(
            "Revived",
            toNodePath,
        );
    }

    public dispose(): void {
        if (this.sessionExpiryTimer !== undefined) {
            clearTimeout(this.sessionExpiryTimer);
            this.sessionExpiryTimer = undefined;
        }
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
     * @param currentReferenceTimestampMs - The timestamp to be used for unreferenced nodes' timestamp.
     */
    private updateCurrentState(
        gcData: IGarbageCollectionData,
        gcResult: IGCResult,
        currentReferenceTimestampMs?: number,
    ) {
        this.previousGCDataFromLastRun = cloneGCData(gcData);
        this.newReferencesSinceLastRun.clear();

        // Iterate through the referenced nodes and stop tracking if they were unreferenced before.
        for (const nodeId of gcResult.referencedNodeIds) {
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker !== undefined) {
                // Stop tracking so as to clear out any running timers.
                nodeStateTracker.stopTracking();
                // Delete the node as we don't need to track it any more.
                this.unreferencedNodesState.delete(nodeId);
            }
        }

        /**
         * If there is no current reference time, skip tracking when a node becomes unreferenced. This would happen
         * if no ops have been processed ever and we still try to run GC. If so, there is nothing interesting to track
         * anyway.
         */
        if (currentReferenceTimestampMs === undefined) {
            return;
        }

        /**
         * If a node became unreferenced in this run, start tracking it.
         * If a node was already unreferenced, update its tracking information. Since the current reference time is
         * from the ops seen, this will ensure that we keep updating the unreferenced state as time moves forward.
         */
        for (const nodeId of gcResult.deletedNodeIds) {
            const nodeStateTracker = this.unreferencedNodesState.get(nodeId);
            if (nodeStateTracker === undefined) {
                this.unreferencedNodesState.set(
                    nodeId,
                    new UnreferencedStateTracker(
                        currentReferenceTimestampMs,
                        this.deleteTimeoutMs,
                        currentReferenceTimestampMs,
                    ),
                );
            } else {
                nodeStateTracker.updateTracking(currentReferenceTimestampMs);
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
    private updateStateSinceLastRun(currentGCData: IGarbageCollectionData) {
        // If we haven't run GC before there is nothing to do.
        if (this.previousGCDataFromLastRun === undefined) {
            return;
        }

        // Find any references that haven't been identified correctly.
        const missingExplicitReferences = this.findMissingExplicitReferences(
            currentGCData,
            this.previousGCDataFromLastRun,
            this.newReferencesSinceLastRun,
        );

        // The following log will be enabled once this issue is resolved:
        // https://github.com/microsoft/FluidFramework/issues/8878.
        if (this.mc.config.getBoolean(logUnknownOutboundReferencesKey) === true
            && missingExplicitReferences.length > 0) {
            missingExplicitReferences.forEach((missingExplicitReference) => {
                const event: ITelemetryPerformanceEvent = {
                    eventName: "gcUnknownOutboundReferences",
                    gcNodeId: missingExplicitReference[0],
                    gcRoutes: JSON.stringify(missingExplicitReference[1]),
                };
                this.mc.logger.sendPerformanceEvent(event);
            });
        }

        // No references were added since the last run so we don't have to update reference states of any unreferenced
        // nodes
        if (this.newReferencesSinceLastRun.size === 0) {
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
        const gcDataSuperSet = concatGarbageCollectionData(this.previousGCDataFromLastRun, currentGCData);
        this.newReferencesSinceLastRun.forEach((outboundRoutes: string[], sourceNodeId: string) => {
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

    /**
     * Finds all new references or outbound routes in the current graph that haven't been explicitly notified to GC.
     * The principle is that every new reference or outbound route must be notified to GC via the
     * addedOutboundReference method. It it hasn't, its a bug and we want to identify these scenarios.
     *
     * In more simple terms:
     * Missing Explicit References = Current References - Previous References - Explicitly Added References;
     *
     * @param currentGCData - The GC data (reference graph) from the current GC run.
     * @param previousGCData - The GC data (reference graph) from the previous GC run.
     * @param explicitReferences - New references added explicity between the previous and the current run.
     * @returns - a list of missing explicit references
     */
    private findMissingExplicitReferences(
        currentGCData: IGarbageCollectionData,
        previousGCData: IGarbageCollectionData,
        explicitReferences: Map<string, string[]>,
    ): [string, string[]][] {
        assert(
            previousGCData !== undefined,
            0x2b7, /* "Can't validate correctness without GC data from last run" */
        );

        const currentGraph = Object.entries(currentGCData.gcNodes);
        const missingExplicitReferences: [string, string[]][] = [];
        currentGraph.forEach(([nodeId, currentOutboundRoutes]) => {
            const previousRoutes = previousGCData.gcNodes[nodeId] ?? [];
            const explicitRoutes = explicitReferences.get(nodeId) ?? [];
            const missingExplicitRoutes: string[] = [];
            currentOutboundRoutes.forEach((route) => {
                const isBlobOrDataStoreRoute =
                    this.runtime.getNodeType(route) === GCNodeType.Blob ||
                    this.runtime.getNodeType(route) === GCNodeType.DataStore;
                // Ignore implicitly added DDS routes to their parent datastores
                const notRouteFromDDSToParentDataStore = !nodeId.startsWith(route);
                if (
                    isBlobOrDataStoreRoute &&
                    notRouteFromDDSToParentDataStore &&
                    (!previousRoutes.includes(route) && !explicitRoutes.includes(route))
                ) {
                    missingExplicitRoutes.push(route);
                }
            });
            if (missingExplicitRoutes.length > 0) {
                missingExplicitReferences.push([nodeId, missingExplicitRoutes]);
            }
        });

        // Ideally missingExplicitReferences should always have a size 0
        return missingExplicitReferences;
    }

    /**
     * Generates the stats of a garbage collection run from the given results of the run. Also, logs any pending events
     * in the pendingEventsQueue. This should be called before updating the current state because it generates stats
     * based on previous state of the system.
     * @param gcResult - The result of a GC run.
     * @returns the GC stats of the GC run.
     */
    private generateStatsAndLogEvents(gcResult: IGCResult): IGCStats {
        // Log pending events for unreferenced nodes after GC has run. We should have the package data available for
        // them now since the GC run should have loaded these nodes.
        let event = this.pendingEventsQueue.shift();
        while (event !== undefined) {
            const pkg = this.getNodePackagePath(event.id);
            this.mc.logger.sendErrorEvent({
                ...event,
                pkg: pkg ? { value: `/${pkg.join("/")}`, tag: TelemetryDataTag.PackageData } : undefined,
            });
            event = this.pendingEventsQueue.shift();
        }

        const gcStats: IGCStats = {
            nodeCount: 0,
            dataStoreCount: 0,
            attachmentBlobCount: 0,
            unrefNodeCount: 0,
            unrefDataStoreCount: 0,
            unrefAttachmentBlobCount: 0,
            updatedNodeCount: 0,
            updatedDataStoreCount: 0,
            updatedAttachmentBlobCount: 0,
        };

        const updateNodeStats = (nodeId: string, referenced: boolean) => {
            gcStats.nodeCount++;
            /**
             * `this.unreferencedNodesState` has the previous unreferenced state of all nodes. `referenced` flag passed
             * here is current state of the give node. Check if the reference state of the changed.
             */
            const stateUpdated = this.unreferencedNodesState.has(nodeId) ? referenced : !referenced;
            if (stateUpdated) {
                gcStats.updatedNodeCount++;
            }
            if (!referenced) {
                gcStats.unrefNodeCount++;
            }

            if (this.runtime.getNodeType(nodeId) === GCNodeType.DataStore) {
                gcStats.dataStoreCount++;
                if (stateUpdated) {
                    gcStats.updatedDataStoreCount++;
                }
                if (!referenced) {
                    gcStats.unrefDataStoreCount++;
                }
            }
            if (this.runtime.getNodeType(nodeId) === GCNodeType.Blob) {
                gcStats.attachmentBlobCount++;
                if (stateUpdated) {
                    gcStats.updatedAttachmentBlobCount++;
                }
                if (!referenced) {
                    gcStats.unrefAttachmentBlobCount++;
                }
            }
        };

        for (const nodeId of gcResult.referencedNodeIds) {
            updateNodeStats(nodeId, true /* referenced */);
        }

        for (const nodeId of gcResult.deletedNodeIds) {
            updateNodeStats(nodeId, false /* referenced */);
        }

        return gcStats;
    }

    /**
     * Logs an event if a node is inactive and is used.
     */
    private logIfInactive(
        eventSuffix: "Changed" | "Loaded" | "Revived",
        nodeId: string,
        currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs(),
        packagePath?: readonly string[],
        requestHeaders?: IRequestHeader,
    ) {
        // If there is no reference timestamp to work with, no ops have been processed after creation. If so, skip
        // logging as nothing interesting would have happened worth logging.
        if (currentReferenceTimestampMs === undefined) {
            return;
        }

        const eventName = `inactiveObject_${eventSuffix}`;
        // We log a particular event for a given node only once so that it is not too noisy.
        const uniqueEventId = `${nodeId}-${eventName}`;
        const nodeState = this.unreferencedNodesState.get(nodeId);
        if (nodeState?.inactive && !this.loggedUnreferencedEvents.has(uniqueEventId)) {
            this.loggedUnreferencedEvents.add(uniqueEventId);
            const event: IUnreferencedEvent = {
                eventName,
                id: nodeId,
                age: currentReferenceTimestampMs - nodeState.unreferencedTimestampMs,
                timeout: this.deleteTimeoutMs,
                lastSummaryTime: this.getLastSummaryTimestampMs(),
                externalRequest: requestHeaders?.[RuntimeHeaders.externalRequest],
                viaHandle: requestHeaders?.[RuntimeHeaders.viaHandle],
            };

            // If the package data for the node exists, log immediately. Otherwise, queue it and it will be logged the
            // next time GC runs as the package data should be available then.
            const pkg = packagePath ?? this.getNodePackagePath(nodeId);
            if (pkg !== undefined) {
                this.mc.logger.sendErrorEvent({
                    ...event,
                    pkg: { value: `/${pkg.join("/")}`, tag: TelemetryDataTag.PackageData },
                });
            } else {
                this.pendingEventsQueue.push(event);
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
        // Skip blobs that do not start with the GC prefix.
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

/**
 * setLongTimeout is used for timeouts longer than setTimeout's ~24.8 day max
 * @param timeoutMs - the total time the timeout needs to last in ms
 * @param timeoutFn - the function to execute when the timer ends
 * @param setTimerFn - the function used to update your timer variable
 */
function setLongTimeout(
    timeoutMs: number,
    timeoutFn: () => void,
    setTimerFn: (timer: ReturnType<typeof setTimeout>) => void,
) {
    // The setTimeout max is 24.8 days before looping occurs.
    const maxTimeout = 2147483647;
    let timer: ReturnType<typeof setTimeout>;
    if (timeoutMs > maxTimeout) {
        const newTimeoutMs = timeoutMs - maxTimeout;
        timer = setTimeout(() => setLongTimeout(newTimeoutMs, timeoutFn, setTimerFn), maxTimeout);
    } else {
        timer = setTimeout(() => timeoutFn(), timeoutMs);
    }
    setTimerFn(timer);
}
