/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, isPromiseLike } from "@fluidframework/core-utils/internal";
import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import {
	gcTreeKey,
	type ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import {
	addSummarizeResultToSummary,
	calculateStats,
} from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Context provided when generating an application-owned summary projection.
 *
 * @legacy @beta
 */
export interface IApplicationSummaryProjectionContext {
	/**
	 * Whether this summary attempt must write a full tree with no incremental handle reuse.
	 */
	readonly fullTree: boolean;
	/**
	 * Whether this summary attempt is being tracked for later acceptance.
	 */
	readonly trackState: boolean;
	/**
	 * The reference sequence number identifying the document state being summarized.
	 */
	readonly referenceSequenceNumber: number;
	/**
	 * The previously accepted summary that incremental handles may target.
	 */
	readonly previousSummary: ISummaryContext | undefined;
}

/**
 * Result returned by an application summary projection.
 *
 * @legacy @beta
 */
export interface IApplicationSummaryProjectionResult {
	/**
	 * Application-owned summary subtree to add at the runtime summary root.
	 */
	readonly summary: ISummaryTree;
	/**
	 * Called after this exact generated projection is acknowledged and adopted.
	 */
	readonly onAccepted?: (context: ISummaryContext) => void;
}

/**
 * Application callback that contributes one additional summary subtree.
 *
 * @legacy @beta
 */
export interface IApplicationSummaryProjection {
	/**
	 * Root key for this application-owned subtree.
	 */
	readonly key: string;
	/**
	 * Generate the application-owned subtree for the current summary attempt.
	 */
	summarize(
		context: IApplicationSummaryProjectionContext,
	): IApplicationSummaryProjectionResult | Promise<IApplicationSummaryProjectionResult>;
}

/**
 * Generated projection state retained until the summary op is submitted.
 *
 * @internal
 */
export interface IGeneratedApplicationSummaryProjection {
	readonly context: ISummaryContext;
	readonly onAccepted: IApplicationSummaryProjectionResult["onAccepted"];
}

const reservedKeys = new Set<string>([
	".channels",
	".metadata",
	".electedSummarizer",
	gcTreeKey,
	"prototype",
]);

/**
 * Validates an application projection key.
 *
 * @internal
 */
export function validateApplicationSummaryProjectionKey(key: string): void {
	if (
		key.length === 0 ||
		key.includes("/") ||
		key.includes("\\") ||
		reservedKeys.has(key) ||
		key in Object.prototype
	) {
		throw new UsageError("Invalid or reserved application summary projection key");
	}
}

/**
 * Coordinates application-owned summary projection generation and acceptance.
 *
 * @internal
 */
export class ApplicationSummaryProjectionController {
	private readonly loadedSummaryContext: ISummaryContext | undefined;
	private acceptedSummaryContext: ISummaryContext | undefined;
	private readonly generatedSummaries = new WeakMap<
		ISummaryTree,
		IGeneratedApplicationSummaryProjection
	>();
	private readonly pendingSummaries = new Map<
		string,
		IGeneratedApplicationSummaryProjection
	>();

	public constructor(
		private readonly projection: IApplicationSummaryProjection,
		loadedSummaryContext?: ISummaryContext,
	) {
		validateApplicationSummaryProjectionKey(projection.key);
		this.loadedSummaryContext =
			loadedSummaryContext === undefined
				? undefined
				: Object.freeze({ ...loadedSummaryContext });
	}

	public get previousSummary(): ISummaryContext | undefined {
		return this.acceptedSummaryContext ?? this.loadedSummaryContext;
	}

	public async summarize(
		summaryTree: ISummaryTreeWithStats,
		context: IApplicationSummaryProjectionContext,
		isSummaryInProgress: boolean,
	): Promise<void> {
		assert(
			summaryTree.summary.type === SummaryType.Tree,
			"Runtime summary root must be a tree",
		);
		if (this.projection.key in summaryTree.summary.tree) {
			throw new UsageError(
				"Application summary projection key collides with an existing summary root",
			);
		}

		const result = await this.projection.summarize(context);
		this.validateSummaryResult(result.summary, context);
		addSummarizeResultToSummary(summaryTree, this.projection.key, {
			summary: result.summary,
			stats: calculateStats(result.summary),
		});

		if (context.trackState && isSummaryInProgress) {
			const generated: IGeneratedApplicationSummaryProjection = {
				context: Object.freeze({
					proposalHandle: undefined,
					ackHandle: context.previousSummary?.ackHandle,
					referenceSequenceNumber: context.referenceSequenceNumber,
				}),
				onAccepted: result.onAccepted,
			};
			this.generatedSummaries.set(summaryTree.summary, generated);
		}
	}

	public takeGeneratedSummary(
		summary: ISummaryTree,
	): IGeneratedApplicationSummaryProjection | undefined {
		const generated = this.generatedSummaries.get(summary);
		this.generatedSummaries.delete(summary);
		return generated;
	}

	public completeSummary(
		proposalHandle: string,
		generation: IGeneratedApplicationSummaryProjection | undefined,
	): void {
		if (generation !== undefined) {
			this.pendingSummaries.set(proposalHandle, generation);
		}
	}

	public async refreshLatestSummaryAck(
		options: { proposalHandle: string | undefined; ackHandle: string; summaryRefSeq: number },
		isTracked: boolean,
	): Promise<void> {
		if (!isTracked) {
			return;
		}
		const { proposalHandle, ackHandle, summaryRefSeq } = options;
		assert(
			proposalHandle !== undefined,
			"Tracked summary acknowledgment must identify its proposal",
		);
		const generation = this.pendingSummaries.get(proposalHandle);
		if (generation === undefined) {
			return;
		}
		assert(
			generation.context.referenceSequenceNumber === summaryRefSeq,
			"Summary acknowledgment reference sequence number must match the generated projection",
		);
		this.pendingSummaries.delete(proposalHandle);
		this.acceptedSummaryContext = Object.freeze({
			proposalHandle,
			ackHandle,
			referenceSequenceNumber: summaryRefSeq,
		});
		for (const [pendingHandle, pendingGeneration] of this.pendingSummaries) {
			if (pendingGeneration.context.referenceSequenceNumber < summaryRefSeq) {
				this.pendingSummaries.delete(pendingHandle);
			}
		}
		const maybePromise = generation.onAccepted?.(this.acceptedSummaryContext);
		if (isPromiseLike(maybePromise)) {
			throw new UsageError(
				"Application summary projection onAccepted callback must be synchronous",
			);
		}
	}

	public dispose(): void {
		this.pendingSummaries.clear();
	}

	private validateSummaryResult(
		summary: ISummaryTree,
		context: IApplicationSummaryProjectionContext,
	): void {
		if (summary.type !== SummaryType.Tree) {
			throw new UsageError("Application summary projection must return a summary tree");
		}
		const containsHandle = this.containsHandle(summary);
		if (containsHandle && (context.fullTree || context.previousSummary === undefined)) {
			throw new UsageError(
				"Application summary projection cannot return summary handles without a previous summary",
			);
		}
	}

	private containsHandle(summary: ISummaryTree): boolean {
		for (const value of Object.values(summary.tree)) {
			if (value.type === SummaryType.Handle) {
				return true;
			}
			if (value.type === SummaryType.Tree && this.containsHandle(value)) {
				return true;
			}
		}
		return false;
	}
}
