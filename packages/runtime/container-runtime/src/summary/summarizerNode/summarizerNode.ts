/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	IExperimentalIncrementalSummaryContext,
	ITelemetryContext,
	// eslint-disable-next-line import/no-deprecated
	CreateChildSummarizerNodeParam,
	// eslint-disable-next-line import/no-deprecated
	CreateSummarizerNodeSource,
	ISummarizeResult,
	// eslint-disable-next-line import/no-deprecated
	ISummarizerNode,
	// eslint-disable-next-line import/no-deprecated
	ISummarizerNodeConfig,
	SummarizeInternalFn,
} from "@fluidframework/runtime-definitions/internal";
import { mergeStats } from "@fluidframework/runtime-utils/internal";
import { type ITelemetryErrorEventExt } from "@fluidframework/telemetry-utils/internal";
import {
	ITelemetryLoggerExt,
	LoggingError,
	PerformanceEvent,
	TelemetryDataTag,
	createChildLogger,
	tagCodeArtifacts,
} from "@fluidframework/telemetry-utils/internal";

import {
	EscapedPath,
	ICreateChildDetails,
	IRefreshSummaryResult,
	IStartSummaryResult,
	// eslint-disable-next-line import/no-deprecated
	ISummarizerNodeRootContract,
	ValidateSummaryResult,
	PendingSummaryInfo,
} from "./summarizerNodeUtils.js";

// eslint-disable-next-line import/no-deprecated
export interface IRootSummarizerNode extends ISummarizerNode, ISummarizerNodeRootContract {}

/**
 * Encapsulates the summarizing work and state of an individual tree node in the
 * summary tree. It tracks changes and allows for optimizations when unchanged, or
 * can allow for fallback summaries to be generated when an error is encountered.
 * Usage is for the root node to call startSummary first to begin tracking a WIP
 * (work in progress) summary. Then all nodes will call summarize to summaries their
 * individual parts. Once completed and uploaded to storage, the root node will call
 * completeSummary or clearSummary to clear the WIP summary tracking state if something
 *went wrong. The SummarizerNodes will track all pending summaries that have been
 * recorded by the completeSummary call. When one of them is acked, the root node should
 *call refreshLatestSummary to inform the tree of SummarizerNodes of the new baseline
 * latest successful summary.
 */
// eslint-disable-next-line import/no-deprecated
export class SummarizerNode implements IRootSummarizerNode {
	/**
	 * The reference sequence number of the most recent acked summary.
	 * Returns 0 if there is not yet an acked summary.
	 */
	public get referenceSequenceNumber(): number {
		return this._lastSummaryReferenceSequenceNumber ?? 0;
	}

	/**
	 * returns the handle of the last successful summary of this summarizerNode in string format
	 * (this getter is primarily only used in the test code)
	 */
	public get summaryHandleId(): string {
		return this._summaryHandleId.toString();
	}

	// eslint-disable-next-line import/no-deprecated
	protected readonly children = new Map<string, SummarizerNode>();
	/**
	 * Key value pair of summaries submitted by this client which are not yet acked.
	 * Key is the proposalHandle and value is the summary op's referece sequence number.
	 */
	protected readonly pendingSummaries = new Map<string, PendingSummaryInfo>();
	protected wipReferenceSequenceNumber: number | undefined;
	/**
	 * True if the current node was summarized during the current summary process
	 * This flag is used to identify scenarios where summarize was not called on a node.
	 * For example, this node was created after its parent was already summarized due to out-of-order realization via application code.
	 */
	private wipSummarizeCalled: boolean = false;
	private wipSkipRecursion = false;

	protected readonly logger: ITelemetryLoggerExt;

	/**
	 * Do not call constructor directly.
	 *Use createRootSummarizerNode to create root node, or createChild to create child nodes.
	 */
	public constructor(
		baseLogger: ITelemetryBaseLogger,
		private readonly summarizeInternalFn: SummarizeInternalFn,
		// eslint-disable-next-line import/no-deprecated
		config: ISummarizerNodeConfig,
		/**
		 * Encoded handle or path to the node
		 */
		private readonly _summaryHandleId: EscapedPath,
		private _changeSequenceNumber: number,
		/**
		 * Summary reference sequence number, i.e. last sequence number seen when last successful summary was created
		 */
		private _lastSummaryReferenceSequenceNumber?: number,
		protected wipSummaryLogger?: ITelemetryBaseLogger,
		/**
		 * A unique id of this node to be logged when sending telemetry.
		 */
		protected telemetryNodeId?: string,
	) {
		this.canReuseHandle = config.canReuseHandle ?? true;
		// All logs posted by the summarizer node should include the telemetryNodeId.
		this.logger = createChildLogger({
			logger: baseLogger,
			properties: {
				all: tagCodeArtifacts({ id: this.telemetryNodeId }),
			},
		});
	}

