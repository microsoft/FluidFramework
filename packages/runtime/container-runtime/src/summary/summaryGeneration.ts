/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ISummaryContext } from "@fluidframework/driver-definitions/internal";
import { UsageError, wrapError } from "@fluidframework/telemetry-utils/internal";

import type { IRefreshSummaryResult } from "./summarizerNode/index.js";
import type { IRefreshSummaryAckOptions } from "./summarizerTypes.js";
import type { ISummaryGenerationOptions } from "./summaryGenerationTypes.js";

/**
 * Runtime effects required to adopt a submitted summary.
 */
interface ISummaryGenerationHost {
	refreshSummary(
		proposalHandle: string,
		referenceSequenceNumber: number,
	): Promise<IRefreshSummaryResult>;
	refreshGC(result: IRefreshSummaryResult, proposalHandle: string): Promise<void>;
	handleUntrackedSummary(options: IRefreshSummaryAckOptions): Promise<void>;
	verifyNotClosed(): void;
	close(error: UsageError): void;
}

/**
 * Copy and validate factory configuration before asynchronous loading starts.
 */
export function captureSummaryGenerationOptions(
	options: ISummaryGenerationOptions | undefined,
): ISummaryGenerationOptions | undefined {
	if (options === undefined) return undefined;
	const { fullTreePolicy } = options;
	if (
		fullTreePolicy !== undefined &&
		fullTreePolicy !== "default" &&
		fullTreePolicy !== "untilFirstAck" &&
		fullTreePolicy !== "always"
	) {
		throw new UsageError("Invalid full-tree summary policy");
	}
	return { fullTreePolicy };
}

/**
 * Enforce full output until a tracked full proposal has completed native baseline adoption.
 * The runtime retains ownership of summary generation, upload, and submission.
 */
export class SummaryGenerationController {
	private hasAcceptedFullSummary = false;
	private readonly pendingSummaryGenerations = new Map<
		string,
		{ fullTree: boolean; referenceSequenceNumber: number }
	>();
	private acceptedSummaryContext: ISummaryContext | undefined;
	private summaryAcceptanceError: UsageError | undefined;
	private summaryAckRefresh: Promise<void> = Promise.resolve();
	private pendingSummaryAckRefreshes = 0;

	public constructor(
		private readonly options: ISummaryGenerationOptions,
		private readonly host: ISummaryGenerationHost,
	) {}

	public get latestAcceptedSummary(): ISummaryContext | undefined {
		return this.acceptedSummaryContext;
	}

	public get shouldSummarizeOnStartup(): boolean {
		return this.options.fullTreePolicy === "untilFirstAck" && !this.hasAcceptedFullSummary;
	}

	public shouldProduceFullSummary(requestedFullTree: boolean): boolean {
		if (this.summaryAcceptanceError !== undefined) throw this.summaryAcceptanceError;
		if (this.pendingSummaryAckRefreshes > 0) {
			throw new UsageError("Cannot generate a summary during summary acceptance");
		}
		return (
			requestedFullTree ||
			this.options.fullTreePolicy === "always" ||
			this.shouldSummarizeOnStartup
		);
	}

	/**
	 * Track only submitted proposals after both native tracking systems complete them.
	 */
	public completeSummary(
		proposalHandle: string,
		fullTree: boolean,
		referenceSequenceNumber: number,
	): void {
		this.pendingSummaryGenerations.set(proposalHandle, { fullTree, referenceSequenceNumber });
	}

	/**
	 * Serialize acknowledgments and prevent generation during partial adoption.
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

	private async refreshLatestSummaryAckCore(
		options: IRefreshSummaryAckOptions,
	): Promise<void> {
		const { proposalHandle, ackHandle, summaryRefSeq } = options;
		assert(proposalHandle !== undefined, "Summary acknowledgment must identify its proposal");
		const result = await this.host
			.refreshSummary(proposalHandle, summaryRefSeq)
			.catch((error: unknown) => this.failSummaryAcceptance(error));
		if (!result.isSummaryTracked) {
			if (result.isSummaryNewer) await this.host.handleUntrackedSummary(options);
			return;
		}
		try {
			const generation = this.pendingSummaryGenerations.get(proposalHandle);
			assert(generation !== undefined, "Tracked summary must have matching generation state");
			assert(
				generation.referenceSequenceNumber === summaryRefSeq,
				"Accepted proposal must match its generated checkpoint",
			);
			await this.host.refreshGC(result, proposalHandle);
			this.host.verifyNotClosed();
			this.acceptedSummaryContext = {
				proposalHandle,
				ackHandle,
				referenceSequenceNumber: summaryRefSeq,
			};
			this.pendingSummaryGenerations.delete(proposalHandle);
			for (const [handle, pending] of this.pendingSummaryGenerations) {
				if (pending.referenceSequenceNumber < summaryRefSeq) {
					this.pendingSummaryGenerations.delete(handle);
				}
			}
			if (generation.fullTree) this.hasAcceptedFullSummary = true;
		} catch (error) {
			this.failSummaryAcceptance(error);
		}
	}

	private failSummaryAcceptance(error: unknown): never {
		this.summaryAcceptanceError = wrapError(error, (message) => new UsageError(message));
		this.pendingSummaryGenerations.clear();
		this.host.close(this.summaryAcceptanceError);
		throw this.summaryAcceptanceError;
	}

	public dispose(): void {
		this.pendingSummaryGenerations.clear();
	}
}
