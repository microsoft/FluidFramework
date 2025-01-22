/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, LazyPromise } from "@fluidframework/core-utils/internal";
import {
	IGarbageCollectionData,
	CreateChildSummarizerNodeParam,
	IGarbageCollectionDetailsBase,
	ISummarizerNodeConfigWithGC,
	ISummarizerNodeWithGC,
	SummarizeInternalFn,
} from "@fluidframework/runtime-definitions/internal";
import { unpackChildNodesUsedRoutes } from "@fluidframework/runtime-utils/internal";
import {
	LoggingError,
	TelemetryDataTag,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils/internal";

import { cloneGCData, unpackChildNodesGCDetails } from "../../gc/index.js";

import { SummarizerNode } from "./summarizerNode.js";
import {
	EscapedPath,
	ICreateChildDetails,
	IStartSummaryResult,
	ISummarizerNodeRootContract,
	PendingSummaryInfo,
	ValidateSummaryResult,
} from "./summarizerNodeUtils.js";

export interface IRootSummarizerNodeWithGC
	extends ISummarizerNodeWithGC,
		ISummarizerNodeRootContract {}

// Extend PendingSummaryInfo to add used routes tracking it.
interface PendingSummaryInfoWithGC extends PendingSummaryInfo {
	serializedUsedRoutes: string | undefined;
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
export class SummarizerNodeWithGC extends SummarizerNode implements IRootSummarizerNodeWithGC {
	// Tracks the work-in-progress used routes during summary.
	private wipSerializedUsedRoutes: string | undefined;

	// Tracks the work-in-progress used routes of child nodes during summary.
	private wipChildNodesUsedRoutes: Map<string, string[]> | undefined;

	// This is the last known used routes of this node as seen by the server as part of a summary.
	private referenceUsedRoutes: string[] | undefined;

	// The base GC details of this node used to initialize the GC state.
	private readonly baseGCDetailsP: Promise<IGarbageCollectionDetailsBase>;

	// Keeps track of whether we have loaded the base details to ensure that we only do it once.
	private baseGCDetailsLoaded: boolean = false;

	// The base GC details for the child nodes. This is passed to child nodes when creating them.
	private readonly childNodesBaseGCDetailsP: Promise<
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
		logger: ITelemetryBaseLogger,
		summarizeInternalFn: SummarizeInternalFn,
		config: ISummarizerNodeConfigWithGC,
		_summaryHandleId: EscapedPath,
		changeSequenceNumber: number,
		/**
		 * Summary reference sequence number, i.e. last sequence number seen when it was created
		 */
		lastSummaryReferenceSequenceNumber?: number,
		wipSummaryLogger?: ITelemetryBaseLogger,
		private readonly getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
		getBaseGCDetailsFn?: () => Promise<IGarbageCollectionDetailsBase>,
		/**
		 * A unique id of this node to be logged when sending telemetry.
		 */
		telemetryId?: string,
	) {
		super(
			logger,
			summarizeInternalFn,
			config,
			_summaryHandleId,
			changeSequenceNumber,
			lastSummaryReferenceSequenceNumber,
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
	private async loadBaseGCDetails(): Promise<void> {
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
		if (
			this.canReuseHandle &&
			!fullGC &&
			!this.hasDataChanged() &&
			this.gcData !== undefined
		) {
			return cloneGCData(this.gcData);
		}

		const gcData = await this.getGCDataFn(fullGC);
		this.gcData = cloneGCData(gcData);
		return gcData;
	}

	/**
	 * Called during the start of a summary. Updates the work-in-progress used routes.
	 */
	public startSummary(
		referenceSequenceNumber: number,
		summaryLogger: ITelemetryBaseLogger,
		latestSummaryRefSeqNum: number,
	): IStartSummaryResult {
		// If GC is disabled, skip setting wip used routes since we should not track GC state.
		if (!this.gcDisabled) {
			assert(
				this.wipSerializedUsedRoutes === undefined,
				0x1b4 /* "We should not already be tracking used routes when to track a new summary" */,
			);
		}
		return super.startSummary(referenceSequenceNumber, summaryLogger, latestSummaryRefSeqNum);
	}

	/**
	 * Validates that the in-progress summary is correct for all nodes, i.e., GC should have run for non-skipped nodes.
	 * @param parentSkipRecursion - true if the parent of this node skipped recursing the child nodes when running GC.
	 * In that case, the children will not have work-in-progress state.
	 *
	 * @returns ValidateSummaryResult which contains a boolean success indicating whether the validation was successful.
	 * In case of failure, additional information is returned indicating type of failure and where it was.
	 */
	protected validateSummaryCore(parentSkipRecursion: boolean): ValidateSummaryResult {
		if (this.wasGCMissed()) {
			return {
				success: false,
				reason: "NodeDidNotRunGC",
				id: {
					tag: TelemetryDataTag.CodeArtifact,
					value: this.telemetryNodeId,
				},
				// These errors are usually transient and should go away when summarize / GC is retried.
				retryAfterSeconds: 1,
			};
		}
		return super.validateSummaryCore(parentSkipRecursion);
	}

	private wasGCMissed(): boolean {
		// If GC is disabled, it should not have run so it was not missed.
		// Otherwise, GC should have been called on this node and wipSerializedUsedRoutes must be set.
		if (this.gcDisabled || this.wipSerializedUsedRoutes !== undefined) {
			return false;
		}
		/**
		 * The absence of wip used routes indicates that GC was not run on this node. This can happen if:
		 * 1. A child node was created after GC was already run on the parent. For example, a data store
		 * is realized (loaded) after GC was run on it creating summarizer nodes for its DDSes. In this
		 * case, the parent will pass on used routes to the child nodes and it will have wip used routes.
		 * 2. A new node was created but GC was never run on it. This can mean that the GC data generated
		 * during summarize is incomplete.
		 *
		 * This happens due to scenarios such as data store created during summarize. Such errors should go away when
		 * summarize is attempted again.
		 */
		return true;
	}

	/**
	 * Called after summary has been uploaded to the server. Add the work-in-progress state to the pending
	 * summary queue. We track this until we get an ack from the server for this summary.
	 * @param proposalHandle - The handle of the summary that was uploaded to the server.
	 * @param parentSkipRecursion - true if the parent of this node skipped recursing the child nodes when summarizing.
	 * In that case, the children will not have work-in-progress state.
	 */
	protected completeSummaryCore(proposalHandle: string, parentSkipRecursion: boolean): void {
		let wipSerializedUsedRoutes: string | undefined;
		// If GC is disabled, don't set wip used routes.
		if (!this.gcDisabled) {
			wipSerializedUsedRoutes = this.wipSerializedUsedRoutes;
		}

		super.completeSummaryCore(proposalHandle, parentSkipRecursion);

		// If GC is disabled, skip setting pending summary with GC state.
		if (!this.gcDisabled) {
			const pendingSummaryInfo = this.pendingSummaries.get(proposalHandle);
			if (pendingSummaryInfo !== undefined) {
				const pendingSummaryInfoWithGC = {
					serializedUsedRoutes: wipSerializedUsedRoutes,
					...pendingSummaryInfo,
				};
				this.pendingSummaries.set(proposalHandle, pendingSummaryInfoWithGC);
			}
		}
	}

	/**
	 * Clears the work-in-progress state.
	 */
	public clearSummary(): void {
		this.wipSerializedUsedRoutes = undefined;
		this.wipChildNodesUsedRoutes = undefined;
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
			const pendingSummaryInfo = this.pendingSummaries.get(proposalHandle);
			if (pendingSummaryInfo !== undefined) {
				// If a pending summary exists, it must have used routes since GC is enabled.
				const summaryNodeWithGC = pendingSummaryInfo as PendingSummaryInfoWithGC;
				if (summaryNodeWithGC.serializedUsedRoutes === undefined) {
					const error = new LoggingError("MissingGCStateInPendingSummary", {
						proposalHandle,
						referenceSequenceNumber,
						...tagCodeArtifacts({
							id: this.telemetryNodeId,
						}),
					});
					this.logger.sendErrorEvent(
						{
							eventName: error.message,
						},
						error,
					);
					throw error;
				}
				this.referenceUsedRoutes = JSON.parse(
					summaryNodeWithGC.serializedUsedRoutes,
				) as string[];
			}
		}

		return super.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
	}

	/**
	 * Override the createChild method to return an instance of SummarizerNodeWithGC.
	 */
	public createChild(
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
		 */
		createParam: CreateChildSummarizerNodeParam,
		config: ISummarizerNodeConfigWithGC = {},
		getGCDataFn?: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
	): ISummarizerNodeWithGC {
		assert(!this.children.has(id), 0x1b6 /* "Create SummarizerNode child already exists" */);
		/**
		 * Update the child node's base GC details from this node's current GC details instead of updating from the base
		 * GC details of this node. This will handle scenarios where the GC details was updated during refresh from
		 * snapshot and the child node wasn't created then. If a child is created after that, its GC details should be
		 * the one from the downloaded snapshot and not the base GC details.
		 */
		const getChildBaseGCDetailsFn = async (): Promise<IGarbageCollectionDetailsBase> => {
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
			createDetails.summaryHandleId,
			createDetails.changeSequenceNumber,
			createDetails.lastSummaryReferenceSequenceNumber,
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
	protected maybeUpdateChildState(child: SummarizerNodeWithGC, id: string): void {
		super.maybeUpdateChildState(child, id);

		// If GC has run on this node and summarization isn't complete, this.wipSerializedUsedRoutes will be defined.
		// In that case, update the used routes of the child node. This can happen in scenarios where a data store
		// doesn't have any ops but its reference state changed. So, it gets realized during summarize after GC ran
		// so GC would not have run on this node which is fine.
		if (this.wipSerializedUsedRoutes !== undefined) {
			// If the child route used routes are not defined, initialize it now and it can be used for all child nodes
			// created until this summarization process is completed. This is an optimization to unpack the used routes
			// only when needed.
			if (this.wipChildNodesUsedRoutes === undefined) {
				this.wipChildNodesUsedRoutes = unpackChildNodesUsedRoutes(this.usedRoutes);
			}
			child.updateUsedRoutes(this.wipChildNodesUsedRoutes.get(id) ?? [""]);
		}

		// In case we have pending summaries on the parent, let's initialize it on the child.
		for (const [key, pendingSummary] of this.pendingSummaries.entries()) {
			const pendingSummaryWithGC = pendingSummary as PendingSummaryInfoWithGC;
			if (pendingSummaryWithGC.serializedUsedRoutes !== undefined) {
				const childNodeUsedRoutes = unpackChildNodesUsedRoutes(
					JSON.parse(pendingSummaryWithGC.serializedUsedRoutes),
				);
				const newSerializedRoutes = childNodeUsedRoutes.get(id) ?? [""];
				const childPendingSummaryInfo = {
					...pendingSummaryWithGC,
					serializedUsedRoutes: JSON.stringify(newSerializedRoutes),
				};
				child.addPendingSummary(key, childPendingSummaryInfo);
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

	public updateUsedRoutes(usedRoutes: string[]): void {
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
		// If GC is disabled, it should not affect summary state, return false.
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
	logger: ITelemetryBaseLogger,
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
		EscapedPath.create("") /* summaryHandleId */,
		changeSequenceNumber,
		referenceSequenceNumber,
		undefined /* wipSummaryLogger */,
		getGCDataFn,
		getBaseGCDetailsFn,
		"" /* telemetryId */,
	);