	/**
	 * In order to produce a summary with a summarizer node, the summarizer node system must be notified a summary has
	 * started. This is done by calling startSummary. This will track the reference sequence number of the summary and
	 * run some validation checks to ensure the summary is correct.
	 * @param referenceSequenceNumber - the number of ops processed up to this point
	 * @param summaryLogger - the logger to use for the summary
	 * @param latestSummaryRefSeqNum - the reference sequence number of the latest summary. Another way to think about
	 * it is the reference sequence number of the previous summary.
	 * @returns the number of nodes in the tree, the number of nodes that are invalid, and the different types of
	 * sequence number mismatches
	 */
	public startSummary(
		referenceSequenceNumber: number,
		summaryLogger: ITelemetryBaseLogger,
		latestSummaryRefSeqNum: number,
	): IStartSummaryResult {
		assert(
			this.wipSummaryLogger === undefined,
			0x19f /* "wipSummaryLogger should not be set yet in startSummary" */,
		);
		assert(
			this.wipReferenceSequenceNumber === undefined,
			0x1a0 /* "Already tracking a summary" */,
		);

		let nodes = 1; // number of summarizerNodes at the start of the summary
		let invalidNodes = 0;
		const sequenceNumberMismatchKeySet = new Set<string>();
		const nodeLatestSummaryRefSeqNum = this._lastSummaryReferenceSequenceNumber;
		if (
			nodeLatestSummaryRefSeqNum !== undefined &&
			latestSummaryRefSeqNum !== nodeLatestSummaryRefSeqNum
		) {
			invalidNodes++;
			sequenceNumberMismatchKeySet.add(
				`${latestSummaryRefSeqNum}-${nodeLatestSummaryRefSeqNum}`,
			);
		}

		this.wipSummaryLogger = summaryLogger;

		for (const child of this.children.values()) {
			const childStartSummaryResult = child.startSummary(
				referenceSequenceNumber,
				this.wipSummaryLogger,
				latestSummaryRefSeqNum,
			);
			nodes += childStartSummaryResult.nodes;
			invalidNodes += childStartSummaryResult.invalidNodes;
			for (const invalidSequenceNumber of childStartSummaryResult.mismatchNumbers) {
				sequenceNumberMismatchKeySet.add(invalidSequenceNumber);
			}
		}
		this.wipReferenceSequenceNumber = referenceSequenceNumber;
		return {
			nodes,
			invalidNodes,
			mismatchNumbers: sequenceNumberMismatchKeySet,
		};
	}

