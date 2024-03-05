/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	ISummarizerNode,
	ISummarizerNodeConfig,
	ISummarizeResult,
	CreateChildSummarizerNodeParam,
	CreateSummarizerNodeSource,
	SummarizeInternalFn,
	ITelemetryContext,
	IExperimentalIncrementalSummaryContext,
} from "@fluidframework/runtime-definitions";
import {
	ISequencedDocumentMessage,
	SummaryType,
	ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
	ITelemetryLoggerExt,
	createChildLogger,
	LoggingError,
	PerformanceEvent,
	TelemetryDataTag,
	tagCodeArtifacts,
	type ITelemetryErrorEventExt,
} from "@fluidframework/telemetry-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { mergeStats } from "@fluidframework/runtime-utils";
import {
	EscapedPath,
	ICreateChildDetails,
	IRefreshSummaryResult,
	IStartSummaryResult,
	ISummarizerNodeRootContract,
	parseSummaryForSubtrees,
	SummaryNode,
	ValidateSummaryResult,
} from "./summarizerNodeUtils.js";

export interface IRootSummarizerNode extends ISummarizerNode, ISummarizerNodeRootContract {}

/**
 * Encapsulates the summarizing work and state of an individual tree node in the
 * summary tree. It tracks changes and allows for optimizations when unchanged, or
 * can allow for fallback summaries to be generated when an error is encountered.
 * Usage is for the root node to call startSummary first to begin tracking a WIP
 * (work in progress) summary. Then all nodes will call summarize to summaries their
 * individual parts. Once completed and uploaded to storage, the root node will call
 * completeSummary or clearSummary to clear the WIP summary tracking state if something
 * went wrong. The SummarizerNodes will track all pending summaries that have been
 * recorded by the completeSummary call. When one of them is acked, the root node should
 * call refreshLatestSummary to inform the tree of SummarizerNodes of the new baseline
 * latest successful summary.
 */
export class SummarizerNode implements IRootSummarizerNode {
	/**
	 * The reference sequence number of the most recent acked summary.
	 * Returns 0 if there is not yet an acked summary.
	 */
	public get referenceSequenceNumber() {
		return this._latestSummary?.referenceSequenceNumber ?? 0;
	}

	protected readonly children = new Map<string, SummarizerNode>();
	protected readonly pendingSummaries = new Map<string, SummaryNode>();
	protected wipReferenceSequenceNumber: number | undefined;
	private wipLocalPaths: { localPath: EscapedPath; additionalPath?: EscapedPath } | undefined;
	private wipSkipRecursion = false;

	protected readonly logger: ITelemetryLoggerExt;

