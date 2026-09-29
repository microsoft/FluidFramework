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
import { UsageError, wrapError } from "@fluidframework/telemetry-utils/internal";

import type { IApplicationProjectionSummary } from "../containerRuntime.js";
import type { IRefreshSummaryResult } from "./summarizerNode/index.js";
import type { IRefreshSummaryAckOptions } from "./summarizerTypes.js";
import type {
	ISummaryGenerationContext,
	ISummaryGenerationOptions,
} from "./summaryGenerationTypes.js";

/**
 * Application state captured while generating one summary.
 * The controller stores this under a weak tree key until submission associates it with a proposal handle.
 * Retaining the captured callback per submitted proposal allows a late acknowledgment to promote
 * that proposal's state rather than state captured by a newer attempt.
 */
export interface IPendingSummaryGeneration {
	/**
	 * Effective full-tree requirement, reference sequence number, and parent used by this attempt.
	 */
	readonly context: ISummaryGenerationContext;
	/**
	 * Optional synchronous promotion of the application state captured by this attempt.
	 */
	readonly onAccepted: IApplicationProjectionSummary["onAccepted"];
}

/**
 * Runtime effects needed to coordinate acceptance without transferring ownership of summarizer nodes or garbage collection.
 */
interface ISummaryGenerationHost {
	/** Refresh the summarizer nodes and report whether this proposal is tracked. */
	refreshSummary(
		proposalHandle: string,
		referenceSequenceNumber: number,
	): Promise<IRefreshSummaryResult>;
	/** Refresh garbage-collection state captured for this same tracked proposal. */
	refreshGC(result: IRefreshSummaryResult, proposalHandle: string): Promise<void>;
	/** Fetch a newer untracked summary and apply the runtime's existing close/retry behavior. */
	handleUntrackedSummary(options: IRefreshSummaryAckOptions): Promise<void>;
	/** Reject generation or promotion if the runtime closed during asynchronous work. */
	verifyNotClosed(): void;
	/** Detect checkpoint movement while an application projection awaits. */
	getReferenceSequenceNumber(): number;
	/** Close the runtime when partially completed acceptance cannot be rolled back. */
	close(error: UsageError): void;
}

/**
 * Copy and validate factory configuration before load performs asynchronous work.
 * The caller can subsequently mutate its objects without replacing this runtime's policy or callback.
 */
export function captureSummaryGenerationOptions(
	options: ISummaryGenerationOptions | undefined,
): ISummaryGenerationOptions | undefined {
	if (options === undefined) return undefined;
	const captured = {
		...options,
		additionalRootTree:
			options.additionalRootTree === undefined ? undefined : { ...options.additionalRootTree },
	};
	if (
		captured.fullTreePolicy !== undefined &&
		captured.fullTreePolicy !== "default" &&
		captured.fullTreePolicy !== "untilFirstAck" &&
		captured.fullTreePolicy !== "always"
	) {
		throw new UsageError("Invalid full-tree summary policy");
	}
	const key = captured.additionalRootTree?.key;
	if (
		key !== undefined &&
		(key.length === 0 ||
			key.includes("/") ||
			key.includes("\\") ||
			encodeURIComponent(key) !== key ||
			key.startsWith(".") ||
			key === gcTreeKey ||
			key === "prototype" ||
			key in Object.prototype)
	) {
		throw new UsageError("Invalid or reserved additional summary root key");
	}
	const projection = captured.additionalRootTree;
	if (
		projection !== undefined &&
		(typeof projection.summarize !== "function" ||
			(projection.createSummary !== undefined &&
				typeof projection.createSummary !== "function"))
	) {
		throw new UsageError("Invalid additional summary callbacks");
	}
	return captured;
}

/**
 * Own factory-selected summary policy, application projection capture, and proposal-correlated acceptance.
 * The runtime retains the existing generation/upload/submit pipeline and delegates refresh effects through the host.
 */
export class SummaryGenerationController {
	/** Original storage parent, whose reference sequence number does not advance as operations arrive. */
	private readonly loadedSummaryContext: ISummaryContext | undefined;
	/** Parent adopted only after the matching summarizer-node and garbage-collection refresh. */
	private acceptedSummaryContext: ISummaryContext | undefined;
	/** Set only after successful synchronous application promotion of a full tracked proposal. */
	private hasAcceptedFullSummary = false;
	/** Strongly retain callbacks only for submitted proposals that can still be acknowledged. */
	private readonly pendingSummaryGenerations = new Map<string, IPendingSummaryGeneration>();
	/** Generated-only trees do not keep captures alive after callers release the tree. */
	private readonly generatedSummaryStates = new WeakMap<
		ISummaryTree,
		IPendingSummaryGeneration
	>();
	/** A partially failed acceptance is terminal because prior refresh effects cannot be undone. */
	private summaryAcceptanceError: UsageError | undefined;
	/** Settled continuation used to order all incoming acknowledgments, including duplicates. */
	private summaryAckRefresh: Promise<void> = Promise.resolve();
	/** Include queued as well as currently running refreshes in the generation guard. */
	private pendingSummaryAckRefreshes = 0;

