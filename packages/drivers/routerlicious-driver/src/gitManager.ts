/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";

import { IWholeFlatSnapshot } from "./contracts.js";
import { IR11sResponse } from "./restWrapper.js";
import { IGitManager, IHistorian } from "./storageContracts.js";

export class GitManager implements IGitManager {
	constructor(private readonly historian: IHistorian) {}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getCommits(
		sha: string,
		count: number,
	): Promise<IR11sResponse<IGitCommitDetails[]>> {
		return this.historian.getCommits(sha, count);
	}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getTree(root: string, recursive = true): Promise<IR11sResponse<IGitTree>> {
		return this.historian.getTree(root, recursive);
	}

	public async getBlob(sha: string): Promise<IR11sResponse<IGitBlob>> {
		return this.historian.getBlob(sha);
	}

	public async createBlob(
		content: string,
		encoding: "utf-8" | "base64",
	): Promise<IR11sResponse<IGitCreateBlobResponse>> {
		const blob: IGitCreateBlobParams = {
			content,
			encoding,
		};
		return this.historian.createBlob(blob);
	}

	public async createGitTree(params: IGitCreateTreeParams): Promise<IR11sResponse<IGitTree>> {
		const treeP = this.historian.createTree(params);
		return treeP;
	}

	public async createSummary(
		summary: IWholeSummaryPayload,
		initial: boolean = false,
	): Promise<IR11sResponse<IWriteSummaryResponse>> {
		return this.historian.createSummary(summary, initial);
	}

	public async getSnapshot(sha: string): Promise<IR11sResponse<IWholeFlatSnapshot>> {
		return this.historian.getSnapshot(sha);
	}
}
