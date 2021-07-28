/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SummaryTree,
    ISummaryTree,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
} from "@fluidframework/protocol-definitions";
import { IGarbageCollectionData, IGarbageCollectionSummaryDetails } from "./garbageCollection";

export interface ISummaryStats {
    treeNodeCount: number;
    blobNodeCount: number;
    handleNodeCount: number;
    totalBlobSize: number;
    unreferencedBlobSize: number;
}

export interface ISummaryTreeWithStats {
    stats: ISummaryStats;
    summary: ISummaryTree;
}

export interface IChannelSummarizeResult extends ISummaryTreeWithStats {
    /** The channel's garbage collection data */
    gcData: IGarbageCollectionData;
}

export interface ISummarizeResult {
    stats: ISummaryStats;
    summary: SummaryTree;
}

export interface IContextSummarizeResult extends ISummarizeResult {
    /** The context's garbage collection data */
    gcData: IGarbageCollectionData;
}

export interface ISummarizeInternalResult extends IContextSummarizeResult {
    id: string;
    /** Additional path parts between this node's ID and its children's IDs. */
    pathPartsForChildren?: string[];
}

export type SummarizeInternalFn = (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>;

export interface ISummarizerNodeConfig {
    /**
     * True to reuse previous handle when unchanged since last acked summary.
     * Defaults to true.
     */
    readonly canReuseHandle?: boolean,
    /**
     * True to always stop execution on error during summarize, or false to
     * attempt creating a summary that is a pointer ot the last acked summary
     * plus outstanding ops in case of internal summarize failure.
     * Defaults to false.
     *
     * BUG BUG: Default to true while we investigate problem
     * with differential summaries
     */
    readonly throwOnFailure?: true,
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
     */
    summarize(fullTree: boolean): Promise<ISummarizeResult>;
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
    ): Promise<{ baseSummary: ISnapshotTree, outstandingOps: ISequencedDocumentMessage[] }>;
    /**
     * Records an op representing a change to this node/subtree.
     * @param op - op of change to record
     */
    recordChange(op: ISequencedDocumentMessage): void;

    createChild(
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean) => Promise<ISummarizeInternalResult>,
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

    getChild(id: string): ISummarizerNode | undefined
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
    /** The routes in this node that are currently in use. */
    readonly usedRoutes: string[];

    /** The garbage collection data of the node. */
    readonly gcData: IGarbageCollectionData | undefined;

    summarize(fullTree: boolean, trackState?: boolean): Promise<IContextSummarizeResult>;
    createChild(
        /** Summarize function */
        summarizeInternalFn: (fullTree: boolean, trackState: boolean) => Promise<ISummarizeInternalResult>,
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
     */
    updateUsedRoutes(usedRoutes: string[]): void;
}

export const channelsTreeName = ".channels";