	public async summarize(
		fullTree: boolean,
		trackState: boolean = true,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummarizeResult> {
		// If trackState is false, call summarize internal directly and don't track any state.
		if (!trackState) {
			return this.summarizeInternalFn(fullTree, trackState, telemetryContext);
		}

		// Set to wipSummarizeCalled true to represent that current node was included in the summary process.
		this.wipSummarizeCalled = true;

		// Try to reuse the tree if unchanged
		if (this.canReuseHandle && !fullTree && !this.hasChanged()) {
			if (this._lastSummaryReferenceSequenceNumber !== undefined) {
				this.wipSkipRecursion = true;
				const stats = mergeStats();
				stats.handleNodeCount++;
				return {
					summary: {
						type: SummaryType.Handle,
						handle: this.summaryHandleId,
						handleType: SummaryType.Tree,
					},
					stats,
				};
			}
		}

		let incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined;
		if (!fullTree) {
			assert(
				this.wipReferenceSequenceNumber !== undefined,
				0x5df /* Summarize should not be called when not tracking the summary */,
			);
			incrementalSummaryContext =
				this._lastSummaryReferenceSequenceNumber !== undefined
					? {
							summarySequenceNumber: this.wipReferenceSequenceNumber,
							latestSummarySequenceNumber: this._lastSummaryReferenceSequenceNumber,
							// TODO: remove summaryPath.
							summaryPath: this.summaryHandleId,
						}
					: undefined;
		}

		const result = await this.summarizeInternalFn(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);

		return { summary: result.summary, stats: result.stats };
	}

	/**
	 * Validates that the in-progress summary is correct, i.e., summarize should have run for all non-skipped
	 * nodes. This will only be called for the root summarizer node and is called by it recursively on all child nodes.
	 *
	 * @returns ValidateSummaryResult which contains a boolean success indicating whether the validation was successful.
	 * In case of failure, additional information is returned indicating type of failure and where it was.
	 */
	public validateSummary(): ValidateSummaryResult {
		return this.validateSummaryCore(false /* parentSkipRecursion */);
	}

	/**
	 * Validates that the in-progress summary is correct for all nodes, i.e., summarize should have run for all
	 * non-skipped nodes.
	 * @param parentSkipRecursion - true if the parent of this node skipped recursing the child nodes when summarizing.
	 * In that case, the children will not have work-in-progress state.
	 *
	 * @returns ValidateSummaryResult which contains a boolean success indicating whether the validation was successful.
	 * In case of failure, additional information is returned indicating type of failure and where it was.
	 */
	protected validateSummaryCore(parentSkipRecursion: boolean): ValidateSummaryResult {
		if (this.wasSummarizeMissed(parentSkipRecursion)) {
			return {
				success: false,
				reason: "NodeDidNotSummarize",
				id: {
					tag: TelemetryDataTag.CodeArtifact,
					value: this.telemetryNodeId,
				},
				// These errors are usually transient and should go away when summarize is retried.
				retryAfterSeconds: 1,
			};
		}
		if (parentSkipRecursion) {
			return { success: true };
		}

		for (const child of this.children.values()) {
			const result = child.validateSummaryCore(this.wipSkipRecursion || parentSkipRecursion);
			// If any child fails, return the failure.
			if (!result.success) {
				return result;
			}
		}
		return { success: true };
	}

	private wasSummarizeMissed(parentSkipRecursion: boolean): boolean {
		assert(
			this.wipSummaryLogger !== undefined,
			0x6fc /* wipSummaryLogger should have been set in startSummary or ctor */,
		);
		assert(this.wipReferenceSequenceNumber !== undefined, 0x6fd /* Not tracking a summary */);

		// If the parent node skipped recursion, it did not call summarize on this node. So, summarize was not missed
		// but was intentionally not called.
		// Otherwise, summarize should have been called on this node and wipSummarizeCalled must be set.
		if (parentSkipRecursion || this.wipSummarizeCalled) {
			return false;
		}

		/**
		 * The absence of wip local path indicates that summarize was not called for this node. Return failure.
		 * This can happen if:
		 * 1. A child node was created after summarize was already called on the parent. For example, a data store
		 * is realized (loaded) after summarize was called on it creating summarizer nodes for its DDSes. In this case,
		 * parentSkipRecursion will be true and the if block above would handle it.
		 * 2. A new node was created but summarize was never called on it. This can mean that the summary that is
		 * generated may not have the data from this node. We should not continue, log and throw an error. This
		 * will help us identify these cases and take appropriate action.
		 *
		 * This happens due to scenarios such as data store created during summarize. Such errors should go away when
		 * summarize is attempted again.
		 */
		return true;
	}

	/**
	 * Called after summary has been uploaded to the server. Add the work-in-progress state to the pending summary
	 * queue. We track this until we get an ack from the server for this summary.
	 * @param proposalHandle - The handle of the summary that was uploaded to the server.
	 */
	public completeSummary(proposalHandle: string): void {
		this.completeSummaryCore(proposalHandle, false /* parentSkipRecursion */);
	}

	/**
	 * Recursive implementation for completeSummary, with additional internal-only parameters.
	 * @param proposalHandle - The handle of the summary that was uploaded to the server.
	 * @param parentPath - The path of the parent node which is used to build the path of this node.
	 * @param parentSkipRecursion - true if the parent of this node skipped recursing the child nodes when summarizing.
	 * In that case, the children will not have work-in-progress state.
	 * @param validate - true to validate that the in-progress summary is correct for all nodes.
	 */
	protected completeSummaryCore(proposalHandle: string, parentSkipRecursion: boolean): void {
		assert(
			this.wipReferenceSequenceNumber !== undefined,
			0x1a4 /* "Not tracking a summary" */,
		);
		if (parentSkipRecursion) {
			if (this._lastSummaryReferenceSequenceNumber === undefined) {
				// This case the child is added after the latest non-failure summary.
				// This node and all children should consider themselves as still not
				// having a successful summary yet.
				// We cannot "reuse" this node if unchanged since that summary, because
				// handles will be unable to point to that node. It never made it to the
				// tree itself, and only exists as an attach op in the _outstandingOps.
				this.clearSummary();
				return;
			}
		}

		for (const child of this.children.values()) {
			child.completeSummaryCore(proposalHandle, this.wipSkipRecursion || parentSkipRecursion);
		}
		// Note that this overwrites existing pending summary with
		// the same proposalHandle. If proposalHandle is something like
		// a hash or unique identifier, this should be fine. If storage
		// can return the same proposalHandle for a different summary,
		// this should still be okay, because we should be proposing the
		// newer one later which would have to overwrite the previous one.
		this.pendingSummaries.set(proposalHandle, {
			referenceSequenceNumber: this.wipReferenceSequenceNumber,
		});
		this.clearSummary();
	}

	public clearSummary(): void {
		this.wipReferenceSequenceNumber = undefined;
		this.wipSummarizeCalled = false;
		this.wipSkipRecursion = false;
		this.wipSummaryLogger = undefined;
		for (const child of this.children.values()) {
			child.clearSummary();
		}
	}

	/**
	 * Refreshes the latest summary tracked by this node. If we have a pending summary for the given proposal handle,
	 * it becomes the latest summary. If the current summary is already ahead, we skip the update.
	 * If the current summary is behind, then we do not refresh.
	 * @param proposalHandle - Handle of the generated / uploaded summary.
	 * @param summaryRefSeq - Reference sequence of the acked summary
	 * @returns true if the summary is tracked by this node, false otherwise.
	 */
	public async refreshLatestSummary(
		proposalHandle: string,
		summaryRefSeq: number,
	): Promise<IRefreshSummaryResult> {
		const eventProps: {
			proposalHandle: string | undefined;
			summaryRefSeq: number;
			referenceSequenceNumber: number;
			isSummaryTracked?: boolean;
			pendingSummaryFound?: boolean;
		} = {
			proposalHandle,
			summaryRefSeq,
			referenceSequenceNumber: this.referenceSequenceNumber,
		};
		return PerformanceEvent.timedExecAsync(
			this.logger,
			{
				eventName: "refreshLatestSummary",
				...eventProps,
			},
			async (event) => {
				// Refresh latest summary should not happen while a summary is in progress. If it does, it can result
				// in inconsistent state, so, we should not continue;
				if (this.isSummaryInProgress()) {
					throw new LoggingError("UnexpectedRefreshDuringSummarize", {
						inProgressSummaryRefSeq: this.wipReferenceSequenceNumber,
					});
				}

				let isSummaryTracked = false;
				let isSummaryNewer = false;

				if (summaryRefSeq > this.referenceSequenceNumber) {
					isSummaryNewer = true;
				}

				// If the acked summary is found in the pendingSummaries, it means the summary was created and tracked by the current client
				// so set the isSummaryTracked to true.
				const pendingSummary = this.pendingSummaries.get(proposalHandle);
				if (pendingSummary?.referenceSequenceNumber !== undefined) {
					isSummaryTracked = true;
					// update the pendingSummariesMap for the root and all child summarizerNodes
					this.refreshLatestSummaryFromPending(
						proposalHandle,
						pendingSummary.referenceSequenceNumber,
					);
				}
				event.end({ ...eventProps, isSummaryNewer, pendingSummaryFound: isSummaryTracked });
				return { isSummaryTracked, isSummaryNewer };
			},
			{ start: true, end: true, cancel: "error" },
		);
	}
	/**
	 * Called when we get an ack from the server for a summary we've just sent. Updates the reference state of this node
	 * from the state in the pending summary queue.
	 * @param proposalHandle - Handle for the current proposal.
	 * @param referenceSequenceNumber - Reference sequence number of sent summary.
	 */
	protected refreshLatestSummaryFromPending(
		proposalHandle: string,
		referenceSequenceNumber: number,
	): void {
		const pendingSummary = this.pendingSummaries.get(proposalHandle);
		if (pendingSummary === undefined) {
			// This should only happen if parent skipped recursion AND no prior summary existed.
			assert(
				this._lastSummaryReferenceSequenceNumber === undefined,
				0x1a6 /* "Not found pending summary, but this node has previously completed a summary" */,
			);
			return;
		} else {
			assert(
				referenceSequenceNumber === pendingSummary.referenceSequenceNumber,
				0x1a7 /* Pending summary reference sequence number should be consistent */,
			);

			// Clear earlier pending summaries
			this.pendingSummaries.delete(proposalHandle);
		}

		// Delete all summaries whose reference sequence number is smaller than the one just acked.
		for (const [key, summary] of this.pendingSummaries) {
			if (summary.referenceSequenceNumber < referenceSequenceNumber) {
				this.pendingSummaries.delete(key);
			}
		}
		// Update the latest successful summary reference number
		this._lastSummaryReferenceSequenceNumber = pendingSummary.referenceSequenceNumber;
		// Propagate update to all child nodes
		for (const child of this.children.values()) {
			child.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
		}
	}

	public updateBaseSummaryState(snapshot: ISnapshotTree): void {
		// Function deprecated. Empty declaration is kept around to compat failures.
	}

	public recordChange(op: ISequencedDocumentMessage): void {
		this.invalidate(op.sequenceNumber);
	}

	public invalidate(sequenceNumber: number): void {
		if (sequenceNumber > this._changeSequenceNumber) {
			this._changeSequenceNumber = sequenceNumber;
		}
	}

	/**
	 * True if a change has been recorded with sequence number exceeding
	 * the latest successfully acked summary reference sequence number.
	 * False implies that the previous summary can be reused.
	 */
	protected hasChanged(): boolean {
		return this._changeSequenceNumber > this.referenceSequenceNumber;
	}

	protected readonly canReuseHandle: boolean;

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
		// eslint-disable-next-line import/no-deprecated
		createParam: CreateChildSummarizerNodeParam,
		// eslint-disable-next-line import/no-deprecated
		config: ISummarizerNodeConfig = {},
		// eslint-disable-next-line import/no-deprecated
	): ISummarizerNode {
		// eslint-disable-next-line import/no-deprecated
		assert(!this.children.has(id), 0x1ab /* "Create SummarizerNode child already exists" */);

		const createDetails: ICreateChildDetails = this.getCreateDetailsForChild(id, createParam);
		// eslint-disable-next-line import/no-deprecated
		const child = new SummarizerNode(
			this.logger,
			summarizeInternalFn,
			config,
			createDetails.summaryHandleId,
			createDetails.changeSequenceNumber,
			createDetails.lastSummaryReferenceSequenceNumber,
			this.wipSummaryLogger,
			createDetails.telemetryNodeId,
		);

		// There may be additional state that has to be updated in this child. For example, if a summary is being
		// tracked, the child's summary tracking state needs to be updated too. Same goes for pendingSummaries we might
		// have outstanding on the parent in case we realize nodes in between Summary Op and Summary Ack.
		this.maybeUpdateChildState(child, id);

		this.children.set(id, child);
		return child;
	}

