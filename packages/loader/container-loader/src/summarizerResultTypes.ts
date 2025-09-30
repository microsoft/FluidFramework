/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISequencedDocumentMessage,
	ISummaryAck,
	ISummaryContent,
	ISummaryTree,
	MessageType,
} from "@fluidframework/driver-definitions/internal";

export const summarizerRequestUrl = "_summarizer";

/**
 * Stages of summary process.
 * @beta
 */
export type SummaryStage = "base" | "generate" | "upload" | "submit" | "unknown";

type OnDemandSummaryStageResult<TSuccess> =
	| {
			readonly success: true;
			readonly data: TSuccess;
	  }
	| {
			readonly success: false;
			readonly error: Error;
			readonly message?: string;
			readonly data?: unknown;
	  };

interface ISummaryOpMessage extends ISequencedDocumentMessage {
	type: MessageType.Summarize;
	contents: ISummaryContent;
}

interface ISummaryAckMessage extends ISequencedDocumentMessage {
	type: MessageType.SummaryAck;
	contents: ISummaryAck;
}

/**
 * @internal
 */
export interface SummarizeOnDemandResults {
	readonly summarySubmitted: OnDemandSummaryStageResult<{
		readonly stage: SummaryStage;
		readonly summaryTree?: ISummaryTree;
		readonly handle?: string;
	}>;
	readonly summaryOpBroadcasted: OnDemandSummaryStageResult<{
		readonly broadcastDuration: number;
		readonly summarizeOp: ISummaryOpMessage;
	}>;
	readonly receivedSummaryAckOrNack: OnDemandSummaryStageResult<{
		readonly summaryAckOp: ISummaryAckMessage;
		readonly ackNackDuration: number;
	}>;
}

/**
 * Results from an on-demand summary request.
 * @beta
 */
export interface OnDemandSummaryResults {
	readonly summarySubmitted: boolean;
	readonly summaryInfo: {
		readonly stage?: SummaryStage;
		readonly summaryTree?: ISummaryTree;
		readonly handle?: string;
	};
	readonly summaryOpBroadcasted: boolean;
	readonly receivedSummaryAck: boolean;
}

/**
 * Outcome from {@link loadSummarizerContainerAndMakeSummary}.
 * @beta
 */
export type LoadSummarizerSummaryResult =
	| {
			readonly success: true;
			readonly summaryResults: OnDemandSummaryResults;
	  }
	| {
			readonly success: false;
			readonly error: Error;
	  };
