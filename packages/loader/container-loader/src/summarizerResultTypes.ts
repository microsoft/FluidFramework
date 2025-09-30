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

/**
 * URL path a host uses to request the summarizer entry point from a container.
 * @legacy @beta
 */
export const summarizerRequestUrl = "_summarizer";

/**
 * Phases of the on-demand summarizer run.
 *
 * @legacy
 * @beta
 */
export type SummaryStage = "base" | "generate" | "upload" | "submit" | "unknown";

/**
 * Reports whether a summarizer stage succeeded and carries its data or failure info.
 *
 * @legacy
 * @beta
 */
export type OnDemandSummaryStageResult<TSuccess> =
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

/**
 * `Summarize` op plus its summary payload.
 *
 * @legacy
 * @beta
 */
export interface ISummaryOpMessage extends ISequencedDocumentMessage {
	type: MessageType.Summarize;
	contents: ISummaryContent;
}

/**
 * `SummaryAck` op returned by the server.
 *
 * @legacy
 * @beta
 */
export interface ISummaryAckMessage extends ISequencedDocumentMessage {
	type: MessageType.SummaryAck;
	contents: ISummaryAck;
}

/**
 * Stage-by-stage results from running the on-demand summarizer.
 *
 * @legacy
 * @beta
 */
export interface OnDemandSummaryResults {
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
