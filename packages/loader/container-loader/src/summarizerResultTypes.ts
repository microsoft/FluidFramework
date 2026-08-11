/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IErrorBase } from "@fluidframework/core-interfaces";
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
 *
 * Stages:
 *
 * 1. "base" - stopped before the summary tree was even generated, and the result only contains the base data
 *
 * 2. "generate" - the summary tree was generated, and the result will contain that tree + stats
 *
 * 3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle
 *
 * 4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.
 *
 * @legacy @alpha
 */
export type SummaryStage = "base" | "generate" | "upload" | "submit" | "unknown";

type OnDemandSummaryStageResult<TSuccess> =
	| {
			readonly success: true;
			readonly data: TSuccess;
	  }
	| {
			readonly success: false;
			readonly error: IErrorBase;
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
 * @legacy @alpha
 */
export interface OnDemandSummaryResults {
	/**
	 * True if summary was generated, uploaded, and submitted.
	 */
	readonly summarySubmitted: boolean;

	/**
	 * Information about the summary that was submitted, if any.
	 */
	readonly summaryInfo: {
		/**
		 * Stage at which summary process ended.
		 */
		readonly stage?: SummaryStage;
		/**
		 * Handle of the complete summary.
		 */
		readonly handle?: string;
	};

	/**
	 * True if summarize op broadcast was observed.
	 */
	readonly summaryOpBroadcasted: boolean;
}

/**
 * Outcome from {@link loadSummarizerContainerAndMakeSummary}.
 * @legacy @alpha
 */
export type LoadSummarizerSummaryResult =
	| {
			readonly success: true;
			readonly summaryResults: OnDemandSummaryResults;
	  }
	| {
			readonly success: false;
			readonly error: IErrorBase;
	  };
