/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IRequestHeader } from "@fluidframework/core-interfaces";
import { concatGarbageCollectionStates } from "@fluidframework/garbage-collector";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    IGarbageCollectionData,
    IGarbageCollectionState,
    IGarbageCollectionDetailsBase,
    ISummarizeResult,
    ITelemetryContext,
    IGarbageCollectionNodeData,
} from "@fluidframework/runtime-definitions";
import { ReadAndParseBlob, RefreshSummaryResult } from "@fluidframework/runtime-utils";

import { IGCRuntimeOptions } from "../containerRuntime";
import { IContainerRuntimeMetadata, IGCMetadata } from "../summaryFormat";

/** This is the current version of garbage collection. */
export const latestGCVersion = 1;

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
export const writeAtRootKey = "Fluid.GarbageCollection.WriteDataAtRoot";
// Feature gate key to expire a session after a set period of time.
export const runSessionExpiryKey = "Fluid.GarbageCollection.RunSessionExpiry";
// Feature gate key to disable expiring session after a set period of time, even if expiry value is present.
export const disableSessionExpiryKey = "Fluid.GarbageCollection.DisableSessionExpiry";
// Feature gate key to write the gc blob as a handle if the data is the same.
export const trackGCStateKey = "Fluid.GarbageCollection.TrackGCState";
// Feature gate key to turn GC sweep log off.
export const disableSweepLogKey = "Fluid.GarbageCollection.DisableSweepLog";

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
    closeFn: (error?: ICriticalContainerError) => void;
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
    ): Promise<IGCStats | undefined>;
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
    setConnectionState(connected: boolean, clientId?: string): void;
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
    readonly activeConnection: () => boolean;
    readonly getContainerDiagnosticId: () => string;
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
export interface IUnreferencedEventProps {
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
 * Gets the garbage collection state from the given snapshot tree. The GC state may be written into multiple blobs.
 * Merge the GC state from all such blobs and return the merged GC state.
 */
export async function getGCStateFromSnapshot(
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

export function generateSortedGCState(gcState: IGarbageCollectionState): IGarbageCollectionState {
    const sortableArray: [string, IGarbageCollectionNodeData][] = Object.entries(gcState.gcNodes);
    sortableArray.sort(([a], [b]) => a.localeCompare(b));
    const sortedGCState: IGarbageCollectionState = { gcNodes: {} };
    for (const [nodeId, nodeData] of sortableArray) {
        nodeData.outboundRoutes.sort();
        sortedGCState.gcNodes[nodeId] = nodeData;
    }
    return sortedGCState;
}
