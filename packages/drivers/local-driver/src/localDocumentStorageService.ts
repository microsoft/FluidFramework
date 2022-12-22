/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISummaryContext,
} from "@fluidframework/driver-definitions";
import {
	ICreateBlobResponse,
	ISnapshotTreeEx,
	ISummaryHandle,
	ISummaryTree,
	IVersion,
} from "@fluidframework/protocol-definitions";
import { buildHierarchy } from "@fluidframework/protocol-base";
import { GitManager, ISummaryUploadManager, SummaryTreeUploadManager } from "@fluidframework/server-services-client";

export class LocalDocumentStorageService implements IDocumentStorageService {
	// The values of this cache is useless. We only need the keys. So we are always putting
	// empty strings as values.
	protected readonly blobsShaCache = new Map<string, string>();
	private readonly summaryTreeUploadManager: ISummaryUploadManager;

	public get repositoryUrl(): string {
		return "";
	}

	constructor(
		private readonly id: string,
		private readonly manager: GitManager,
		public readonly policies: IDocumentStorageServicePolicies = {},
	) {
		this.summaryTreeUploadManager = new SummaryTreeUploadManager(
			manager,
			this.blobsShaCache,
			this.getPreviousFullSnapshot.bind(this),
		);
	}

	public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
		const id = versionId ? versionId : this.id;
		const commits = await this.manager.getCommits(id, count);
		return commits.map((commit) => ({
			date: commit.commit.author.date,
			id: commit.sha,
			treeId: commit.commit.tree.sha,
		}));
	}

	public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTreeEx | null> {
		let requestVersion = version;
		if (!requestVersion) {
			const versions = await this.getVersions(this.id, 1);
			if (versions.length === 0) {
				return null;
			}

			requestVersion = versions[0];
		}

		const rawTree = await this.manager.getTree(requestVersion.treeId);
		const tree = buildHierarchy(rawTree, this.blobsShaCache, true);
		return tree;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const blob = await this.manager.getBlob(blobId);
		this.blobsShaCache.set(blob.sha, "");
		const bufferContent = stringToBuffer(blob.content, blob.encoding);
		return bufferContent;
	}

	public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
		return this.summaryTreeUploadManager.writeSummaryTree(
			summary,
			context.ackHandle ?? "",
			"channel",
		);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const uint8ArrayFile = new Uint8Array(file);
		return this.manager.createBlob(
			Uint8ArrayToString(
				uint8ArrayFile, "base64"),
			"base64").then((r) => ({ id: r.sha, url: r.url }));
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		throw new Error("NOT IMPLEMENTED!");
	}

	private async getPreviousFullSnapshot(parentHandle: string): Promise<ISnapshotTreeEx | null | undefined> {
		return parentHandle
			? this.getVersions(parentHandle, 1)
				.then(async (versions) => {
					// Clear the cache as the getSnapshotTree call will fill the cache.
					this.blobsShaCache.clear();
					return this.getSnapshotTree(versions[0]);
				})
			: undefined;
	}
}
