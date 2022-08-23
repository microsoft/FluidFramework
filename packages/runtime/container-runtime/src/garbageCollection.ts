/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryPerformanceEvent } from "@fluidframework/common-definitions";
import { assert, LazyPromise, Timer } from "@fluidframework/common-utils";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { ClientSessionExpiredError, DataProcessingError, UsageError } from "@fluidframework/container-utils";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import {
    cloneGCData,
    concatGarbageCollectionStates,
    concatGarbageCollectionData,
    IGCResult,
    runGarbageCollection,
    unpackChildNodesGCDetails,
} from "@fluidframework/garbage-collector";
import { ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    gcBlobKey,
    IGarbageCollectionData,
    IGarbageCollectionState,
    IGarbageCollectionDetailsBase,
    ISummarizeResult,
    ITelemetryContext,
    IGarbageCollectionNodeData,
} from "@fluidframework/runtime-definitions";
import {
    mergeStats,
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
    IGCMetadata,
} from "./summaryFormat";

/** This is the current version of garbage collection. */
const GCVersion = 1;

// The key for the GC tree in summary.
export const gcTreeKey = "gc";
// They prefix for GC blobs in the GC tree in summary.
export const gcBlobPrefix = "__gc";

// Feature gate key to turn GC on / off.
export const runGCKey = "Fluid.GarbageCollection.RunGC";
// Feature gate key to turn GC sweep on / off.
export const runSweepKey = "Fluid.GarbageCollection.RunSweep";
// Feature gate key to turn GC test mode on / off.
export const gcTestModeKey = "Fluid.GarbageCollection.GCTestMode";
// Feature gate key to write GC data at the root of the summary tree.
const writeAtRootKey = "Fluid.GarbageCollection.WriteDataAtRoot";
// Feature gate key to expire a session after a set period of time.
export const runSessionExpiryKey = "Fluid.GarbageCollection.RunSessionExpiry";
// Feature gate key to disable expiring session after a set period of time, even if expiry value is present
export const disableSessionExpiryKey = "Fluid.GarbageCollection.DisableSessionExpiry";
// Feature gate key to write the gc blob as a handle if the data is the same.
export const trackGCStateKey = "Fluid.GarbageCollection.TrackGCState";
// Feature gate key to turn GC sweep log off.
const disableSweepLogKey = "Fluid.GarbageCollection.DisableSweepLog";

// One day in milliseconds.
export const oneDayMs = 1 * 24 * 60 * 60 * 1000;

