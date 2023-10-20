/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as resources from "@fluidframework/gitresources";
import {
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { IGitManager, IHistorian } from "./storageContracts";
import { IR11sResponse, createR11sResponseFromContent } from "./restWrapper";
import { IWholeFlatSnapshot } from "./contracts";

export class GitManager implements IGitManager {
	private readonly blobCache = new Map<string, resources.IBlob>();
	private readonly commitCache = new Map<string, resources.ICommit>();
	private readonly treeCache = new Map<string, resources.ITree>();

	constructor(private readonly historian: IHistorian) {}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getCommits(
		sha: string,
		count: number,
	): Promise<IR11sResponse<resources.ICommitDetails[]>> {
		// See if the commit sha is hashed and return it if so
		const commit = this.commitCache.get(sha);
		if (commit !== undefined) {
			return createR11sResponseFromContent([
				{
					commit: {
						author: commit.author,
						committer: commit.committer,
						message: commit.message,
						tree: commit.tree,
						url: commit.url,
					},
					parents: commit.parents,
					sha: commit.sha,
					url: commit.url,
				},
			]);
		}

		// Otherwise fall back to the historian
		return this.historian.getCommits(sha, count);
	}

	/**
	 * Reads the object with the given ID. We defer to the client implementation to do the actual read.
	 */
	public async getTree(root: string, recursive = true): Promise<IR11sResponse<resources.ITree>> {
		const tree = this.treeCache.get(root);
		if (tree !== undefined) {
			return createR11sResponseFromContent(tree);
		}

		return this.historian.getTree(root, recursive);
	}

	public async getBlob(sha: string): Promise<IR11sResponse<resources.IBlob>> {
		const blob = this.blobCache.get(sha);
		if (blob !== undefined) {
			return createR11sResponseFromContent(blob);
		}
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
