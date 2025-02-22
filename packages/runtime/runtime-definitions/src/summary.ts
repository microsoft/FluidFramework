/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TelemetryBaseEventPropertyType } from "@fluidframework/core-interfaces";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	ISnapshotTree,
	ITree,
	SummaryTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import type { TelemetryEventPropertyTypeExt } from "@fluidframework/telemetry-utils/internal";

import type {
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "./garbageCollectionDefinitions.js";

/**
 * Contains the aggregation data from a Tree/Subtree.
 * @legacy
 * @alpha
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
 * @legacy
 * @alpha
 */
export interface ISummaryTreeWithStats {
	/**
	 * Represents an aggregation of node counts and blob sizes associated to the current summary information
	 */
	stats: ISummaryStats;
	/**
	 * A recursive data structure that will be converted to a snapshot tree and uploaded
	 * to the backend.
	 */
	summary: ISummaryTree;
}

/**
 * Represents a summary at a current sequence number.
 * @legacy
 * @alpha
 */
export interface ISummarizeResult {
	stats: ISummaryStats;
	summary: SummaryTree;
}

/**
 * Contains the same data as ISummaryResult but in order to avoid naming collisions,
 * the data store summaries are wrapped around an array of labels identified by pathPartsForChildren.
 *
 * @example
 *
 * ```typescript
 * id:""
 * pathPartsForChildren: ["path1"]
 * stats: ...
 * summary:
 *   ...
 *     "path1":
 * ```
 * @legacy
 * @alpha
 */
export interface ISummarizeInternalResult extends ISummarizeResult {
	id: string;
	/**
	 * Additional path parts between this node's ID and its children's IDs.
	 */
	pathPartsForChildren?: string[];
}

/**
 * @experimental - Can be deleted/changed at any time
 * Contains the necessary information to allow DDSes to do incremental summaries
 * @legacy
 * @alpha
 */
export interface IExperimentalIncrementalSummaryContext {
	/**
	 * The sequence number of the summary generated that will be sent to the server.
	 */
	readonly summarySequenceNumber: number;
	/**
	 * The sequence number of the most recent summary that was acknowledged by the server.
	 */
	readonly latestSummarySequenceNumber: number;
	/**
	 * The path to the runtime/datastore/dds that is used to generate summary handles
	 * Note: Summary handles are nodes of the summary tree that point to previous parts of the last successful summary
	 * instead of being a blob or tree node
	 *
	 * This path contains the id of the data store and dds which should not be leaked to layers below them. Ideally,
	 * a layer should not know its own id. This is important for channel unification work and there has been a lot of
	 * work to remove these kinds of leakages. Some still exist, which have to be fixed but we should not be adding
	 * more dependencies.
	 */
	// TODO: remove summaryPath
	readonly summaryPath: string;
}

/**
 * @legacy
 * @alpha
 */
export type SummarizeInternalFn = (
	fullTree: boolean,
	trackState: boolean,
	telemetryContext?: ITelemetryContext,
	incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
) => Promise<ISummarizeInternalResult>;

/**
 * @legacy
 * @alpha
 */
export interface ISummarizerNodeConfig {
	/**
	 * True to reuse previous handle when unchanged since last acked summary.
	 * Defaults to true.
	 */
	readonly canReuseHandle?: boolean;
}

/**
 * @legacy
 * @alpha
 */
export interface ISummarizerNodeConfigWithGC extends ISummarizerNodeConfig {
	/**
	 * True if GC is disabled. If so, don't track GC related state for a summary.
	 * This is propagated to all child nodes.
	 */
	readonly gcDisabled?: boolean;
}

/**
 * @legacy
 * @alpha
 */
export enum CreateSummarizerNodeSource {
	FromSummary,
	FromAttach,
	Local,
}
/**
 * @legacy
 * @alpha
 */
export type CreateChildSummarizerNodeParam =
	| {
			type: CreateSummarizerNodeSource.FromSummary;
	  }
	| {
			type: CreateSummarizerNodeSource.FromAttach;
			sequenceNumber: number;
			snapshot: ITree;
	  }
	| {
			type: CreateSummarizerNodeSource.Local;
	  };

/**
 * @legacy
 * @alpha
 */
export interface ISummarizerNode {
	/**
	 * Latest successfully acked summary reference sequence number
	 */
	readonly referenceSequenceNumber: number;
	/**
	 * Marks the node as having a change with the given sequence number.
	 * @param sequenceNumber - sequence number of change
	 */
	invalidate(sequenceNumber: number): void;
	/**
	 * Calls the internal summarize function and handles internal state tracking.
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
	 *
	 * @deprecated The code now always assumes that all summary nodes have .channels
	 * in their handle so there is no need to maintain any additional path information.
	 */
	updateBaseSummaryState(snapshot: ISnapshotTree): void;
	/**
	 * Records an op representing a change to this node/subtree.
	 * @param op - op of change to record
	 */
	recordChange(op: ISequencedDocumentMessage): void;

	createChild(
		/**
		 * Summarize function
		 */
		summarizeInternalFn: SummarizeInternalFn,
		/**
		 * Initial id or path part of this node
		 */
		id: string,
		/**
		 * Information needed to create the node.
		 * If it is from a base summary, it will assert that a summary has been seen.
		 * Attach information if it is created from an attach op.
		 * If it is local, it will throw unsupported errors on calls to summarize.
		 */
		createParam: CreateChildSummarizerNodeParam,
		/**
		 * Optional configuration affecting summarize behavior
		 */
		config?: ISummarizerNodeConfig,
	): ISummarizerNode;

	getChild(id: string): ISummarizerNode | undefined;

	/**
	 * True if a summary is currently in progress
	 */
	isSummaryInProgress?(): boolean;
}

/**
 * Extends the functionality of ISummarizerNode to support garbage collection. It adds / updates the following APIs:
 *
 * `usedRoutes`: The routes in this node that are currently in use.
 *
 * `getGCData`: A new API that can be used to get the garbage collection data for this node.
 *
 * `summarize`: Added a trackState flag which indicates whether the summarizer node should track the state of the
 * summary or not.
 *
 * `createChild`: Added the following params:
 *
 * - `getGCDataFn`: This gets the GC data from the caller. This must be provided in order for getGCData to work.
 *
 * - `getInitialGCDetailsFn`: This gets the initial GC details from the caller.
 *
 * `deleteChild`: Deletes a child node.
 *
 * `isReferenced`: This tells whether this node is referenced in the document or not.
 *
 * `updateUsedRoutes`: Used to notify this node of routes that are currently in use in it.
 * @legacy
 * @alpha
 */
export interface ISummarizerNodeWithGC extends ISummarizerNode {
	createChild(
		/**
		 * Summarize function
		 */
		summarizeInternalFn: SummarizeInternalFn,
		/**
		 * Initial id or path part of this node
		 */
		id: string,
		/**
		 * Information needed to create the node.
		 * If it is from a base summary, it will assert that a summary has been seen.
		 * Attach information if it is created from an attach op.
		 * If it is local, it will throw unsupported errors on calls to summarize.
		 */
		createParam: CreateChildSummarizerNodeParam,
		/**
		 * Optional configuration affecting summarize behavior
		 */
		config?: ISummarizerNodeConfigWithGC,
		getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		/**
		 * @deprecated The functionality to update child's base GC details is incorporated in the summarizer node.
		 */
		getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>,
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

	/**
	 * Tells whether this node is being referenced in this document or not. Unreferenced node will get GC'd
	 */
	isReferenced(): boolean;

	/**
	 * After GC has run, called to notify this node of routes that are used in it. These are used for the following:
	 * 1. To identify if this node is being referenced in the document or not.
	 * 2. To identify if this node or any of its children's used routes changed since last summary.
	 *
	 * @param usedRoutes - The routes that are used in this node.
	 */
	updateUsedRoutes(usedRoutes: string[]): void;
}

/**
 * @internal
 */
export const channelsTreeName = ".channels";

/**
 * Contains telemetry data relevant to summarization workflows.
 * This object, in contrast to ITelemetryContext, is expected to be modified directly by various summarize methods.
 * @internal
 */
export interface ITelemetryContextExt {
	/**
	 * Sets value for telemetry data being tracked.
	 * @param prefix - unique prefix to tag this data with (ex: "fluid:map:")
	 * @param property - property name of the telemetry data being tracked (ex: "DirectoryCount")
	 * @param value - value to attribute to this summary telemetry data
	 */
	set(prefix: string, property: string, value: TelemetryEventPropertyTypeExt): void;

	/**
	 * Sets multiple values for telemetry data being tracked.
	 * @param prefix - unique prefix to tag this data with (ex: "fluid:summarize:")
	 * @param property - property name of the telemetry data being tracked (ex: "Options")
	 * @param values - A set of values to attribute to this summary telemetry data.
	 */
	setMultiple(
		prefix: string,
		property: string,
		values: Record<string, TelemetryEventPropertyTypeExt>,
	): void;
}

/**
 * Contains telemetry data relevant to summarization workflows.
 * This object is expected to be modified directly by various summarize methods.
 * @legacy
 * @alpha
 */
export interface ITelemetryContext {
	/**
	 * Sets value for telemetry data being tracked.
	 * @param prefix - unique prefix to tag this data with (ex: "fluid:map:")
	 * @param property - property name of the telemetry data being tracked (ex: "DirectoryCount")
	 * @param value - value to attribute to this summary telemetry data
	 */
	set(prefix: string, property: string, value: TelemetryBaseEventPropertyType): void;

	/**
	 * Sets multiple values for telemetry data being tracked.
	 * @param prefix - unique prefix to tag this data with (ex: "fluid:summarize:")
	 * @param property - property name of the telemetry data being tracked (ex: "Options")
	 * @param values - A set of values to attribute to this summary telemetry data.
	 */
	setMultiple(
		prefix: string,
		property: string,
		values: Record<string, TelemetryBaseEventPropertyType>,
	): void;
}

/**
 * @internal
 */
export const blobCountPropertyName = "BlobCount";

/**
 * @internal
 */
export const totalBlobSizePropertyName = "TotalBlobSize";
