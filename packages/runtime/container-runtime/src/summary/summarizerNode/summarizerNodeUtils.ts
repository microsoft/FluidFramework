/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SummaryObject } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";

export interface IRefreshSummaryResult {
	/**
	 * Tells whether this summary is tracked by this client.
	 */
	isSummaryTracked: boolean;
	/**
	 * Tells whether this summary is newer than the latest one tracked by this client.
	 */
	isSummaryNewer: boolean;
}

export interface IStartSummaryResult {
	/**
	 * The number of summarizerNodes at the start of the summary.
	 */
	nodes: number;
	/**
	 * The number of summarizerNodes in the wrong state.
	 */
	invalidNodes: number;
	/**
	 * The invalid sequence numbers and their values. It should be in the format of validateSequenceNumber-nodeSequenceNumber
	 */
	mismatchNumbers: Set<string>;
}

/**
 * Return type of validateSummary function. In case of success, the object returned should have success: true.
 * In case of failure, the object returned should have success: false and additional properties to indicate what
 * the failure was, where it was, can it be retried, etc.
 */
export type ValidateSummaryResult =
	| {
			success: true;
	  }
	| {
			success: false;
			/**
			 * The failure reason
			 */
			reason: string;
			/**
			 * id of the node that failed during validation
			 */
			id: {
				tag: TelemetryDataTag.CodeArtifact;
				value: string | undefined;
			};
			/**
			 * If the error can be retried, time to wait before retrying
			 */
			retryAfterSeconds?: number;
	  };

export interface ISummarizerNodeRootContract {
	startSummary(
		referenceSequenceNumber: number,
		summaryLogger: ITelemetryLoggerExt,
		latestSummaryRefSeqNum: number,
	): IStartSummaryResult;
	validateSummary(): ValidateSummaryResult;
	completeSummary(proposalHandle: string): void;
	clearSummary(): void;
	refreshLatestSummary(
		proposalHandle: string,
		summaryRefSeq: number,
	): Promise<IRefreshSummaryResult>;
}

export interface PendingSummaryInfo {
	/**
	 * The sequence number at which the summary was created.
	 */
	referenceSequenceNumber: number;
}

/**
 * Represents the details needed to create a child summarizer node.
 */
export interface ICreateChildDetails {
	/**
	 * Sequence number of latest known change to the node
	 */
	changeSequenceNumber: number;
	/**
	 * A unique id of this child to be logged when sending telemetry.
	 */
	telemetryNodeId: string;
	/**
	 * Summary handle for child node
	 */
	summaryHandleId: string;
	/**
	 * the reference sequence number of the last successful summary.
	 */
	lastSummaryReferenceSequenceNumber: number | undefined;
}

export interface ISubtreeInfo<T extends ISnapshotTree | SummaryObject> {
	/**
	 * Tree to use to find children subtrees
	 */
	childrenTree: T;
	/**
	 * Additional path part where children are isolated
	 */
	childrenPathPart: string | undefined;
}