	// eslint-disable-next-line import/no-deprecated
	public getChild(id: string): ISummarizerNode | undefined {
		return this.children.get(id);
	}

	/**
	 * Returns the details needed to create a child node.
	 * @param id - Initial id or path part of the child node.
	 * @param createParam - Information needed to create the node.
	 * @returns the details needed to create the child node.
	 */
	protected getCreateDetailsForChild(
		id: string,
		// eslint-disable-next-line import/no-deprecated
		createParam: CreateChildSummarizerNodeParam,
	): ICreateChildDetails {
		let childLastSummaryReferenceSequenceNumber: number | undefined;
		let changeSequenceNumber: number;

		const parentLastSummaryReferenceSequenceNumber = this._lastSummaryReferenceSequenceNumber;
		switch (createParam.type) {
			// eslint-disable-next-line import/no-deprecated
			case CreateSummarizerNodeSource.FromAttach: {
				if (
					parentLastSummaryReferenceSequenceNumber !== undefined &&
					createParam.sequenceNumber <= parentLastSummaryReferenceSequenceNumber
				) {
					// Prioritize latest summary if it was after this node was attached.
					childLastSummaryReferenceSequenceNumber = parentLastSummaryReferenceSequenceNumber;
				}
				changeSequenceNumber = createParam.sequenceNumber;
				break;
			}
			// eslint-disable-next-line import/no-deprecated
			case CreateSummarizerNodeSource.FromSummary:
			// eslint-disable-next-line import/no-deprecated
			case CreateSummarizerNodeSource.Local: {
				childLastSummaryReferenceSequenceNumber = parentLastSummaryReferenceSequenceNumber;
				changeSequenceNumber = parentLastSummaryReferenceSequenceNumber ?? -1;
				break;
			}
			default: {
				// eslint-disable-next-line import/no-deprecated
				const type = (createParam as unknown as CreateChildSummarizerNodeParam).type;
				// eslint-disable-next-line import/no-deprecated
				unreachableCase(createParam, `Unexpected CreateSummarizerNodeSource: ${type}`);
			}
		}

		const childTelemetryNodeId = `${this.telemetryNodeId ?? ""}/${id}`;
		const childSummaryHandleId = this._summaryHandleId.createChildPath(EscapedPath.create(id));

		return {
			changeSequenceNumber,
			telemetryNodeId: childTelemetryNodeId,
			summaryHandleId: childSummaryHandleId,
			lastSummaryReferenceSequenceNumber: childLastSummaryReferenceSequenceNumber,
		};
	}

