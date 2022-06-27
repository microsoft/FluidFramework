/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TelemetryEventPropertyType } from "@fluidframework/common-definitions";
import {
    SummaryTree,
    ISummaryTree,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
} from "@fluidframework/protocol-definitions";
import {
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
    IGarbageCollectionSummaryDetails,
} from "./garbageCollection";

/**
 * Contains the aggregation data from a Tree/Subtree.
 */
export interface ISummaryStats {
    treeNodeCount: number;
    blobNodeCount: number;
    handleNodeCount: number;
    totalBlobSize: number;
    unreferencedBlobSize: number;
}

/**
 * Represents the summary tree for a node along with the statistics for that tree.
 * For example, for a given data store, it contains the data for data store along with a subtree for
 * each of its DDS.
 * Any component that implements IChannelContext, IFluidDataStoreChannel or extends SharedObject
 * will be taking part of the summarization process.
 */
export interface ISummaryTreeWithStats {
    /** Represents an agreggation of node counts and blob sizes associated to the current summary information */
    stats: ISummaryStats;
    /**
     * A recursive data structure that will be converted to a snapshot tree and uploaded
     * to the backend.
     */
    summary: ISummaryTree;
}

/**
 * Represents a summary at a current sequence number.
 */
export interface ISummarizeResult {
    stats: ISummaryStats;
    summary: SummaryTree;
}

/**
 * Contains the same data as ISummaryResult but in order to avoid naming colisions,
 * the data store summaries are wrapped around an array of labels identified by pathPartsForChildren.
 * Ex: id:""
       pathPartsForChildren: ["path1"]
       stats: ...
       summary:
        ...
            "path1":
 */
export interface ISummarizeInternalResult extends ISummarizeResult {
    id: string;
    /** Additional path parts between this node's ID and its children's IDs. */
    pathPartsForChildren?: string[];
}

/** The garbage collection data of each node in the reference graph. */
export interface IGarbageCollectionNodeData {
    /** The set of routes to other nodes in the graph. */
    outboundRoutes: string[];
    /** If the node is unreferenced, the timestamp of when it was marked unreferenced. */
    unreferencedTimestampMs?: number;
}

/**
 * The garbage collection state of the reference graph. It contains a list of all the nodes in the graph and their
 * GC data.
 */
export interface IGarbageCollectionState {
    gcNodes: { [ id: string ]: IGarbageCollectionNodeData; };
}

export type SummarizeInternalFn = (
    fullTree: boolean,
    trackState: boolean,
    telemetryContext?: ITelemetryContext,
) => Promise<ISummarizeInternalResult>;

export interface ISummarizerNodeConfig {
    /**
     * True to reuse previous handle when unchanged since last acked summary.
     * Defaults to true.
     */
    readonly canReuseHandle?: boolean;
    /**
     * True to always stop execution on error during summarize, or false to
     * attempt creating a summary that is a pointer ot the last acked summary
     * plus outstanding ops in case of internal summarize failure.
     * Defaults to false.
     *
     * BUG BUG: Default to true while we investigate problem
     * with differential summaries
     */
    readonly throwOnFailure?: true;
}

export interface ISummarizerNodeConfigWithGC extends ISummarizerNodeConfig {
    /**
     * True if GC is disabled. If so, don't track GC related state for a summary.
     * This is propagated to all child nodes.
     */
    readonly gcDisabled?: boolean;
}

export enum CreateSummarizerNodeSource {
    FromSummary,
    FromAttach,
    Local,
}
export type CreateChildSummarizerNodeParam = {
    type: CreateSummarizerNodeSource.FromSummary;
} | {
    type: CreateSummarizerNodeSource.FromAttach;
    sequenceNumber: number;
    snapshot: ITree;
} | {
    type: CreateSummarizerNodeSource.Local;
};

