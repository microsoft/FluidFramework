/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	EnqueueSummarizeResult as LoaderEnqueueSummarizeResult,
	IAckSummaryResult as LoaderIAckSummaryResult,
	IBroadcastSummaryResult as LoaderIBroadcastSummaryResult,
	INackSummaryResult as LoaderINackSummaryResult,
	ISummarizeResults as LoaderISummarizeResults,
} from "@fluidframework/container-loader/internal";

import type {
	ISummaryAckMessage,
	ISummaryNackMessage,
	ISummaryOpMessage,
} from "../summaryCollection.js";

/**
 * @legacy @beta
 */
export type IBroadcastSummaryResult = LoaderIBroadcastSummaryResult<ISummaryOpMessage>;

/**
 * @legacy @beta
 */
export type IAckSummaryResult = LoaderIAckSummaryResult<ISummaryAckMessage>;

/**
 * @legacy @beta
 */
export type INackSummaryResult = LoaderINackSummaryResult<ISummaryNackMessage>;

/**
 * @legacy @beta
 */
export type ISummarizeResults = LoaderISummarizeResults<
	ISummaryOpMessage,
	ISummaryAckMessage,
	ISummaryNackMessage
>;

/**
 * @legacy @beta
 */
export type EnqueueSummarizeResult = LoaderEnqueueSummarizeResult<
	ISummaryOpMessage,
	ISummaryAckMessage,
	ISummaryNackMessage
>;