	/**
	 * Updates the state of the child if required. For example, if a summary is currently being  tracked, the child's
	 * summary tracking state needs to be updated too.
	 * Also, in case a child node gets realized in between Summary Op and Summary Ack, let's initialize the child's
	 * pending summary as well.
	 * @param child - The child node whose state is to be updated.
	 * @param id - Initial id or path part of this node
	 *
	 */
	// eslint-disable-next-line import/no-deprecated
	protected maybeUpdateChildState(child: SummarizerNode, id: string): void {
		// If a summary is in progress, this child was created after the summary started. So, we need to update the
		// child's summary state as well.
		if (this.isSummaryInProgress()) {
			child.wipReferenceSequenceNumber = this.wipReferenceSequenceNumber;
		}
		// In case we have pending summaries on the parent, let's initialize it on the child.
		if (child._lastSummaryReferenceSequenceNumber !== undefined) {
			this.pendingSummaries.forEach((pendingSummaryInfo, proposedHandle) => {
				child.addPendingSummary(proposedHandle, pendingSummaryInfo);
			});
		}
	}

	protected addPendingSummary(key: string, pendingSummaryInfo: PendingSummaryInfo): void {
		this.pendingSummaries.set(key, pendingSummaryInfo);
	}

	/**
	 * Tells whether summary tracking is in progress. True if "startSummary" API is called before summarize.
	 */
	public isSummaryInProgress(): boolean {
		return this.wipReferenceSequenceNumber !== undefined;
	}

