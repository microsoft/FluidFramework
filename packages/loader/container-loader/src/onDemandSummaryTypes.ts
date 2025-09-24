/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @beta
 */
export interface IRetriableFailureError extends Error {
	readonly retryAfterSeconds?: number;
}

/**
 * @beta
 */
export interface IBaseSummarizeResult {
	readonly stage: "base";
	readonly error: IRetriableFailureError | undefined;
	readonly referenceSequenceNumber: number;
	readonly minimumSequenceNumber: number;
}

/**
 * @beta
 */
export interface IGenerateSummaryTreeResult extends Omit<IBaseSummarizeResult, "stage"> {
	readonly stage: "generate";
	readonly summaryTree: unknown;
	readonly summaryStats: unknown;
	readonly generateDuration: number;
}

/**
 * @beta
 */
export interface IUploadSummaryResult extends Omit<IGenerateSummaryTreeResult, "stage"> {
	readonly stage: "upload";
	readonly handle: string;
	readonly uploadDuration: number;
}

/**
 * @beta
 */
export interface ISubmitSummaryOpResult extends Omit<IUploadSummaryResult, "stage" | "error"> {
	readonly stage: "submit";
	readonly clientSequenceNumber: number;
	readonly submitOpDuration: number;
}

/**
 * @beta
 */
export type SubmitSummaryResult =
	| IBaseSummarizeResult
	| IGenerateSummaryTreeResult
	| IUploadSummaryResult
	| ISubmitSummaryOpResult;

/**
 * @beta
 */
export type SummaryStage = SubmitSummaryResult["stage"] | "unknown";

/**
 * @beta
 */
export interface SubmitSummaryFailureData {
	readonly stage: SummaryStage;
}

/**
 * @beta
 */
export type SummarizeResultPart<TSuccess, TFailure = undefined> =
	| {
			readonly success: true;
			readonly data: TSuccess;
	  }
	| {
			readonly success: false;
			readonly data: TFailure | undefined;
			readonly message: string;
			readonly error: IRetriableFailureError;
	  };

/**
 * @beta
 */
export interface IBroadcastSummaryResult {
	readonly summarizeOp: Record<string, unknown>;
	readonly broadcastDuration: number;
}

/**
 * @beta
 */
export interface SummaryOpContents {
	readonly handle?: string;
	readonly [key: string]: unknown;
}

/**
 * @beta
 */
export interface SummaryAckMessage {
	readonly contents: SummaryOpContents;
	readonly [key: string]: unknown;
}

/**
 * @beta
 */
export interface IAckSummaryResult {
	readonly summaryAckOp: SummaryAckMessage;
	readonly ackNackDuration: number;
}

/**
 * @beta
 */
export interface INackSummaryResult {
	readonly summaryNackOp: Record<string, unknown>;
	readonly ackNackDuration: number;
}

/**
 * @beta
 */
export interface OnDemandSummarizeResults {
	readonly summarySubmitted: SummarizeResultPart<
		SubmitSummaryResult,
		SubmitSummaryFailureData
	>;
	readonly summaryOpBroadcasted: SummarizeResultPart<IBroadcastSummaryResult>;
	readonly receivedSummaryAckOrNack: SummarizeResultPart<
		IAckSummaryResult,
		INackSummaryResult
	>;
}

export interface SummarizeResultsPromisesLike {
	readonly summarySubmitted: Promise<OnDemandSummarizeResults["summarySubmitted"]>;
	readonly summaryOpBroadcasted: Promise<OnDemandSummarizeResults["summaryOpBroadcasted"]>;
	readonly receivedSummaryAckOrNack: Promise<
		OnDemandSummarizeResults["receivedSummaryAckOrNack"]
	>;
}

export interface OnDemandSummarizeOptions {
	readonly reason?: string | undefined;
	readonly retryOnFailure?: boolean | undefined;
	readonly fullTree?: boolean | undefined;
}

export interface SummarizerLike {
	readonly ISummarizer?: SummarizerLike;
	summarizeOnDemand(options: OnDemandSummarizeOptions): SummarizeResultsPromisesLike;
}

export const summarizerRequestUrl = "_summarizer";

/**
 * @beta
 */
export interface ISummarizerSummarySuccess {
	readonly success: true;
	readonly summaryResults: OnDemandSummarizeResults;
}

/**
 * @beta
 */
export interface ISummarizerSummaryFailure {
	readonly success: false;
	readonly error: Error;
}

/**
 * @beta
 */
export type LoadSummarizerSummaryResult =
	| ISummarizerSummarySuccess
	| ISummarizerSummaryFailure;