export const defaultInactiveTimeoutMs = 7 * oneDayMs; // 7 days
export const defaultSessionExpiryDurationMs = 30 * oneDayMs; // 30 days

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
    // Nodes that are within a data store. For example, DDS nodes.
    SubDataStore: "SubDataStore",
    // Nodes that are for attachment blobs, i.e., blobs uploaded via BlobManager.
    Blob: "Blob",
    // Nodes that are neither of the above. For example, root node.
    Other: "Other",
};
export type GCNodeType = typeof GCNodeType[keyof typeof GCNodeType];

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
    /** Tells whether the GC state in summary needs to be reset in the next summary. */
    readonly summaryStateNeedsReset: boolean;
    /** Tells whether GC data should be written to the root of the summary tree. */
    readonly writeDataAtRoot: boolean;
    readonly trackGCState: boolean;
    /** Run garbage collection and update the reference / used state of the system. */
    collectGarbage(
        options: { logger?: ITelemetryLogger; runSweep?: boolean; fullGC?: boolean; },
    ): Promise<IGCStats>;
    /** Summarizes the GC data and returns it as a summary tree. */
    summarize(
        fullTree: boolean,
        trackState: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummarizeResult | undefined;
    /** Returns the garbage collector specific metadata to be written into the summary. */
    getMetadata(): IGCMetadata;
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

/** Parameters necessary for creating a GarbageCollector. */
export interface IGarbageCollectorCreateParams {
    readonly runtime: IGarbageCollectionRuntime;
    readonly gcOptions: IGCRuntimeOptions;
    readonly baseLogger: ITelemetryLogger;
    readonly existing: boolean;
    readonly metadata: IContainerRuntimeMetadata | undefined;
    readonly baseSnapshot: ISnapshotTree | undefined;
    readonly isSummarizerClient: boolean;
    readonly getNodePackagePath: (nodePath: string) => Promise<readonly string[] | undefined>;
    readonly getLastSummaryTimestampMs: () => number | undefined;
    readonly readAndParseBlob: ReadAndParseBlob;
    readonly snapshotCacheExpiryMs?: number;
}

/** The state of node that is unreferenced. */
export const UnreferencedState = {
    /** The node is active, i.e., it can become referenced again. */
    Active: "Active",
    /** The node is inactive, i.e., it should not become referenced. */
    Inactive: "Inactive",
    /** The node is ready to be deleted by the sweep phase. */
    SweepReady: "SweepReady",
} as const;
export type UnreferencedState = typeof UnreferencedState[keyof typeof UnreferencedState];

/** The event that is logged when unreferenced node is used after a certain time. */
interface IUnreferencedEventProps {
    usageType: "Changed" | "Loaded" | "Revived";
    state: UnreferencedState;
    id: string;
    type: GCNodeType;
    unrefTime: number;
    age: number;
    completedGCRuns: number;
    fromId?: string;
    timeout?: number;
    lastSummaryTime?: number;
    externalRequest?: boolean;
    viaHandle?: boolean;
}

/**
 * Helper class that tracks the state of an unreferenced node such as the time it was unreferenced and if it can
 * be deleted by the sweep phase.
 */
export class UnreferencedStateTracker {
    private _state: UnreferencedState = UnreferencedState.Active;
    public get state(): UnreferencedState {
        return this._state;
    }

    /** Timer to indicate when an unreferenced object is considered Inactive */
    private readonly inactiveTimer: TimerWithNoDefaultTimeout;
    /** Timer to indicate when an unreferenced object is Sweep-Ready */
    private readonly sweepTimer: TimerWithNoDefaultTimeout;

    constructor(
        public readonly unreferencedTimestampMs: number,
        /** The time after which node transitions to Inactive state. */
        private readonly inactiveTimeoutMs: number,
        /** The time after which node transitions to SweepReady state; undefined if session expiry is disabled. */
        private readonly sweepTimeoutMs?: number,
        /** The current reference timestamp; undefined if no ops have ever been processed which can happen in tests. */
        currentReferenceTimestampMs?: number,
    ) {
        if (this.sweepTimeoutMs !== undefined) {
            assert(this.inactiveTimeoutMs <= this.sweepTimeoutMs,
                "inactive timeout must not be greater than the sweep timeout");
        }

        this.sweepTimer = new TimerWithNoDefaultTimeout(
            () => {
                this._state = UnreferencedState.SweepReady;
                assert(!this.inactiveTimer.hasTimer, "inactiveTimer still running after sweepTimer fired!");
            },
        );

        this.inactiveTimer = new TimerWithNoDefaultTimeout(() => {
            this._state = UnreferencedState.Inactive;

            // After the node becomes inactive, start the sweep timer after which the node will be ready for sweep.
            if (this.sweepTimeoutMs !== undefined) {
                this.sweepTimer.restart(this.sweepTimeoutMs - this.inactiveTimeoutMs);
            }
        });

        // If there is no current reference timestamp, can't track the node's unreferenced state at this time.
        // This will happen later when updateTracking is called with a reference timestamp.
        if (currentReferenceTimestampMs !== undefined) {
            this.updateTracking(currentReferenceTimestampMs);
        }
    }

    /* Updates the unreferenced state based on the provided timestamp. */
    public updateTracking(currentReferenceTimestampMs: number) {
        const unreferencedDurationMs = currentReferenceTimestampMs - this.unreferencedTimestampMs;

        // If the node has been unreferenced for sweep timeout amount of time, update the state to SweepReady.
        if (this.sweepTimeoutMs !== undefined && unreferencedDurationMs >= this.sweepTimeoutMs) {
            this._state = UnreferencedState.SweepReady;
            this.clearTimers();
            return;
        }

        // If the node has been unreferenced for inactive timeoutMs amount of time, update the state to inactive.
        // Also, start a timer for the sweep timeout.
        if (unreferencedDurationMs >= this.inactiveTimeoutMs) {
            this._state = UnreferencedState.Inactive;
            this.inactiveTimer.clear();

            if (this.sweepTimeoutMs !== undefined) {
                this.sweepTimer.restart(this.sweepTimeoutMs - unreferencedDurationMs);
            }
            return;
        }

        // The node is still active. Ensure the inactive timer is running with the proper remaining duration.
        this.inactiveTimer.restart(this.inactiveTimeoutMs - unreferencedDurationMs);
    }

    private clearTimers() {
        this.inactiveTimer.clear();
        this.sweepTimer.clear();
    }

    /** Stop tracking this node. Reset the unreferenced timers and state, if any. */
    public stopTracking() {
        this.clearTimers();
        this._state = UnreferencedState.Active;
    }
}

/**
 * The garbage collector for the container runtime. It consolidates the garbage collection functionality and maintains
 * its state across summaries.
 *
 * Node - represented as nodeId, it's a node on the GC graph
 * Outbound Route - a path from one node to another node, think `nodeA` -\> `nodeB`
 * Graph - all nodes with their respective routes
 *             GC Graph
 *
 *               Node
 *        NodeId = "datastore1"
 *           /             \\
 *    OutboundRoute   OutboundRoute
 *         /                 \\
 *       Node               Node
 *  NodeId = "dds1"     NodeId = "dds2"
 */
export class GarbageCollector implements IGarbageCollector {
    public static create(createParams: IGarbageCollectorCreateParams): IGarbageCollector {
        return new GarbageCollector(createParams);
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
    /**
     * Tracks if sweep phase is enabled for this document. This is specified during document creation and doesn't change
     * throughout its lifetime.
     */
    private readonly sweepEnabled: boolean;

    /**
     * Tracks if GC should run or not. Even if GC is enabled for a document (see gcEnabled), it can be explicitly
     * disabled via runtime options or feature flags.
     */
    public readonly shouldRunGC: boolean;
    /**
     * Tracks if sweep phase should run or not. Even if the sweep phase is enabled for a document (see sweepEnabled), it
     * can be explicitly disabled via feature flags. It also won't run if session expiry is not enabled.
     */
    private readonly shouldRunSweep: boolean;

    public readonly trackGCState: boolean;

    private readonly testMode: boolean;
    private readonly mc: MonitoringContext;

    /**
     * Tells whether the GC data should be written to the root of the summary tree.
     */
    private _writeDataAtRoot: boolean = true;
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
    /**
     * Keeps track of the serialized GC blob from the latest summary successfully submitted to the server.
     */
    private latestSerializedSummaryState: string | undefined;
    /**
     * Keeps track of the serialized GC blob from the last GC run of the client.
     */
    private pendingSerializedSummaryState: string | undefined;
    // Keeps a list of references (edges in the GC graph) between GC runs. Each entry has a node id and a list of
    // outbound routes from that node.
    private readonly newReferencesSinceLastRun: Map<string, string[]> = new Map();

    // Promise when resolved initializes the base state of the nodes from the base summary state.
    private readonly initializeBaseStateP: Promise<void>;
    // The map of data store ids to their GC details in the base summary returned in getDataStoreGCDetails().
    private readonly baseGCDetailsP: Promise<Map<string, IGarbageCollectionDetailsBase>>;
    // Map of node ids to their unreferenced state tracker.
    private readonly unreferencedNodesState: Map<string, UnreferencedStateTracker> = new Map();
    // The Timer responsible for closing the container when the session has expired
    private sessionExpiryTimer: Timer | undefined;

    // Keeps track of unreferenced events that are logged for a node. This is used to limit the log generation to one
    // per event per node.
    private readonly loggedUnreferencedEvents: Set<string> = new Set();
    // Queue for unreferenced events that should be logged the next time GC runs.
    private pendingEventsQueue: IUnreferencedEventProps[] = [];

    // The number of times GC has successfully completed on this instance of GarbageCollector.
    private completedRuns = 0;

    private readonly runtime: IGarbageCollectionRuntime;
    private readonly gcOptions: IGCRuntimeOptions;
    private readonly isSummarizerClient: boolean;

    /** The time in ms to expire a session for a client for gc. */
    private readonly sessionExpiryTimeoutMs: number | undefined;
    /** The time after which an unreferenced node is inactive. */
    private readonly inactiveTimeoutMs: number;
    /** The time after which an unreferenced node is ready to be swept. */
    private readonly sweepTimeoutMs: number | undefined;

    /** For a given node path, returns the node's package path. */
    private readonly getNodePackagePath: (nodePath: string) => Promise<readonly string[] | undefined>;
    /** Returns the timestamp of the last summary generated for this container. */
    private readonly getLastSummaryTimestampMs: () => number | undefined;

    protected constructor(createParams: IGarbageCollectorCreateParams) {
        this.runtime = createParams.runtime;
        this.isSummarizerClient = createParams.isSummarizerClient;
        this.gcOptions = createParams.gcOptions;
        this.getNodePackagePath = createParams.getNodePackagePath;
        this.getLastSummaryTimestampMs = createParams.getLastSummaryTimestampMs;

        const baseSnapshot = createParams.baseSnapshot;
        const metadata = createParams.metadata;
        const readAndParseBlob = createParams.readAndParseBlob;

        this.mc = loggerToMonitoringContext(ChildLogger.create(
            createParams.baseLogger, "GarbageCollector", { all: { completedGCRuns: () => this.completedRuns } },
        ));

        let prevSummaryGCVersion: number | undefined;

        /**
         * The following GC state is enabled during container creation and cannot be changed throughout its lifetime:
         * 1. Whether running GC mark phase is allowed or not.
         * 2. Whether running GC sweep phase is allowed or not.
         * 3. Whether GC session expiry is enabled or not.
         * For existing containers, we get this information from the metadata blob of its summary.
         */
        if (createParams.existing) {
            prevSummaryGCVersion = getGCVersion(metadata);
            // Existing documents which did not have metadata blob or had GC disabled have version as 0. For all
            // other existing documents, GC is enabled.
            this.gcEnabled = prevSummaryGCVersion > 0;
            this.sweepEnabled = metadata?.sweepEnabled ?? false;
            this.sessionExpiryTimeoutMs = metadata?.sessionExpiryTimeoutMs;
        } else {
            // Sweep should not be enabled without enabling GC mark phase. We could silently disable sweep in this
            // scenario but explicitly failing makes it clearer and promotes correct usage.
            if (this.gcOptions.sweepAllowed && this.gcOptions.gcAllowed === false) {
                throw new UsageError("GC sweep phase cannot be enabled without enabling GC mark phase");
            }

            // For new documents, GC is enabled by default. It can be explicitly disabled by setting the gcAllowed
            // flag in GC options to false.
            this.gcEnabled = this.gcOptions.gcAllowed !== false;
            // The sweep phase has to be explicitly enabled by setting the sweepAllowed flag in GC options to true.
            this.sweepEnabled = this.gcOptions.sweepAllowed === true;

            // Set the Session Expiry only if the flag is enabled and GC is enabled.
            if (this.mc.config.getBoolean(runSessionExpiryKey) && this.gcEnabled) {
                this.sessionExpiryTimeoutMs = this.gcOptions.sessionExpiryTimeoutMs ?? defaultSessionExpiryDurationMs;
            }
        }

        // If session expiry is enabled, we need to close the container when the session expiry timeout expires.
        if (this.sessionExpiryTimeoutMs !== undefined && this.mc.config.getBoolean(disableSessionExpiryKey) !== true) {
            // If Test Override config is set, override Session Expiry timeout.
            const overrideSessionExpiryTimeoutMs =
                this.mc.config.getNumber("Fluid.GarbageCollection.TestOverride.SessionExpiryMs");
            const timeoutMs = overrideSessionExpiryTimeoutMs ?? this.sessionExpiryTimeoutMs;

            this.sessionExpiryTimer = new Timer(
                timeoutMs,
                () => { this.runtime.closeFn(new ClientSessionExpiredError(`Client session expired.`, timeoutMs)); },
            );
            this.sessionExpiryTimer.start();

            // TEMPORARY: Hardcode a default of 2 days which is the value used in the ODSP driver.
            // This unblocks the Sweep Log (see logSweepEvents function).
            // This will be removed before sweep is fully implemented.
            const snapshotCacheExpiryMs = createParams.snapshotCacheExpiryMs ?? 2 * 24 * 60 * 60 * 1000;

            /**
             * Sweep timeout is the time after which unreferenced content can be swept.
             * Sweep timeout = session expiry timeout + snapshot cache expiry timeout + one day buffer. The buffer is
             * added to account for any clock skew. We use server timestamps throughout so the skew should be minimal
             * but make it one day to be safe.
             */
            if (snapshotCacheExpiryMs !== undefined) {
                this.sweepTimeoutMs = this.sessionExpiryTimeoutMs + snapshotCacheExpiryMs + oneDayMs;
            }
        }

        // For existing document, the latest summary is the one that we loaded from. So, use its GC version as the
        // latest tracked GC version. For new documents, we will be writing the first summary with the current version.
        this.latestSummaryGCVersion = prevSummaryGCVersion ?? this.currentGCVersion;

        /**
         * Whether GC should run or not. The following conditions have to be met to run sweep:
         * 1. GC should be enabled for this container.
         * 2. GC should not be disabled via disableGC GC option.
         * These conditions can be overridden via runGCKey feature flag.
         */
        this.shouldRunGC = this.mc.config.getBoolean(runGCKey) ?? (
            // GC must be enabled for the document.
            this.gcEnabled
            // GC must not be disabled via GC options.
            && !this.gcOptions.disableGC
        );

        /**
         * Whether sweep should run or not. The following conditions have to be met to run sweep:
         * 1. Overall GC or mark phase must be enabled (this.shouldRunGC).
         * 2. Sweep timeout should be available. Without this, we wouldn't know when an object should be deleted.
         * 3. Sweep should be enabled for this container (this.sweepEnabled). This can be overridden via runSweep
         *    feature flag.
         */
        this.shouldRunSweep = false; // disable while TEMPORARY measure hardcoding snapshotCacheExpiryMs is here
            // this.shouldRunGC
            // && this.sweepTimeoutMs !== undefined
            // && (this.mc.config.getBoolean(runSweepKey) ?? this.sweepEnabled);

        this.trackGCState = this.mc.config.getBoolean(trackGCStateKey) === true;

        // Override inactive timeout if test config or gc options to override it is set.
        this.inactiveTimeoutMs = this.mc.config.getNumber("Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs") ??
            this.gcOptions.inactiveTimeoutMs ??
            defaultInactiveTimeoutMs;

        // Inactive timeout must be greater than sweep timeout since a node goes from active -> inactive -> sweep ready.
        if (this.sweepTimeoutMs !== undefined && this.inactiveTimeoutMs > this.sweepTimeoutMs) {
            throw new UsageError("inactive timeout should not be greater than the sweep timeout");
        }

        // Whether we are running in test mode. In this mode, unreferenced nodes are immediately deleted.
        this.testMode = this.mc.config.getBoolean(gcTestModeKey) ?? this.gcOptions.runGCInTestMode === true;

        // GC state is written into root of the summary tree by default. Can be overridden via feature flag for now.
        this._writeDataAtRoot = this.mc.config.getBoolean(writeAtRootKey) ?? true;

        if (this._writeDataAtRoot) {
            // The GC state needs to be reset if the base snapshot contains GC tree and GC is disabled or it doesn't
            // contain GC tree and GC is enabled.
            const gcTreePresent = baseSnapshot?.trees[gcTreeKey] !== undefined;
            this.initialStateNeedsReset = gcTreePresent !== this.shouldRunGC;
        }

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
                const baseGCState = await getGCStateFromSnapshot(
                    gcSnapshotTree,
                    readAndParseBlob,
                );
                if (this.trackGCState) {
                    this.latestSerializedSummaryState = JSON.stringify(generateSortedGCState(baseGCState));
                }
                return baseGCState;
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
                    0x2a9 /* GC nodes for data store not in GC blob */);
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

            const gcNodes: { [id: string]: string[]; } = {};
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                if (nodeData.unreferencedTimestampMs !== undefined) {
                    this.unreferencedNodesState.set(
                        nodeId,
                        new UnreferencedStateTracker(
                            nodeData.unreferencedTimestampMs,
                            this.inactiveTimeoutMs,
                            this.sweepTimeoutMs,
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

            const gcNodes: { [id: string]: string[]; } = {};
            for (const [nodeId, nodeData] of Object.entries(baseState.gcNodes)) {
                gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
            }
            // Run GC on the nodes in the base summary to get the routes used in each node in the container.
            // This is an optimization for space (vs performance) wherein we don't need to store the used routes of
            // each node in the summary.
            const usedRoutes = runGarbageCollection(gcNodes, ["/"]).referencedNodeIds;

            const baseGCDetailsMap = unpackChildNodesGCDetails({ gcData: { gcNodes }, usedRoutes });
            // Currently, the nodes may write the GC data. So, we need to update its base GC details with the
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

        // Log all the GC options and the state determined by the garbage collector. This is interesting only for the
        // summarizer client since it is the only one that runs GC. It also helps keep the telemetry less noisy.
        const gcConfigProps = JSON.stringify({
            gcEnabled: this.gcEnabled,
            sweepEnabled: this.sweepEnabled,
            runGC: this.shouldRunGC,
            runSweep: this.shouldRunSweep,
            writeAtRoot: this._writeDataAtRoot,
            testMode: this.testMode,
            sessionExpiry: this.sessionExpiryTimeoutMs,
            inactiveTimeout: this.inactiveTimeoutMs,
            existing: createParams.existing,
            trackGCState: this.trackGCState,
            ...this.gcOptions,
        });
        if (this.isSummarizerClient) {
            this.mc.logger.sendTelemetryEvent({
                eventName: "GarbageCollectorLoaded",
                gcConfigs: gcConfigProps,
            });
        }

        // Initialize the base state that is used to detect when inactive objects are used.
        if (this.shouldRunGC) {
            this.initializeBaseStateP.catch((error) => {
                const dpe = DataProcessingError.wrapIfUnrecognized(
                    error,
                    "FailedToInitializeGC",
                );
                dpe.addTelemetryProperties({ gcConfigs: gcConfigProps });
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
            logger?: ITelemetryLogger;
            /** True to run GC sweep phase after the mark phase */
            runSweep?: boolean;
            /** True to generate full GC data */
            fullGC?: boolean;
        },
    ): Promise<IGCStats> {
        const {
            fullGC = this.gcOptions.runFullGC === true || this.summaryStateNeedsReset,
        } = options;

        const logger = options.logger
            ? ChildLogger.create(options.logger, undefined, { all: { completedGCRuns: () => this.completedRuns } })
            : this.mc.logger;

        return PerformanceEvent.timedExecAsync(logger, { eventName: "GarbageCollection" }, async (event) => {
            await this.runPreGCSteps();

            // Get the runtime's GC data and run GC on the reference graph in it.
            const gcData = await this.runtime.getGCData(fullGC);
            const gcResult = runGarbageCollection(gcData.gcNodes, ["/"]);

            const gcStats = await this.runPostGCSteps(gcData, gcResult, logger);
            event.end({ ...gcStats });
            this.completedRuns++;
            return gcStats;
        }, { end: true, cancel: "error" });
    }

    private async runPreGCSteps() {
        // Ensure that base state has been initialized.
        await this.initializeBaseStateP;
        // Let the runtime update its pending state before GC runs.
        await this.runtime.updateStateBeforeGC();
    }

    private async runPostGCSteps(gcData: IGarbageCollectionData, gcResult: IGCResult, logger: ITelemetryLogger) {
        // Generate statistics from the current run. This is done before updating the current state because it
        // generates some of its data based on previous state of the system.
        const gcStats = this.generateStats(gcResult);

        // Update the state since the last GC run. There can be nodes that were referenced between the last and
        // the current run. We need to identify than and update their unreferenced state if needed.
        this.updateStateSinceLastRun(gcData, logger);

        // Update the current state and update the runtime of all routes or ids that used as per the GC run.
        const currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs();
        this.updateCurrentState(gcData, gcResult, currentReferenceTimestampMs);
        this.runtime.updateUsedRoutes(gcResult.referencedNodeIds, currentReferenceTimestampMs);

        // Log events for objects that are ready to be deleted by sweep. When we have sweep enabled, we will
        // delete these objects here instead.
        this.logSweepEvents(logger, currentReferenceTimestampMs);

        // If we are running in GC test mode, delete objects for unused routes. This enables testing scenarios
        // involving access to deleted data.
        if (this.testMode) {
            this.runtime.deleteUnusedRoutes(gcResult.deletedNodeIds);
        }

        // Log pending unreferenced events such as a node being used after inactive. This is done after GC runs and
        // updates its state so that we don't send false positives based on intermediate state. For example, we may get
        // reference to an unreferenced node from another unreferenced node which means the node wasn't revived.
        await this.logUnreferencedEvents(logger);

        return gcStats;
    }

    /**
     * Summarizes the GC data and returns it as a summary tree.
     * We current write the entire GC state in a single blob. This can be modified later to write multiple
     * blobs. All the blob keys should start with `gcBlobPrefix`.
     */
    public summarize(
        fullTree: boolean,
        trackState: boolean,
        telemetryContext?: ITelemetryContext,
    ): ISummarizeResult | undefined {
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

        const newSerializedSummaryState = JSON.stringify(generateSortedGCState(gcState));

        /**
         * As an optimization if the GC tree hasn't changed and we're tracking the gc state, return a tree handle
         * instead of returning the whole GC tree. If there are changes, then we want to return the whole tree.
         */
        if (this.trackGCState) {
            this.pendingSerializedSummaryState = newSerializedSummaryState;
            if (
                this.latestSerializedSummaryState !== undefined &&
                this.latestSerializedSummaryState === newSerializedSummaryState &&
                !fullTree &&
                trackState
            ) {
                const stats = mergeStats();
                stats.handleNodeCount++;
                return {
                    summary: {
                        type: SummaryType.Handle,
                        handle: `/${gcTreeKey}`,
                        handleType: SummaryType.Tree,
                    },
                    stats,
                };
            }
        }

        const builder = new SummaryTreeBuilder();
        builder.addBlob(`${gcBlobPrefix}_root`, newSerializedSummaryState);
        return builder.getSummaryTree();
    }

    public getMetadata(): IGCMetadata {
        return {
            /**
             * If GC is enabled, the GC data is written using the current GC version and that is the gcFeature that goes
             * into the metadata blob. If GC is disabled, the gcFeature is 0.
             */
            gcFeature: this.gcEnabled ? this.currentGCVersion : 0,
            sessionExpiryTimeoutMs: this.sessionExpiryTimeoutMs,
            sweepEnabled: this.sweepEnabled,
        };
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
        if (!this.shouldRunGC || !result.latestSummaryUpdated) {
            return;
        }

        // If the summary was tracked by this client, it was the one that generated the summary in the first place.
        // Basically, it was written in the current GC version.
        if (result.wasSummaryTracked) {
            this.latestSummaryGCVersion = this.currentGCVersion;
            this.initialStateNeedsReset = false;
            if (this.trackGCState) {
                this.latestSerializedSummaryState = this.pendingSerializedSummaryState;
                this.pendingSerializedSummaryState = undefined;
            }
            return;
        }
        // If the summary was not tracked by this client, update latest GC version and blob from the snapshot in the
        // result as that is now the latest summary.
        const snapshot = result.snapshot;
        const metadataBlobId = snapshot.blobs[metadataBlobName];
        if (metadataBlobId) {
            const metadata = await readAndParseBlob<IContainerRuntimeMetadata>(metadataBlobId);
            this.latestSummaryGCVersion = getGCVersion(metadata);
        }

        const gcSnapshotTree = snapshot.trees[gcTreeKey];
        if (gcSnapshotTree !== undefined && this.trackGCState) {
            const latestGCState = await getGCStateFromSnapshot(
                gcSnapshotTree,
                readAndParseBlob,
            );
            this.latestSerializedSummaryState = JSON.stringify(generateSortedGCState(latestGCState));
        } else {
            this.latestSerializedSummaryState = undefined;
        }
        this.pendingSerializedSummaryState = undefined;
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

        const nodeStateTracker = this.unreferencedNodesState.get(nodePath);
        if (nodeStateTracker && nodeStateTracker.state !== UnreferencedState.Active) {
            this.inactiveNodeUsed(
                reason,
                nodePath,
                nodeStateTracker,
                undefined /* fromNodeId */,
                packagePath,
                timestampMs,
                requestHeaders,
            );
        }
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

        const nodeStateTracker = this.unreferencedNodesState.get(toNodePath);
        if (nodeStateTracker && nodeStateTracker.state !== UnreferencedState.Active) {
            this.inactiveNodeUsed("Revived", toNodePath, nodeStateTracker, fromNodePath);
        }
    }

    public dispose(): void {
        this.sessionExpiryTimer?.clear();
        this.sessionExpiryTimer = undefined;
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
                        this.inactiveTimeoutMs,
                        this.sweepTimeoutMs,
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
    private updateStateSinceLastRun(currentGCData: IGarbageCollectionData, logger: ITelemetryLogger) {
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

        if (this.writeDataAtRoot && missingExplicitReferences.length > 0) {
            missingExplicitReferences.forEach((missingExplicitReference) => {
                const event: ITelemetryPerformanceEvent = {
                    eventName: "gcUnknownOutboundReferences",
                    gcNodeId: missingExplicitReference[0],
                    gcRoutes: JSON.stringify(missingExplicitReference[1]),
                };
                logger.sendPerformanceEvent(event);
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
         * 3. We need data from the current run because currently we may not detect when DDSes are referenced:
         *    - We don't require DDSes handles to be stored in a referenced DDS. For this, we need GC at DDS level
         *      which is tracked by https://github.com/microsoft/FluidFramework/issues/8470.
         *    - A new data store may have "root" DDSes already created and we don't detect them today.
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
        const gcResult = runGarbageCollection(gcDataSuperSet.gcNodes, ["/"]);
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
     * Generates the stats of a garbage collection run from the given results of the run.
     * @param gcResult - The result of a GC run.
     * @returns the GC stats of the GC run.
     */
    private generateStats(gcResult: IGCResult): IGCStats {
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
            // If there is no previous GC data, every node's state is generated and is considered as updated.
            // Otherwise, find out if any node went from referenced to unreferenced or vice-versa.
            const stateUpdated = this.previousGCDataFromLastRun === undefined ||
                this.unreferencedNodesState.has(nodeId) === referenced;
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
     * For nodes that are ready to sweep, log an event for now. Until we start running sweep which deletes objects,
     * this will give us a view into how much deleted content a container has.
     */
    private logSweepEvents(logger: ITelemetryLogger, currentReferenceTimestampMs?: number) {
        if (this.mc.config.getBoolean(disableSweepLogKey) === true
            || currentReferenceTimestampMs === undefined
            || this.sweepTimeoutMs === undefined) {
            return;
        }

        this.unreferencedNodesState.forEach((nodeStateTracker, nodeId) => {
            if (nodeStateTracker.state !== UnreferencedState.SweepReady) {
                return;
            }

            const nodeType = this.runtime.getNodeType(nodeId);
            if (nodeType !== GCNodeType.DataStore && nodeType !== GCNodeType.Blob) {
                return;
            }

            // Log deleted event for each node only once to reduce noise in telemetry.
            const uniqueEventId = `Deleted-${nodeId}`;
            if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
                return;
            }
            this.loggedUnreferencedEvents.add(uniqueEventId);
            logger.sendTelemetryEvent({
                eventName: "GCObjectDeleted",
                id: nodeId,
                type: nodeType,
                age: currentReferenceTimestampMs - nodeStateTracker.unreferencedTimestampMs,
                timeout: this.sweepTimeoutMs,
                completedGCRuns: this.completedRuns,
                lastSummaryTime: this.getLastSummaryTimestampMs(),
            });
        });
    }

    /**
     * Called when an inactive node is used after. Queue up an event that will be logged next time GC runs.
     */
    private inactiveNodeUsed(
        usageType: "Changed" | "Loaded" | "Revived",
        nodeId: string,
        nodeStateTracker: UnreferencedStateTracker,
        fromNodeId?: string,
        packagePath?: readonly string[],
        currentReferenceTimestampMs = this.runtime.getCurrentReferenceTimestampMs(),
        requestHeaders?: IRequestHeader,
    ) {
        // If there is no reference timestamp to work with, no ops have been processed after creation. If so, skip
        // logging as nothing interesting would have happened worth logging.
        // If the node is active, skip logging.
        if (currentReferenceTimestampMs === undefined || nodeStateTracker.state === UnreferencedState.Active) {
            return;
        }

        // For non-summarizer clients, only log "Loaded" type events since these objects may not be loaded in the
        // summarizer clients if they are based off of user actions (such as scrolling to content for these objects).
        if (!this.isSummarizerClient && usageType !== "Loaded") {
            return;
        }

        // We only care about data stores and attachment blobs for this telemetry since GC only marks these objects
        // as unreferenced. Also, if an inactive DDS is used, the corresponding data store store will also be used.
        const nodeType = this.runtime.getNodeType(nodeId);
        if (nodeType !== GCNodeType.DataStore && nodeType !== GCNodeType.Blob) {
            return;
        }

        const state = nodeStateTracker.state;
        const uniqueEventId = `${state}-${nodeId}-${usageType}`;
        if (this.loggedUnreferencedEvents.has(uniqueEventId)) {
            return;
        }
        this.loggedUnreferencedEvents.add(uniqueEventId);

        const propsToLog = {
            id: nodeId,
            type: nodeType,
            unrefTime: nodeStateTracker.unreferencedTimestampMs,
            age: currentReferenceTimestampMs - nodeStateTracker.unreferencedTimestampMs,
            timeout: nodeStateTracker.state === UnreferencedState.Inactive
                ? this.inactiveTimeoutMs
                : this.sweepTimeoutMs,
            completedGCRuns: this.completedRuns,
            lastSummaryTime: this.getLastSummaryTimestampMs(),
            externalRequest: requestHeaders?.[RuntimeHeaders.externalRequest],
            viaHandle: requestHeaders?.[RuntimeHeaders.viaHandle],
            fromId: fromNodeId,
        };

        // For summarizer client, queue the event so it is logged the next time GC runs if the event is still valid.
        // For non-summarizer client, log the event now since GC won't run on it. This may result in false positives
        // but it's a good signal nonetheless and we can consume it with a grain of salt.
        if (this.isSummarizerClient) {
            this.pendingEventsQueue.push({ ...propsToLog, usageType, state });
        } else {
            this.mc.logger.sendErrorEvent({
                ...propsToLog,
                eventName: `${state}Object_${usageType}`,
                pkg: packagePath ? { value: packagePath.join("/"), tag: TelemetryDataTag.CodeArtifact } : undefined,
            });
        }
    }

    private async logUnreferencedEvents(logger: ITelemetryLogger) {
        for (const eventProps of this.pendingEventsQueue) {
            const { usageType, state, ...propsToLog } = eventProps;
            /**
             * Revived event is logged only if the node is active. If the node is not active, the reference to it was
             * from another unreferenced node and this scenario is not interesting to log.
             * Loaded and Changed events are logged only if the node is not active. If the node is active, it was
             * revived and a Revived event will be logged for it.
             */
            const nodeStateTracker = this.unreferencedNodesState.get(eventProps.id);
            const active = nodeStateTracker === undefined || nodeStateTracker.state === UnreferencedState.Active;
            if ((usageType === "Revived") === active) {
                const pkg = await this.getNodePackagePath(eventProps.id);
                const fromPkg = eventProps.fromId ? await this.getNodePackagePath(eventProps.fromId) : undefined;
                logger.sendErrorEvent({
                    ...propsToLog,
                    eventName: `${state}Object_${usageType}`,
                    pkg: pkg ? { value: pkg.join("/"), tag: TelemetryDataTag.CodeArtifact } : undefined,
                    fromPkg: fromPkg ? { value: fromPkg.join("/"), tag: TelemetryDataTag.CodeArtifact } : undefined,
                });
            }
        }
        this.pendingEventsQueue = [];
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

function generateSortedGCState(gcState: IGarbageCollectionState): IGarbageCollectionState {
    const sortableArray: [string, IGarbageCollectionNodeData][] = Object.entries(gcState.gcNodes);
    sortableArray.sort(([a], [b]) => a.localeCompare(b));
    const sortedGCState: IGarbageCollectionState = { gcNodes: {} };
    for (const [nodeId, nodeData] of sortableArray) {
        nodeData.outboundRoutes.sort();
        sortedGCState.gcNodes[nodeId] = nodeData;
    }
    return sortedGCState;
}

/** A wrapper around common-utils Timer that requires the timeout when calling start/restart */
class TimerWithNoDefaultTimeout extends Timer {
    constructor(
        private readonly callback: () => void,
    ) {
        // The default timeout/handlers will never be used since start/restart pass overrides below
        super(0, () => { throw new Error("DefaultHandler should not be used"); });
    }

    start(timeoutMs: number) {
        super.start(timeoutMs, this.callback);
    }

    restart(timeoutMs: number): void {
        super.restart(timeoutMs, this.callback);
    }
}
