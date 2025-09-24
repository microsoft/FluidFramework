/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidErrorBase } from "@fluidframework/telemetry-utils/internal";

export interface IRetriableFailureError extends Error {
	readonly retryAfterSeconds?: number;
}

export interface IBaseSummarizeResult {
	readonly stage: "base";
	readonly error: IRetriableFailureError | undefined;
	readonly referenceSequenceNumber: number;
	readonly minimumSequenceNumber: number;
}

export interface IGenerateSummaryTreeResult extends Omit<IBaseSummarizeResult, "stage"> {
	readonly stage: "generate";
	readonly summaryTree: unknown;
	readonly summaryStats: unknown;
	readonly generateDuration: number;
}

export interface IUploadSummaryResult extends Omit<IGenerateSummaryTreeResult, "stage"> {
	readonly stage: "upload";
	readonly handle: string;
	readonly uploadDuration: number;
}

export interface ISubmitSummaryOpResult extends Omit<IUploadSummaryResult, "stage" | "error"> {
	readonly stage: "submit";
	readonly clientSequenceNumber: number;
	readonly submitOpDuration: number;
}

export type SubmitSummaryResult =
	| IBaseSummarizeResult
	| IGenerateSummaryTreeResult
	| IUploadSummaryResult
	| ISubmitSummaryOpResult;

export type SummaryStage = SubmitSummaryResult["stage"] | "unknown";

export interface SubmitSummaryFailureData {
	readonly stage: SummaryStage;
}

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

export interface IBroadcastSummaryResult {
	readonly summarizeOp: Record<string, unknown>;
	readonly broadcastDuration: number;
}

interface SummaryOpContents {
	readonly handle?: string;
	readonly [key: string]: unknown;
}

interface SummaryAckMessage {
	readonly contents: SummaryOpContents;
	readonly [key: string]: unknown;
}

export interface IAckSummaryResult {
	readonly summaryAckOp: SummaryAckMessage;
	readonly ackNackDuration: number;
}

export interface INackSummaryResult {
	readonly summaryNackOp: Record<string, unknown>;
	readonly ackNackDuration: number;
}

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

export interface ISummarizerSummarySuccess {
	readonly success: true;
	readonly summaryResults: OnDemandSummarizeResults;
}

export interface ISummarizerSummaryFailure {
	readonly success: false;
	readonly error: IFluidErrorBase;
}

export type LoadSummarizerSummaryResult =
	| ISummarizerSummarySuccess
	| ISummarizerSummaryFailure;
