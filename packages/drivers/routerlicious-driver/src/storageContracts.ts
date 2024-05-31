/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	IGitBlob,
	IGitCommitDetails,
	IGitCreateBlobParams,
	IGitCreateBlobResponse,
	IGitCreateTreeParams,
	IGitTree,
} from "@fluidframework/driver-definitions/internal";
import {
	IWholeSummaryPayload,
	IWholeSummaryPayloadType,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";

import { IWholeFlatSnapshot } from "./contracts.js";
import { IR11sResponse } from "./restWrapper.js";

/**
 * Interface to a generic Git provider
 */
export interface IHistorian {
	getBlob(sha: string): Promise<IR11sResponse<IGitBlob>>;
	createBlob(blob: IGitCreateBlobParams): Promise<IR11sResponse<IGitCreateBlobResponse>>;
	getCommits(sha: string, count: number): Promise<IR11sResponse<IGitCommitDetails[]>>;
	createTree(tree: IGitCreateTreeParams): Promise<IR11sResponse<IGitTree>>;
	getTree(sha: string, recursive: boolean): Promise<IR11sResponse<IGitTree>>;
	createSummary(
		summary: IWholeSummaryPayload,
		initial?: boolean,
	): Promise<IR11sResponse<IWriteSummaryResponse>>;
	getSnapshot(sha: string): Promise<IR11sResponse<IWholeFlatSnapshot>>;
}

export interface IGitManager {
	getCommits(sha: string, count: number): Promise<IR11sResponse<IGitCommitDetails[]>>;
	getTree(root: string, recursive: boolean): Promise<IR11sResponse<IGitTree>>;
	getBlob(sha: string): Promise<IR11sResponse<IGitBlob>>;
	createBlob(content: string, encoding: string): Promise<IR11sResponse<IGitCreateBlobResponse>>;
	createGitTree(params: IGitCreateTreeParams): Promise<IR11sResponse<IGitTree>>;
	createSummary(
		summary: IWholeSummaryPayload,
		initial?: boolean,
	): Promise<IR11sResponse<IWriteSummaryResponse>>;
	getSnapshot(sha: string): Promise<IR11sResponse<IWholeFlatSnapshot>>;
}

/**
 * Uploads a summary to storage.
 */
export interface ISummaryUploadManager {
	/**
	 * Writes summary tree to storage.
	 * @param summaryTree - Summary tree to write to storage
	 * @param parentHandle - Parent summary acked handle (if available from summary ack)
	 * @param summaryType - type of summary being uploaded
	 * @param sequenceNumber - optional reference sequence number of the summary
	 * @returns Id of created tree as a string.
	 */
	writeSummaryTree(
		summaryTree: ISummaryTree,
		parentHandle: string,
		summaryType: IWholeSummaryPayloadType,
		sequenceNumber?: number,
	): Promise<string>;
}