	/**
	 * Retain the original loaded parent independently of subsequent operation processing.
	 * Options have already been copied before runtime loading; host effects run only during acceptance.
	 */
	public constructor(
		private readonly options: ISummaryGenerationOptions | undefined,
		loadedVersionId: string | undefined,
		initialSequenceNumber: number,
		private readonly host: ISummaryGenerationHost,
	) {
		this.loadedSummaryContext =
			loadedVersionId === undefined
				? undefined
				: Object.freeze({
						proposalHandle: undefined,
						ackHandle: loadedVersionId,
						referenceSequenceNumber: initialSequenceNumber,
					});
	}

	/**
	 * Return the last locally adopted parent, without substituting the original loaded version.
	 * The runtime uses object identity to detect adoption while an attempt is in progress.
	 */
	public get latestAcceptedSummary(): ISummaryContext | undefined {
		return this.acceptedSummaryContext;
	}

	/**
	 * Return the exact parent against which an incremental application's handles must resolve.
	 */
	public get previousSummary(): ISummaryContext | undefined {
		return this.acceptedSummaryContext ?? this.loadedSummaryContext;
	}

	/**
	 * Whether enabled summary heuristics must request an initial full summary without application edits.
	 */
	public get shouldSummarizeOnStartup(): boolean {
		return this.options?.fullTreePolicy === "untilFirstAck" && !this.hasAcceptedFullSummary;
	}

	/**
	 * Honor explicit full-tree requests and the captured policy.
	 * Generation cannot start during acceptance or after acceptance fails because the parent may be partially updated.
	 */
	public shouldProduceFullSummary(requestedFullTree: boolean): boolean {
		if (this.summaryAcceptanceError !== undefined) throw this.summaryAcceptanceError;
		if (this.pendingSummaryAckRefreshes > 0) {
			throw new UsageError("Cannot generate a summary during summary acceptance");
		}
		return (
			requestedFullTree ||
			this.options?.fullTreePolicy === "always" ||
			this.shouldSummarizeOnStartup
		);
	}

	/**
	 * Capture optional application content synchronously for attachment or detached serialization.
	 */
	public createSummary(
		summaryTree: ISummaryTreeWithStats,
		context: ISummaryGenerationContext,
	): void {
		const projection = this.options?.additionalRootTree;
		if (projection?.createSummary === undefined) return;
		this.verifyRootKeyAvailable(summaryTree.summary, projection.key);
		const result = projection.createSummary(context);
		if (isPromiseLike(result)) {
			// Observe a rejected asynchronous result as well as rejecting the unsupported return shape.
			Promise.resolve(result).catch(() => {});
			throw new UsageError(
				"Additional summary createSummary callback must synchronously return a tree result",
			);
		}
		if (result !== undefined) {
			this.addAdditionalRootTreeToSummary(summaryTree, projection.key, context, result);
		}
	}

	/**
	 * Await normal projection generation and retain only this attempt's acceptance state.
	 * Submission owns the inbound pause; direct callers must keep their model stable across awaits.
	 */
	public async summarize(
		summaryTree: ISummaryTreeWithStats,
		context: ISummaryGenerationContext,
		isSummaryInProgress: boolean,
	): Promise<void> {
		const projection = this.options?.additionalRootTree;
		let onAccepted: IApplicationProjectionSummary["onAccepted"];
		if (projection !== undefined) {
			this.verifyRootKeyAvailable(summaryTree.summary, projection.key);
			const result = await projection.summarize(context);
			this.host.verifyNotClosed();
			this.shouldProduceFullSummary(context.fullTree);
			if (
				context.referenceSequenceNumber !== this.host.getReferenceSequenceNumber() ||
				context.previousSummary !== this.previousSummary
			) {
				throw new UsageError(
					"Summary checkpoint or parent changed during application projection",
				);
			}
			onAccepted = this.addAdditionalRootTreeToSummary(
				summaryTree,
				projection.key,
				context,
				result,
			);
		}
		if (context.trackState && isSummaryInProgress) {
			this.generatedSummaryStates.set(summaryTree.summary, { context, onAccepted });
		}
	}

	/** Reject future native-key collisions before invoking application code. */
	private verifyRootKeyAvailable(summary: ISummaryTree, key: string): void {
		if (key in summary.tree) {
			throw new UsageError("Additional summary root key collides with a native root entry");
		}
	}

	/** Validate and insert an application tree identically on both generation paths. */
	private addAdditionalRootTreeToSummary(
		summaryTree: ISummaryTreeWithStats,
		key: string,
		context: ISummaryGenerationContext,
		result: IApplicationProjectionSummary,
	): IApplicationProjectionSummary["onAccepted"] {
		if (isPromiseLike(result?.summary)) {
			Promise.resolve(result.summary).catch(() => {});
			throw new UsageError("Additional summary callback must return a tree result");
		}
		if (result?.summary?.type !== SummaryType.Tree) {
			throw new UsageError("Additional summary callback must return a tree result");
		}
		const onAccepted = result.onAccepted;
		if (onAccepted !== undefined && typeof onAccepted !== "function") {
			throw new UsageError("Additional summary acceptance callback must be a function");
		}
		const { summary } = result;
		const stats = calculateStats(summary);
		if (
			stats.handleNodeCount > 0 &&
			(context.fullTree || context.previousSummary === undefined)
		) {
			throw new UsageError(
				"Additional summary handles require an incremental attempt with an accepted or loaded parent",
			);
		}
		addSummarizeResultToSummary(summaryTree, key, { summary, stats });
		return onAccepted;
	}