export interface ISummarizerNode {
    /** Latest successfully acked summary reference sequence number */
    readonly referenceSequenceNumber: number;
    /**
     * Marks the node as having a change with the given sequence number.
     * @param sequenceNumber - sequence number of change
     */
    invalidate(sequenceNumber: number): void;
    /**
     * Calls the internal summarize function and handles internal state tracking.
     * If unchanged and fullTree is false, it will reuse previous summary subtree.
     * If an error is encountered and throwOnFailure is false, it will try to make
     * a summary with a pointer to the previous summary + a blob of outstanding ops.
     * @param fullTree - true to skip optimizations and always generate the full tree
     * @param trackState - indicates whether the summarizer node should track the state of the summary or not
     * @param telemetryContext - summary data passed through the layers for telemetry purposes
     */
    summarize(
        fullTree: boolean,
        trackState?: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummarizeResult>;
    /**
     * Checks if there are any additional path parts for children that need to
     * be loaded from the base summary. Additional path parts represent parts
     * of the path between this SummarizerNode and any child SummarizerNodes
     * that it might have. For example: if datastore "a" contains dds "b", but the
     * path is "/a/.channels/b", then the additional path part is ".channels".
     * @param snapshot - the base summary to parse
     */
    loadBaseSummaryWithoutDifferential(snapshot: ISnapshotTree): void;
    /**
     * Does all the work of loadBaseSummaryWithoutDifferential. Additionally if
     * the base summary is a differential summary containing handle + outstanding ops blob,
     * then this will return the innermost base summary, and update the state by
     * tracking the outstanding ops.
     * @param snapshot - the base summary to parse
     * @param readAndParseBlob - function to read and parse blobs from storage
     * @returns the base summary to be used
     */
    loadBaseSummary(
        snapshot: ISnapshotTree,
        readAndParseBlob: <T>(id: string) => Promise<T>,
    ): Promise<{ baseSummary: ISnapshotTree; outstandingOps: ISequencedDocumentMessage[]; }>;
    /**
     * Records an op representing a change to this node/subtree.
     * @param op - op of change to record
     */
    recordChange(op: ISequencedDocumentMessage): void;

    createChild(
        /** Summarize function */
        summarizeInternalFn: SummarizeInternalFn,
        /** Initial id or path part of this node */
        id: string,
        /**
         * Information needed to create the node.
         * If it is from a base summary, it will assert that a summary has been seen.
         * Attach information if it is created from an attach op.
         * If it is local, it will throw unsupported errors on calls to summarize.
         */
        createParam: CreateChildSummarizerNodeParam,
        /** Optional configuration affecting summarize behavior */
        config?: ISummarizerNodeConfig,
    ): ISummarizerNode;

    getChild(id: string): ISummarizerNode | undefined;
}

/**
 * Extends the functionality of ISummarizerNode to support garbage collection. It adds / udpates the following APIs:
 * - usedRoutes - The routes in this node that are currently in use.
 * - getGCData - A new API that can be used to get the garbage collection data for this node.
 * - summarize - Added a trackState flag which indicates whether the summarizer node should track the state of the
 *   summary or not.
 * - createChild - Added the following params:
 *   - getGCDataFn - This gets the GC data from the caller. This must be provided in order for getGCData to work.
 *   - getInitialGCDetailsFn - This gets the initial GC details from the caller.
 * - deleteChild - Deletes a child node.
 * - isReferenced - This tells whether this node is referenced in the document or not.
 * - updateUsedRoutes - Used to notify this node of routes that are currently in use in it.
 */
export interface ISummarizerNodeWithGC extends ISummarizerNode {
    createChild(
        /** Summarize function */
        summarizeInternalFn: SummarizeInternalFn,
        /** Initial id or path part of this node */
        id: string,
        /**
         * Information needed to create the node.
         * If it is from a base summary, it will assert that a summary has been seen.
         * Attach information if it is created from an attach op.
         * If it is local, it will throw unsupported errors on calls to summarize.
         */
        createParam: CreateChildSummarizerNodeParam,
        /** Optional configuration affecting summarize behavior */
        config?: ISummarizerNodeConfigWithGC,
        getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
        getInitialGCSummaryDetailsFn?: () => Promise<IGarbageCollectionSummaryDetails>,
    ): ISummarizerNodeWithGC;

    /**
     * Delete the child with the given id..
     */
    deleteChild(id: string): void;

    getChild(id: string): ISummarizerNodeWithGC | undefined;

    /**
     * Returns this node's data that is used for garbage collection. This includes a list of GC nodes that represent
     * this node. Each node has a set of outbound routes to other GC nodes in the document.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;

    /** Tells whether this node is being referenced in this document or not. Unreferenced node will get GC'd */
    isReferenced(): boolean;

    /**
     * After GC has run, called to notify this node of routes that are used in it. These are used for the following:
     * 1. To identify if this node is being referenced in the document or not.
     * 2. To identify if this node or any of its children's used routes changed since last summary.
     *
     * @param usedRoutes - The routes that are used in this node.
     * @param gcTimestamp - The time when GC was run that generated these used routes. If a node becomes unreferenced
     * as part of this GC run, this timestamp is used to update the time when it happens.
     */
    updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number): void;

    /**
     * @deprecated - Renamed to getBaseGCDetails.
     * Returns the GC details that may be added to this node's summary.
     */
    getGCSummaryDetails(): IGarbageCollectionSummaryDetails;

    /** Returns the GC details to be added to this node's summary and is used to initialize new nodes' GC state. */
    getBaseGCDetails?(): IGarbageCollectionDetailsBase;
}

export const channelsTreeName = ".channels";

/**
 * Contains telemetry data relevant to summarization workflows.
 * This object is expected to be modified directly by various summarize methods.
 */
export interface ITelemetryContext {
    /**
     * Sets value for telemetry data being tracked.
     * @param prefix - unique prefix to tag this data with (ex: "fluid:map:")
     * @param property - property name of the telemetry data being tracked (ex: "DirectoryCount")
     * @param value - value to attribute to this summary telemetry data
     */
    set(prefix: string, property: string, value: TelemetryEventPropertyType): void;

    /**
     * Get the telemetry data being tracked
     * @param prefix - unique prefix for this data (ex: "fluid:map:")
     * @param property - property name of the telemetry data being tracked (ex: "DirectoryCount")
     * @returns undefined if item not found
     */
    get(prefix: string, property: string): TelemetryEventPropertyType;

    /**
     * Returns a serialized version of all the telemetry data.
     * Should be used when logging in telemetry events.
     */
    serialize(): string;
}

export const blobCountPropertyName = "BlobCount";

export const totalBlobSizePropertyName = "TotalBlobSize";