	/**
	 * Do not call constructor directly.
	 * Use createRootSummarizerNode to create root node, or createChild to create child nodes.
	 */
	public constructor(
		baseLogger: ITelemetryBaseLogger,
		private readonly summarizeInternalFn: SummarizeInternalFn,
		config: ISummarizerNodeConfig,
		private _changeSequenceNumber: number,
		/** Undefined means created without summary */
		private _latestSummary?: SummaryNode,
		protected wipSummaryLogger?: ITelemetryBaseLogger,
		/** A unique id of this node to be logged when sending telemetry. */
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

		let nodes = 1;
		let invalidNodes = 0;
		const sequenceNumberMismatchKeySet = new Set<string>();
		const nodeLatestSummaryRefSeqNum = this._latestSummary?.referenceSequenceNumber;
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
		assert(
			this.isSummaryInProgress(),
			0x1a1 /* "summarize should not be called when not tracking the summary" */,
		);
		assert(
			this.wipSummaryLogger !== undefined,
			0x1a2 /* "wipSummaryLogger should have been set in startSummary or ctor" */,
		);

		// Try to reuse the tree if unchanged
		if (this.canReuseHandle && !fullTree && !this.hasChanged()) {
			const latestSummary = this._latestSummary;
			if (latestSummary !== undefined) {
				this.wipLocalPaths = {
					localPath: latestSummary.localPath,
					additionalPath: latestSummary.additionalPath,
				};
				this.wipSkipRecursion = true;
				const stats = mergeStats();
				stats.handleNodeCount++;
				return {
					summary: {
						type: SummaryType.Handle,
						handle: latestSummary.fullPath.path,
						handleType: SummaryType.Tree,
					},
					stats,
				};
			}
		}

		// This assert is the same the other 0a1x1 assert `isSummaryInProgress`, the only difference is that typescript
		// complains if this assert isn't done this way
		assert(
			this.wipReferenceSequenceNumber !== undefined,
			0x5df /* Summarize should not be called when not tracking the summary */,
		);
		const incrementalSummaryContext: IExperimentalIncrementalSummaryContext | undefined =
			this._latestSummary !== undefined
				? {
						summarySequenceNumber: this.wipReferenceSequenceNumber,
						latestSummarySequenceNumber: this._latestSummary.referenceSequenceNumber,
						// TODO: remove summaryPath
						summaryPath: this._latestSummary.fullPath.path,
				  }
				: undefined;

		const result = await this.summarizeInternalFn(
			fullTree,
			true,
			telemetryContext,
			incrementalSummaryContext,
		);
		this.wipLocalPaths = { localPath: EscapedPath.create(result.id) };
		if (result.pathPartsForChildren !== undefined) {
			this.wipLocalPaths.additionalPath = EscapedPath.createAndConcat(
				result.pathPartsForChildren,
			);
		}
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
		// Otherwise, summarize should have been called on this node and wipLocalPaths must be set.
		if (parentSkipRecursion || this.wipLocalPaths !== undefined) {
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
	public completeSummary(proposalHandle: string, validate: boolean) {
		this.completeSummaryCore(
			proposalHandle,
			undefined /* parentPath */,
			false /* parentSkipRecursion */,
			validate,
		);
	}

	/**
	 * Recursive implementation for completeSummary, with additional internal-only parameters.
	 * @param proposalHandle - The handle of the summary that was uploaded to the server.
	 * @param parentPath - The path of the parent node which is used to build the path of this node.
	 * @param parentSkipRecursion - true if the parent of this node skipped recursing the child nodes when summarizing.
	 * In that case, the children will not have work-in-progress state.
	 * @param validate - true to validate that the in-progress summary is correct for all nodes.
	 */
	protected completeSummaryCore(
		proposalHandle: string,
		parentPath: EscapedPath | undefined,
		parentSkipRecursion: boolean,
		validate: boolean,
	) {
		if (validate && this.wasSummarizeMissed(parentSkipRecursion)) {
			this.throwUnexpectedError({
				eventName: "NodeDidNotSummarize",
				proposalHandle,
			});
		}

		assert(this.wipReferenceSequenceNumber !== undefined, 0x1a4 /* "Not tracking a summary" */);
		let localPathsToUse = this.wipLocalPaths;

		if (parentSkipRecursion) {
			const latestSummary = this._latestSummary;
			if (latestSummary !== undefined) {
				// This case the parent node created a failure summary or was reused.
				// This node and all children should only try to reference their path
				// by its last known good state in the actual summary tree.
				// If parent fails or is reused, the child summarize is not called so
				// it did not get a chance to change its paths.
				// In this case, essentially only propagate the new summary ref seq num.
				localPathsToUse = {
					localPath: latestSummary.localPath,
					additionalPath: latestSummary.additionalPath,
				};
			} else {
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

		// If localPathsToUse is undefined, it means summarize didn't run for this node and in that case the validate
		// step should have failed.
		assert(localPathsToUse !== undefined, 0x6fe /* summarize didn't run for node */);
		const summary = new SummaryNode({
			...localPathsToUse,
			referenceSequenceNumber: this.wipReferenceSequenceNumber,
			basePath: parentPath,
		});
		const fullPathForChildren = summary.fullPathForChildren;
		for (const child of this.children.values()) {
			child.completeSummaryCore(
				proposalHandle,
				fullPathForChildren,
				this.wipSkipRecursion || parentSkipRecursion,
				validate,
			);
		}
		// Note that this overwrites existing pending summary with
		// the same proposalHandle. If proposalHandle is something like
		// a hash or unique identifier, this should be fine. If storage
		// can return the same proposalHandle for a different summary,
		// this should still be okay, because we should be proposing the
		// newer one later which would have to overwrite the previous one.
		this.pendingSummaries.set(proposalHandle, summary);
		this.clearSummary();
	}

	public clearSummary() {
		this.wipReferenceSequenceNumber = undefined;
		this.wipLocalPaths = undefined;
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
	 *
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
				const maybeSummaryNode = this.pendingSummaries.get(proposalHandle);
				if (maybeSummaryNode !== undefined) {
					this.refreshLatestSummaryFromPending(
						proposalHandle,
						maybeSummaryNode.referenceSequenceNumber,
					);
					isSummaryTracked = true;
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
		const summaryNode = this.pendingSummaries.get(proposalHandle);
		if (summaryNode === undefined) {
			// This should only happen if parent skipped recursion AND no prior summary existed.
			assert(
				this._latestSummary === undefined,
				0x1a6 /* "Not found pending summary, but this node has previously completed a summary" */,
			);
			return;
		} else {
			assert(
				referenceSequenceNumber === summaryNode.referenceSequenceNumber,
				0x1a7 /* Pending summary reference sequence number should be consistent */,
			);

			// Clear earlier pending summaries
			this.pendingSummaries.delete(proposalHandle);
		}

		this.refreshLatestSummaryCore(referenceSequenceNumber);

		this._latestSummary = summaryNode;
		// Propagate update to all child nodes
		for (const child of this.children.values()) {
			child.refreshLatestSummaryFromPending(proposalHandle, referenceSequenceNumber);
		}
	}

	private refreshLatestSummaryCore(referenceSequenceNumber: number): void {
		for (const [key, value] of this.pendingSummaries) {
			if (value.referenceSequenceNumber < referenceSequenceNumber) {
				this.pendingSummaries.delete(key);
			}
		}
	}

	public updateBaseSummaryState(snapshot: ISnapshotTree) {
		// Check base summary to see if it has any additional path parts
		// separating child SummarizerNodes. Checks for .channels subtrees.
		const { childrenPathPart } = parseSummaryForSubtrees(snapshot);
		if (childrenPathPart !== undefined && this._latestSummary !== undefined) {
			this._latestSummary.additionalPath = EscapedPath.create(childrenPathPart);
		}
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

	public get latestSummary(): Readonly<SummaryNode> | undefined {
		return this._latestSummary;
	}

	protected readonly canReuseHandle: boolean;

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
		config: ISummarizerNodeConfig = {},
	): ISummarizerNode {
		assert(!this.children.has(id), 0x1ab /* "Create SummarizerNode child already exists" */);

		const createDetails: ICreateChildDetails = this.getCreateDetailsForChild(id, createParam);
		const child = new SummarizerNode(
			this.logger,
			summarizeInternalFn,
			config,
			createDetails.changeSequenceNumber,
			createDetails.latestSummary,
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
		createParam: CreateChildSummarizerNodeParam,
	): ICreateChildDetails {
		let latestSummary: SummaryNode | undefined;
		let changeSequenceNumber: number;

		const parentLatestSummary = this._latestSummary;
		switch (createParam.type) {
			case CreateSummarizerNodeSource.FromAttach: {
				if (
					parentLatestSummary !== undefined &&
					createParam.sequenceNumber <= parentLatestSummary.referenceSequenceNumber
				) {
					// Prioritize latest summary if it was after this node was attached.
					latestSummary = parentLatestSummary.createForChild(id);
				}
				changeSequenceNumber = createParam.sequenceNumber;
				break;
			}
			case CreateSummarizerNodeSource.FromSummary:
			case CreateSummarizerNodeSource.Local: {
				latestSummary = parentLatestSummary?.createForChild(id);
				changeSequenceNumber = parentLatestSummary?.referenceSequenceNumber ?? -1;
				break;
			}
			default: {
				const type = (createParam as unknown as CreateChildSummarizerNodeParam).type;
				unreachableCase(createParam, `Unexpected CreateSummarizerNodeSource: ${type}`);
			}
		}

		const childTelemetryNodeId = `${this.telemetryNodeId ?? ""}/${id}`;

		return {
			latestSummary,
			changeSequenceNumber,
			telemetryNodeId: childTelemetryNodeId,
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
	protected maybeUpdateChildState(child: SummarizerNode, id: string) {
		// If a summary is in progress, this child was created after the summary started. So, we need to update the
		// child's summary state as well.
		if (this.isSummaryInProgress()) {
			child.wipReferenceSequenceNumber = this.wipReferenceSequenceNumber;
		}
		// In case we have pending summaries on the parent, let's initialize it on the child.
		if (child._latestSummary !== undefined) {
			for (const [key, value] of this.pendingSummaries.entries()) {
				const newLatestSummaryNode = new SummaryNode({
					referenceSequenceNumber: value.referenceSequenceNumber,
					basePath: child._latestSummary.basePath,
					localPath: child._latestSummary.localPath,
				});

				child.addPendingSummary(key, newLatestSummaryNode);
			}
		}
	}

	protected addPendingSummary(key: string, summary: SummaryNode) {
		this.pendingSummaries.set(key, summary);
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
 * @param logger - Logger to use within SummarizerNode
 * @param summarizeInternalFn - Function to generate summary
 * @param changeSequenceNumber - Sequence number of latest change to new node/subtree
 * @param referenceSequenceNumber - Reference sequence number of last acked summary,
 * or undefined if not loaded from summary
 * @param config - Configure behavior of summarizer node
 */
export const createRootSummarizerNode = (
	logger: ITelemetryLoggerExt,
	summarizeInternalFn: SummarizeInternalFn,
	changeSequenceNumber: number,
	referenceSequenceNumber: number | undefined,
	config: ISummarizerNodeConfig = {},
): IRootSummarizerNode =>
	new SummarizerNode(
		logger,
		summarizeInternalFn,
		config,
		changeSequenceNumber,
		referenceSequenceNumber === undefined
			? undefined
			: SummaryNode.createForRoot(referenceSequenceNumber),
		undefined /* wipSummaryLogger */,
		"" /* telemetryNodeId */,
	);