	/**
	 * Transfer one generated tree's capture to the submitting attempt.
	 * Failed or unsubmitted attempts leave no strong reference to the callback in this controller.
	 */
	public takeGeneratedSummary(summary: ISummaryTree): IPendingSummaryGeneration | undefined {
		const generation = this.generatedSummaryStates.get(summary);
		this.generatedSummaryStates.delete(summary);
		return generation;
	}

	/**
	 * Retain the capture only after both summarizer nodes and garbage collection completed this submitted proposal.
	 */
	public completeSummary(
		proposalHandle: string,
		generation: IPendingSummaryGeneration | undefined,
	): void {
		assert(generation !== undefined, "Submitted summary generation must be tracked");
		this.pendingSummaryGenerations.set(proposalHandle, generation);
	}

	/**
	 * Serialize acknowledgments and block generation until every queued refresh completes.
	 * Duplicate, delayed, and remote acknowledgments still pass through the summarizer nodes' correspondence check.
	 */
	public async refreshLatestSummaryAck(options: IRefreshSummaryAckOptions): Promise<void> {
		this.pendingSummaryAckRefreshes++;
		const refresh = this.summaryAckRefresh.then(async () => {
			try {
				if (this.summaryAcceptanceError !== undefined) throw this.summaryAcceptanceError;
				await this.refreshLatestSummaryAckCore(options);
			} finally {
				this.pendingSummaryAckRefreshes--;
			}
		});
		this.summaryAckRefresh = refresh.catch(() => {});
		return refresh;
	}

	/**
	 * Adopt a tracked proposal in summarizer-node, garbage-collection, parent, then application order.
	 * Untracked acknowledgments preserve the existing cache-refresh behavior but cannot promote policy or callbacks.
	 */
	private async refreshLatestSummaryAckCore(
		options: IRefreshSummaryAckOptions,
	): Promise<void> {
		const { proposalHandle, ackHandle, summaryRefSeq } = options;
		assert(proposalHandle !== undefined, "Summary acknowledgment must identify its proposal");
		const result = await this.host
			.refreshSummary(proposalHandle, summaryRefSeq)
			.catch((error: unknown) => this.failSummaryAcceptance(error));
		if (!result.isSummaryTracked) {
			// A newer remote ACK still refreshes the snapshot cache and may close this summarizer.
			// The host retains the existing behavior when storage is older than the ACK (for example, after rollback).
			if (result.isSummaryNewer) await this.host.handleUntrackedSummary(options);
			return;
		}
		try {
			const generation = this.pendingSummaryGenerations.get(proposalHandle);
			assert(generation !== undefined, "Tracked summary must have matching generation state");
			assert(
				generation.context.referenceSequenceNumber === summaryRefSeq,
				"Accepted proposal must match its generated checkpoint",
			);
			await this.host.refreshGC(result, proposalHandle);
			this.host.verifyNotClosed();
			this.acceptedSummaryContext = Object.freeze({
				proposalHandle,
				ackHandle,
				referenceSequenceNumber: summaryRefSeq,
			});
			this.pendingSummaryGenerations.delete(proposalHandle);
			for (const [handle, pending] of this.pendingSummaryGenerations) {
				if (pending.context.referenceSequenceNumber < summaryRefSeq) {
					this.pendingSummaryGenerations.delete(handle);
				}
			}
			const acceptedResult: unknown = generation.onAccepted?.(this.acceptedSummaryContext);
			if (isPromiseLike(acceptedResult)) {
				Promise.resolve(acceptedResult).catch(() => {});
				throw new UsageError("Additional summary acceptance callback must be synchronous");
			}
			// Only complete adoption makes the full summary a reusable parent for future attempts.
			if (generation.context.fullTree) this.hasAcceptedFullSummary = true;
		} catch (error) {
			this.failSummaryAcceptance(error);
		}
	}

	/**
	 * Make partial acceptance terminal and release retained callbacks before closing.
	 * Summarizer-node and garbage-collection state cannot be rolled back after a later stage of adoption fails.
	 */
	private failSummaryAcceptance(error: unknown): never {
		this.summaryAcceptanceError = wrapError(error, (message) => new UsageError(message));
		this.pendingSummaryGenerations.clear();
		this.host.close(this.summaryAcceptanceError);
		throw this.summaryAcceptanceError;
	}

	/**
	 * Release submitted application captures when the owning runtime is disposed.
	 */
	public dispose(): void {
		this.pendingSummaryGenerations.clear();
	}
}
