/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
	CreateChildSummarizerNodeParam,
	gcTreeKey,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
	ISummarizeInternalResult,
	ISummarizeResult,
	ISummarizerNodeConfigWithGC,
	ISummarizerNodeWithGC,
	SummarizeInternalFn,
	ITelemetryContext,
	IExperimentalIncrementalSummaryContext,
} from "@fluidframework/runtime-definitions";
import { LoggingError, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import { ReadAndParseBlob, unpackChildNodesUsedRoutes } from "@fluidframework/runtime-utils";
import {
	cloneGCData,
	getGCDataFromSnapshot,
	runGarbageCollection,
	unpackChildNodesGCDetails,
} from "../../gc";
import { SummarizerNode } from "./summarizerNode";
import {
	EscapedPath,
	ICreateChildDetails,
	IInitialSummary,
	ISummarizerNodeRootContract,
	parseSummaryForSubtrees,
	SummaryNode,
} from "./summarizerNodeUtils";

export interface IRootSummarizerNodeWithGC
	extends ISummarizerNodeWithGC,
		ISummarizerNodeRootContract {}

// Extend SummaryNode to add used routes tracking to it.
class SummaryNodeWithGC extends SummaryNode {
	constructor(
		public readonly serializedUsedRoutes: string,
		summary: {
			readonly referenceSequenceNumber: number;
			readonly basePath: EscapedPath | undefined;
			readonly localPath: EscapedPath;
			additionalPath?: EscapedPath;
		},
	) {
		super(summary);
	}
}

/**
 * Extends the functionality of SummarizerNode to manage this node's garbage collection data:
 *
 * - Adds a new API `getGCData` to return GC data of this node.
 *
 * - Caches the result of `getGCData` to be used if nothing changes between summaries.
 *
 * - Manages the used routes of this node. These are used to identify if this node is referenced in the document
 * and to determine if the node's used state changed since last summary.
 *
 * - Adds trackState param to summarize. If trackState is false, it bypasses the SummarizerNode and calls
 * directly into summarizeInternal method.
 */
class SummarizerNodeWithGC extends SummarizerNode implements IRootSummarizerNodeWithGC {
	// Tracks the work-in-progress used routes during summary.
	private wipSerializedUsedRoutes: string | undefined;

	// This is the last known used routes of this node as seen by the server as part of a summary.
	private referenceUsedRoutes: string[] | undefined;

	// The base GC details of this node used to initialize the GC state.
	private readonly baseGCDetailsP: LazyPromise<IGarbageCollectionDetailsBase>;

	// Keeps track of whether we have loaded the base details to ensure that we only do it once.
	private baseGCDetailsLoaded: boolean = false;

	// The base GC details for the child nodes. This is passed to child nodes when creating them.
	private readonly childNodesBaseGCDetailsP: LazyPromise<
		Map<string, IGarbageCollectionDetailsBase>
	>;

	private gcData: IGarbageCollectionData | undefined;

	// Set used routes to have self route by default. This makes the node referenced by default. This is done to ensure
	// that this node is not marked as collected when running GC has been disabled. Once, the option to disable GC is
	// removed (from runGC flag in IContainerRuntimeOptions), this should be changed to be have no routes by default.
	private usedRoutes: string[] = [""];

	// True if GC is disabled for this node. If so, do not track GC specific state for a summary.
	private readonly gcDisabled: boolean;

	/**
	 * Do not call constructor directly.
	 * Use createRootSummarizerNodeWithGC to create root node, or createChild to create child nodes.
	 */
	public constructor(
		logger: ITelemetryLogger,
		private readonly summarizeFn: (
			fullTree: boolean,
			trackState: boolean,
			telemetryContext?: ITelemetryContext,
			incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
		) => Promise<ISummarizeInternalResult>,
		config: ISummarizerNodeConfigWithGC,
		changeSequenceNumber: number,
		/** Undefined means created without summary */
		latestSummary?: SummaryNode,
		initialSummary?: IInitialSummary,
		wipSummaryLogger?: ITelemetryLogger,
		private readonly getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>,
		/** A unique id of this node to be logged when sending telemetry. */
		telemetryId?: string,
	) {
		super(
			logger,
			async (
				fullTree: boolean,
				_trackState: boolean,
				telemetryContext?: ITelemetryContext,
				incrementalSummaryContext?: IExperimentalIncrementalSummaryContext,
			) =>
				summarizeFn(
					fullTree,
					true /* trackState */,
					telemetryContext,
					incrementalSummaryContext,
				),
			config,
			changeSequenceNumber,
			latestSummary,
			initialSummary,
			wipSummaryLogger,
			telemetryId,
		);

		this.gcDisabled = config.gcDisabled === true;

		this.baseGCDetailsP = new LazyPromise(async () => {
			return (await getBaseGCDetailsFn?.()) ?? { usedRoutes: [] };
		});

		this.childNodesBaseGCDetailsP = new LazyPromise(async () => {
			await this.loadBaseGCDetails();
			return unpackChildNodesGCDetails({ gcData: this.gcData, usedRoutes: this.usedRoutes });
		});
	}

	/**
	 * Loads state from this node's initial GC summary details. This contains the following data from the last summary
	 * seen by the server for this client:
	 * - usedRoutes: This is used to figure out if the used state of this node changed since last summary.
	 * - gcData: The garbage collection data of this node that is required for running GC.
	 */
	private async loadBaseGCDetails() {
		if (this.baseGCDetailsLoaded) {
			return;
		}
		const baseGCDetails = await this.baseGCDetailsP;

		// Possible race - If there were parallel calls to loadBaseGCDetails, we want to make sure that we update
		// the state from the base details only once.
		if (this.baseGCDetailsLoaded) {
			return;
		}
		this.baseGCDetailsLoaded = true;

		// Update GC data, used routes and reference used routes. The used routes are sorted because they are compared
		// across GC runs to check if they changed. Sorting ensures that the elements are in the same order.
		// If the GC details has GC data, initialize our GC data from it.
		if (baseGCDetails.gcData !== undefined) {
			this.gcData = cloneGCData(baseGCDetails.gcData);
		}
		if (baseGCDetails.usedRoutes !== undefined) {
			this.usedRoutes = Array.from(baseGCDetails.usedRoutes).sort();
			this.referenceUsedRoutes = Array.from(baseGCDetails.usedRoutes).sort();
		}
	}

	public async summarize(
		fullTree: boolean,
		trackState: boolean = true,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeResult> {
		// If GC is not disabled and a summary is in progress, GC should have run and updated the used routes for this
		// summary by calling updateUsedRoutes which sets wipSerializedUsedRoutes.
		if (!this.gcDisabled && this.isSummaryInProgress()) {
			assert(
				this.wipSerializedUsedRoutes !== undefined,
				0x1b1 /* "wip used routes should be set if tracking a summary" */,
			);
		}

		// If trackState is true, get summary from base summarizer node which tracks summary state.
		// If trackState is false, get summary from summarizeInternal.
		return trackState
			? super.summarize(fullTree, true /* trackState */, telemetryContext)
			: this.summarizeFn(fullTree, trackState, telemetryContext);
	}

	/**
	 * Returns the GC data of this node. If nothing has changed since last summary, it tries to reuse the data from
	 * the previous summary. Else, it gets new GC data from the underlying Fluid object.
	 * @param fullGC - true to bypass optimizations and force full generation of GC data.
	 */
	public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
		assert(
			!this.gcDisabled,
			0x1b2 /* "Getting GC data should not be called when GC is disabled!" */,
		);
		assert(
			this.getGCDataFn !== undefined,
			0x1b3 /* "GC data cannot be retrieved without getGCDataFn" */,
		);

		// Load GC details from the initial summary, if not already loaded. If this is the first time this function is
		// called and the node's data has not changed since last summary, the GC data in initial details is returned.
		await this.loadBaseGCDetails();

		// If there is no new data since last summary and we have GC data from the previous run, return it. The previous
		// GC data may not be available if loaded from a snapshot with either GC disabled or before GC was added.
		// Note - canReuseHandle is checked to be consistent with summarize - generate GC data for nodes for which
		// summary must be generated.
		if (this.canReuseHandle && !fullGC && !this.hasDataChanged() && this.gcData !== undefined) {
			return cloneGCData(this.gcData);
		}

		const gcData = await this.getGCDataFn(fullGC);
		this.gcData = cloneGCData(gcData);
		return gcData;
	}

	/**
	 * Called during the start of a summary. Updates the work-in-progress used routes.
	 */
	public startSummary(referenceSequenceNumber: number, summaryLogger: ITelemetryLogger) {
		// If GC is disabled, skip setting wip used routes since we should not track GC state.
		if (!this.gcDisabled) {
			assert(
				this.wipSerializedUsedRoutes === undefined,
				0x1b4 /* "We should not already be tracking used routes when to track a new summary" */,
			);
		}
		super.startSummary(referenceSequenceNumber, summaryLogger);
	}

	/**
	 * Called after summary has been uploaded to the server. Add the work-in-progress state to the pending
	 * summary queue. We track this until we get an ack from the server for this summary.
	 */
	protected completeSummaryCore(
		proposalHandle: string,
		parentPath: EscapedPath | undefined,
		parentSkipRecursion: boolean,
	) {
		let wipSerializedUsedRoutes: string | undefined;
		// If GC is disabled, don't set wip used routes.
		if (!this.gcDisabled) {
			wipSerializedUsedRoutes = this.wipSerializedUsedRoutes;
			/**
			 * The absence of wip used routes indicates that GC was not run on this node. This can happen if:
			 * 1. A child node was created after GC was already run on the parent. For example, a data store
			 * is realized (loaded) after GC was run on it creating summarizer nodes for its DDSes. In this
			 * case, the used routes of the parent should be passed on the child nodes and it should be fine.
			 * 2. A new node was created but GC was never run on it. This can mean that the GC data generated
			 * during summarize is complete . We should not continue, log and throw an error. This will help us
			 * identify these cases and take appropriate action.
			 */
			if (wipSerializedUsedRoutes === undefined) {
				this.throwUnexpectedError({
					eventName: "NodeDidNotRunGC",
					proposalHandle,
				});
			}
		}

		super.completeSummaryCore(proposalHandle, parentPath, parentSkipRecursion);

		// If GC is disabled, skip setting pending summary with GC state.
		if (!this.gcDisabled) {
			const summaryNode = this.pendingSummaries.get(proposalHandle);
			if (summaryNode !== undefined) {
				const summaryNodeWithGC = new SummaryNodeWithGC(
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					wipSerializedUsedRoutes!,
					summaryNode,
				);
				this.pendingSummaries.set(proposalHandle, summaryNodeWithGC);
			}
		}
	}

	/**
	 * Clears the work-in-progress state.
	 */
	public clearSummary() {
		this.wipSerializedUsedRoutes = undefined;
		super.clearSummary();
	}

	/**
	 * Called when we get an ack from the server for a summary we sent. Update the reference state of this node
	 * from the state in the pending summary queue.
	 */
	protected refreshLatestSummaryFromPending(
		proposalHandle: string,
		referenceSequenceNumber: number,
	): void {
		// If GC is disabled, skip setting referenced used routes since we are not tracking GC state.
		if (!this.gcDisabled) {
			const summaryNode = this.pendingSummaries.get(proposalHandle);
			if (summaryNode !== undefined) {
				// If a pending summary exists, it must have used routes since GC is enabled.
				const summaryNodeWithGC = summaryNode as SummaryNodeWithGC;
				if (summaryNodeWithGC.serializedUsedRoutes === undefined) {
					const error = new LoggingError("MissingGCStateInPendingSummary", {
						proposalHandle,
						referenceSequenceNumber,
						id: {
							tag: TelemetryDataTag.CodeArtifact,
							value: this.telemetryNodeId,
						},
					});
					this.logger.sendErrorEvent(
						{
							eventName: error.message,
						},
						error,
					);
					throw error;
				}
				this.referenceUsedRoutes = JSON.parse(summaryNodeWithGC.serializedUsedRoutes);
			}
		}

		return super.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
	}

	/**
	 * Called when we need to upload the reference state from the given summary.
	 */
	protected async refreshLatestSummaryFromSnapshot(
		referenceSequenceNumber: number,
		snapshotTree: ISnapshotTree,
		basePath: EscapedPath | undefined,
		localPath: EscapedPath,
		correlatedSummaryLogger: ITelemetryLogger,
		readAndParseBlob: ReadAndParseBlob,
	): Promise<void> {
		await this.refreshGCStateFromSnapshot(
			referenceSequenceNumber,
			snapshotTree,
			readAndParseBlob,
		);
		return super.refreshLatestSummaryFromSnapshot(
			referenceSequenceNumber,
			snapshotTree,
			basePath,
			localPath,
			correlatedSummaryLogger,
			readAndParseBlob,
		);
	}

	/**
	 * Updates GC state from the given snapshot if GC is enabled and the snapshot is newer than the one this node
	 * is tracking.
	 */
	private async refreshGCStateFromSnapshot(
		referenceSequenceNumber: number,
		snapshotTree: ISnapshotTree,
		readAndParseBlob: ReadAndParseBlob,
	): Promise<void> {
		// If GC is disabled or we have seen a newer summary, skip updating GC state.
		if (this.gcDisabled || this.referenceSequenceNumber >= referenceSequenceNumber) {
			return;
		}

		// Load the base GC details before proceeding because if that happens later it can overwrite the GC details
		// written by the following code.
		await this.loadBaseGCDetails();

		// Possible re-entrancy. We may already have processed this while loading base GC details.
		if (this.referenceSequenceNumber >= referenceSequenceNumber) {
			return;
		}

		/**
		 * GC data is written at root of the snapshot tree under "gc" sub-tree. This data needs to be propagated to
		 * all the nodes in the container.
		 * The root summarizer node reads the GC data from the "gc" sub-tree, runs GC on it to get used routes in
		 * the container and updates its GC data and referenced used routes. It then gets the GC data and used
		 * routes of all its children and adds it to their snapshot tree.
		 * All the other nodes gets the GC data and used routes from their snapshot tree and updates their state.
		 * They get the GC data and used routes of their children and add it to their snapshot tree and so on.
		 *
		 * Note that if the snapshot does not have GC tree, GC data will be set to undefined and used routes will be
		 * set to self-route (meaning referenced) for all nodes. This is important because the GC data needs to be
		 * regenerated in the next summary.
		 */
		let gcDetails: IGarbageCollectionDetailsBase | undefined;
		const gcSnapshotTree = snapshotTree.trees[gcTreeKey];
		if (gcSnapshotTree !== undefined) {
			// If there is a GC tree in the snapshot, this is the root summarizer node. Read GC data from the tree
			// process it as explained above.
			const gcSnapshotData = await getGCDataFromSnapshot(gcSnapshotTree, readAndParseBlob);

			if (gcSnapshotData.gcState !== undefined) {
				const gcNodes: { [id: string]: string[] } = {};
				for (const [nodeId, nodeData] of Object.entries(gcSnapshotData.gcState.gcNodes)) {
					gcNodes[nodeId] = Array.from(nodeData.outboundRoutes);
				}
				// Run GC on the nodes in the snapshot to get the used routes for each node in the container.
				const usedRoutes = runGarbageCollection(gcNodes, ["/"]).referencedNodeIds;
				gcDetails = { gcData: { gcNodes }, usedRoutes };
			}
		} else {
			// If there is a GC blob in the snapshot, it's a non-root summarizer nodes - The root summarizer node
			// writes GC blob in the snapshot of child nodes. Get  GC data and used routes from the blob.
			const gcDetailsBlob = snapshotTree.blobs[gcTreeKey];
			if (gcDetailsBlob !== undefined) {
				gcDetails = JSON.parse(gcDetailsBlob) as IGarbageCollectionDetailsBase;
			}
		}

		// Update this node to the same GC state it was when the ack corresponding to this summary was processed.
		this.gcData = gcDetails?.gcData !== undefined ? cloneGCData(gcDetails.gcData) : undefined;
		this.referenceUsedRoutes =
			gcDetails?.usedRoutes !== undefined ? Array.from(gcDetails.usedRoutes) : undefined;
		// If there are no used routes in the GC details, set it to have self route which will make the node
		// referenced. This scenario can only happen if the snapshot is from a client where GC was not run or
		// disabled. In both the cases, the node should be referenced.
		this.usedRoutes =
			gcDetails?.usedRoutes !== undefined ? Array.from(gcDetails.usedRoutes) : [""];

		if (gcDetails === undefined) {
			return;
		}

		// Generate the GC data and used routes of children GC nodes and add it to their snapshot tree.
		const gcDetailsMap = unpackChildNodesGCDetails(gcDetails);
		const { childrenTree } = parseSummaryForSubtrees(snapshotTree);
		gcDetailsMap.forEach((childGCDetails: IGarbageCollectionDetailsBase, childId: string) => {
			if (childrenTree.trees[childId] !== undefined) {
				childrenTree.trees[childId].blobs[gcTreeKey] = JSON.stringify(childGCDetails);
			}
		});
	}

	/**
	 * Override the createChild method to return an instance of SummarizerNodeWithGC.
	 */
	public createChild(
		/** Summarize function */
		summarizeInternalFn: SummarizeInternalFn,
		/** Initial id or path part of this node */
		id: string,
		/**
		 * Information needed to create the node.
		 * If it is from a base summary, it will assert that a summary has been seen.
		 * Attach information if it is created from an attach op.
		 */
		createParam: CreateChildSummarizerNodeParam,
		config: ISummarizerNodeConfigWithGC = {},
		getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>,
	): ISummarizerNodeWithGC {
		assert(!this.children.has(id), 0x1b6 /* "Create SummarizerNode child already exists" */);
		/**
		 * Update the child node's base GC details from this node's current GC details instead of updating from the base
		 * GC details of this node. This will handle scenarios where the GC details was updated during refresh from
		 * snapshot and the child node wasn't created then. If a child is created after that, its GC details should be
		 * the one from the downloaded snapshot and not the base GC details.
		 */
		const getChildBaseGCDetailsFn = async () => {
			const childNodesBaseGCDetails = await this.childNodesBaseGCDetailsP;
			return childNodesBaseGCDetails.get(id) ?? {};
		};

		const createDetails: ICreateChildDetails = this.getCreateDetailsForChild(id, createParam);
		const child = new SummarizerNodeWithGC(
			this.logger,
			summarizeInternalFn,
			{
				...config,
				// Propagate our gcDisabled state to the child if its not explicity specified in child's config.
				gcDisabled: config.gcDisabled ?? this.gcDisabled,
			},
			createDetails.changeSequenceNumber,
			createDetails.latestSummary,
			createDetails.initialSummary,
			this.wipSummaryLogger,
			getGCDataFn,
			getChildBaseGCDetailsFn,
			createDetails.telemetryNodeId,
		);

		// There may be additional state that has to be updated in this child. For example, if a summary is being
		// tracked, the child's summary tracking state needs to be updated too.
		this.maybeUpdateChildState(child, id);

		this.children.set(id, child);
		return child;
	}

	/**
	 * Updates the state of the child if required. For example, if a summary is currently being  tracked, the child's
	 * summary tracking state needs to be updated too.
	 * Also, in case a child node gets realized in between Summary Op and Summary Ack, let's initialize the child's
	 * pending summary as well. Finally, if the pendingSummaries entries have serializedRoutes, replicate them to the
	 * pendingSummaries from the child nodes.
	 * @param child - The child node whose state is to be updated.
	 * @param id - Initial id or path part of this node
	 */
	protected maybeUpdateChildState(child: SummarizerNodeWithGC, id: string) {
		super.maybeUpdateChildState(child, id);

		// In case we have pending summaries on the parent, let's initialize it on the child.
		if (child.latestSummary !== undefined) {
			for (const [key, value] of this.pendingSummaries.entries()) {
				const summaryNodeWithGC = value as SummaryNodeWithGC;
				if (summaryNodeWithGC.serializedUsedRoutes !== undefined) {
					const childNodeUsedRoutes = unpackChildNodesUsedRoutes(
						JSON.parse(summaryNodeWithGC.serializedUsedRoutes),
					);
					const newSerializedRoutes = childNodeUsedRoutes.get(id) ?? [""];
					const newLatestSummaryNode = new SummaryNodeWithGC(
						JSON.stringify(newSerializedRoutes),
						{
							referenceSequenceNumber: value.referenceSequenceNumber,
							basePath: value.basePath,
							localPath: value.localPath,
						},
					);
					child.addPendingSummary(key, newLatestSummaryNode);
				}
			}
		}
	}

	/**
	 * Deletes the child node with the given id.
	 */
	public deleteChild(id: string): void {
		this.children.delete(id);
	}

	/**
	 * Override the getChild method to return an instance of SummarizerNodeWithGC.
	 */
	public getChild(id: string): ISummarizerNodeWithGC | undefined {
		return this.children.get(id) as SummarizerNodeWithGC;
	}

	public isReferenced(): boolean {
		return this.usedRoutes.includes("") || this.usedRoutes.includes("/");
	}

	public updateUsedRoutes(usedRoutes: string[]) {
		// Sort the given routes before updating. This will ensure that the routes compared in hasUsedStateChanged()
		// are in the same order.
		this.usedRoutes = usedRoutes.sort();

		// If GC is not disabled and a summary is in progress, update the work-in-progress used routes so that it can
		// be tracked for this summary.
		if (!this.gcDisabled && this.isSummaryInProgress()) {
			this.wipSerializedUsedRoutes = JSON.stringify(this.usedRoutes);
		}
	}

	/**
	 * Override the hasChanged method. If this node data or its used state changed, the node is considered changed.
	 */
	protected hasChanged(): boolean {
		return this.hasDataChanged() || this.hasUsedStateChanged();
	}

	/**
	 * This tells whether the data in this node has changed or not.
	 */
	private hasDataChanged(): boolean {
		return super.hasChanged();
	}

	/**
	 * This tells whether the used state of this node has changed since last successful summary. If the used routes
	 * of this node changed, its used state is considered changed. Basically, if this node or any of its child nodes
	 * was previously used and became unused (or vice versa), its used state has changed.
	 */
	private hasUsedStateChanged(): boolean {
		// If GC is disabled, we are not tracking used state, return false.
		if (this.gcDisabled) {
			return false;
		}

		return (
			this.referenceUsedRoutes === undefined ||
			JSON.stringify(this.usedRoutes) !== JSON.stringify(this.referenceUsedRoutes)
		);
	}
}

/**
 * Creates a root summarizer node with GC functionality built-in.
 * @param logger - Logger to use within SummarizerNode
 * @param summarizeInternalFn - Function to generate summary
 * @param changeSequenceNumber - Sequence number of latest change to new node/subtree
 * @param referenceSequenceNumber - Reference sequence number of last acked summary,
 * or undefined if not loaded from summary
 * @param config - Configure behavior of summarizer node
 * @param getGCDataFn - Function to get the GC data of this node
 * @param baseGCDetailsP - Function to get the initial GC details of this node
 */
export const createRootSummarizerNodeWithGC = (
	logger: ITelemetryLogger,
	summarizeInternalFn: SummarizeInternalFn,
	changeSequenceNumber: number,
	referenceSequenceNumber: number | undefined,
	config: ISummarizerNodeConfigWithGC = {},
	getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
	getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>,
): IRootSummarizerNodeWithGC =>
	new SummarizerNodeWithGC(
		logger,
		summarizeInternalFn,
		config,
		changeSequenceNumber,
		referenceSequenceNumber === undefined
			? undefined
			: SummaryNode.createForRoot(referenceSequenceNumber),
		undefined /* initialSummary */,
		undefined /* wipSummaryLogger */,
		getGCDataFn,
		getBaseGCDetailsFn,
		"" /* telemetryId */,
	);
