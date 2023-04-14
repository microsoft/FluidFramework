/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import * as api from "@fluidframework/protocol-definitions";
import {
	IWholeFlatSummary,
	IWholeSummaryPayload,
	IWholeSummaryPayloadType,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { IR11sResponse } from "./restWrapper";

/**
 * Interface to a generic Git provider
 */
export interface IHistorian {
	getBlob(sha: string): Promise<IR11sResponse<git.IBlob>>;
	createBlob(blob: git.ICreateBlobParams): Promise<IR11sResponse<git.ICreateBlobResponse>>;
	getCommits(sha: string, count: number): Promise<IR11sResponse<git.ICommitDetails[]>>;
	createTree(tree: git.ICreateTreeParams): Promise<IR11sResponse<git.ITree>>;
	getTree(sha: string, recursive: boolean): Promise<IR11sResponse<git.ITree>>;
	createSummary(
		summary: IWholeSummaryPayload,
		initial?: boolean,
	): Promise<IR11sResponse<IWriteSummaryResponse>>;
	getSummary(sha: string): Promise<IR11sResponse<IWholeFlatSummary>>;
}

export interface IGitManager {
	getCommits(sha: string, count: number): Promise<IR11sResponse<git.ICommitDetails[]>>;
	getTree(root: string, recursive: boolean): Promise<IR11sResponse<git.ITree>>;
	getBlob(sha: string): Promise<IR11sResponse<git.IBlob>>;
	createBlob(content: string, encoding: string): Promise<IR11sResponse<git.ICreateBlobResponse>>;
	createGitTree(params: git.ICreateTreeParams): Promise<IR11sResponse<git.ITree>>;
	createSummary(
		summary: IWholeSummaryPayload,
		initial?: boolean,
	): Promise<IR11sResponse<IWriteSummaryResponse>>;
	getSummary(sha: string): Promise<IR11sResponse<IWholeFlatSummary>>;
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
		summaryTree: api.ISummaryTree,
		parentHandle: string,
		summaryType: IWholeSummaryPayloadType,
		sequenceNumber?: number,
	): Promise<string>;
}