	/**
	 * Creates and throws an error due to unexpected conditions.
	 */
	protected throwUnexpectedError(eventProps: ITelemetryErrorEventExt): never {
		const error = new LoggingError(eventProps.eventName, {
			...eventProps,
			referenceSequenceNumber: this.wipReferenceSequenceNumber,
			...tagCodeArtifacts({
				id: this.telemetryNodeId,
			}),
		});
		this.logger.sendErrorEvent(eventProps, error);
		throw error;
	}
}

/**
 * Creates a root summarizer node.
 *@param logger - Logger to use within SummarizerNode
 * @param summarizeInternalFn - Function to generate summary
 * @param changeSequenceNumber - Sequence number of latest change to new node/subtree
 * @param referenceSequenceNumber - Reference sequence number of last acked summary,
 * or undefined if not loaded from summary
 * @param config - Configure behavior of summarizer node
 */
// eslint-disable-next-line import/no-deprecated
export const createRootSummarizerNode = (
	logger: ITelemetryLoggerExt,
	summarizeInternalFn: SummarizeInternalFn,
	changeSequenceNumber: number,
	referenceSequenceNumber: number | undefined,
	// eslint-disable-next-line import/no-deprecated
	config: ISummarizerNodeConfig = {},
	// eslint-disable-next-line import/no-deprecated
): IRootSummarizerNode =>
	// eslint-disable-next-line import/no-deprecated
	new SummarizerNode(
		logger,
		summarizeInternalFn,
		config,
		EscapedPath.create("") /* summaryHandleId */,
		changeSequenceNumber,
		referenceSequenceNumber,
		undefined /* wipSummaryLogger */,
		"" /* telemetryNodeId */,
	);
