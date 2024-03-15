/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import {
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { IWholeFlatSnapshot } from "./contracts";
import { IR11sResponse } from "./restWrapper";
import { IGitManager, IHistorian } from "./storageContracts";

export class GitManager implements IGitManager {
	constructor(private readonly historian: IHistorian) {}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getCommits(
		sha: string,
		count: number,
	): Promise<IR11sResponse<resources.ICommitDetails[]>> {
		return this.historian.getCommits(sha, count);
	}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getTree(root: string, recursive = true): Promise<IR11sResponse<resources.ITree>> {
		return this.historian.getTree(root, recursive);
	}

	public async getBlob(sha: string): Promise<IR11sResponse<resources.IBlob>> {
		return this.historian.getBlob(sha);
	}

	public async createBlob(
		content: string,
		encoding: "utf-8" | "base64",
	): Promise<IR11sResponse<resources.ICreateBlobResponse>> {
		const blob: resources.ICreateBlobParams = {
			content,
			encoding,
		};
		return this.historian.createBlob(blob);
	}

	public async createGitTree(
		params: resources.ICreateTreeParams,
	): Promise<IR11sResponse<resources.ITree>> {
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
