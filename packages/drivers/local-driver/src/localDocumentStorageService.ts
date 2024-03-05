/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	bufferToString,
	IsoBuffer,
	stringToBuffer,
	Uint8ArrayToString,
} from "@fluid-internal/client-utils";
import {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	IResolvedUrl,
	ISummaryContext,
	type ISnapshotFetchOptions,
	type ISnapshot,
} from "@fluidframework/driver-definitions";
import {
	ICreateBlobResponse,
	ISnapshotTreeEx,
	ISummaryHandle,
	ISummaryTree,
	IVersion,
} from "@fluidframework/protocol-definitions";
import { buildGitTreeHierarchy } from "@fluidframework/protocol-base";
import {
	GitManager,
	ISummaryUploadManager,
	SummaryTreeUploadManager,
} from "@fluidframework/server-services-client";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { assert } from "@fluidframework/core-utils";
import { createDocument } from "./localCreateDocument.js";

const minTTLInSeconds = 24 * 60 * 60; // Same TTL as ODSP
/**
 * @internal
 */
export class LocalDocumentStorageService implements IDocumentStorageService {
	// The values of this cache is useless. We only need the keys. So we are always putting
	// empty strings as values.
	protected readonly blobsShaCache = new Map<string, string>();
	private readonly summaryTreeUploadManager: ISummaryUploadManager;

	constructor(
		private readonly id: string,
		private readonly manager: GitManager,
		public readonly policies: IDocumentStorageServicePolicies,
		private readonly localDeltaConnectionServer?: ILocalDeltaConnectionServer,
		private readonly resolvedUrl?: IResolvedUrl,
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
		const tree = buildGitTreeHierarchy(rawTree, this.blobsShaCache, true);
		await this.populateGroupId(tree);
		return tree;
	}

	public async getSnapshot(snapshotFetchOptions?: ISnapshotFetchOptions): Promise<ISnapshot> {
		let versionId = snapshotFetchOptions?.versionId;
		if (!versionId) {
			const versions = await this.getVersions(this.id, 1);
			if (versions.length === 0) {
				throw new Error("No versions for the document!");
			}

			versionId = versions[0].treeId;
		}
		const rawTree = await this.manager.getTree(versionId);
		const snapshotTree = buildGitTreeHierarchy(rawTree, this.blobsShaCache, true);
		if (snapshotFetchOptions?.loadingGroupIds !== undefined) {
			const groupIds = new Set<string>(snapshotFetchOptions.loadingGroupIds);
			const hasFoundTree = await this.filterTreeByLoadingGroupIds(
				snapshotTree,
				groupIds,
				false,
			);
			assert(hasFoundTree, "No tree found for the given groupIds");
		} else {
			await this.stripTreeOfLoadingGroupIds(snapshotTree);
		}

		const blobContents = new Map<string, ArrayBufferLike>();
		await this.populateBlobContents(snapshotTree, blobContents);

		const metadataString = IsoBuffer.from(blobContents.get(".metadata")).toString("utf-8");
		const metadata = JSON.parse(metadataString);
		const sequenceNumber: number = metadata.message?.sequenceNumber ?? 0;
		return {
			snapshotTree,
			blobContents,
			ops: [],
			snapshotFormatV: 1,
			sequenceNumber,
			latestSequenceNumber: undefined,
		};
	}

	/**
	 * Strips the tree or any subtree of data if it has a groupId.
	 *
	 * @param tree - The tree to strip of loading groupIds
	 * @returns a tree that has trees with groupIds that are empty
	 */
	private async stripTreeOfLoadingGroupIds(tree: ISnapshotTreeEx) {
		const groupId = await this.readGroupId(tree);
		if (groupId !== undefined) {
			// strip
			this.stripTree(tree, groupId);
			return;
		}
		await Promise.all(
			Object.values(tree.trees).map(async (childTree) => {
				await this.stripTreeOfLoadingGroupIds(childTree);
			}),
		);
	}

	/**
	 * Named differently as the algorithm is a little more involved.
	 *
	 * We want to strip the tree if it has a groupId that is not in the loadingGroupIds or if it doesn't have a descendent or ancestor
	 * that has a groupId that is in the loadingGroupIds.
	 *
	 * We keep the tree in the opposite case.
	 *
	 * @param tree - the tree to strip of any data that is not in the loadingGroupIds
	 * @param loadingGroupIds - the set of groupIds that are being loaded
	 * @param ancestorGroupIdInLoadingGroup - whether the ancestor of the tree has a groupId that is in the loadingGroupIds
	 * @returns whether or not it or descendant has a groupId that is in the loadingGroupIds
	 */
	private async filterTreeByLoadingGroupIds(
		tree: ISnapshotTreeEx,
		loadingGroupIds: Set<string>,
		ancestorGroupIdInLoadingGroup: boolean,
	): Promise<boolean> {
		assert(loadingGroupIds.size > 0, "loadingGroupIds should not be empty");
		const groupId = await this.readGroupId(tree);

		// Strip the tree if it has a groupId and it is not in the loadingGroupIds
		// This is an optimization here as we have other reasons to keep the tree.
		const noGroupIdInLoadingGroupIds = groupId !== undefined && !loadingGroupIds.has(groupId);
		if (noGroupIdInLoadingGroupIds) {
			this.stripTree(tree, groupId);
			return false;
		}

		// Keep tree if it has a groupId and it is in the loadingGroupIds
		const groupIdInLoadingGroupIds = groupId !== undefined && loadingGroupIds.has(groupId);

		// Keep tree if it has an ancestor that has a groupId that is in loadingGroupIds and it doesn't have groupId
		const isChildOfAncestorWithGroupId = ancestorGroupIdInLoadingGroup && groupId === undefined;

		// Keep tree if it has a child that has a groupId that is in loadingGroupIds
		const descendants = await Promise.all<boolean>(
			Object.values(tree.trees).map(async (childTree) => {
				return this.filterTreeByLoadingGroupIds(
					childTree,
					loadingGroupIds,
					ancestorGroupIdInLoadingGroup || groupIdInLoadingGroupIds,
				);
			}),
		);
		const isAncestorOfDescendantsWithGroupId = descendants.some((keep) => keep);

		// We don't want to return prematurely as we still may have children that we want to keep.
		if (
			groupIdInLoadingGroupIds ||
			isChildOfAncestorWithGroupId ||
			isAncestorOfDescendantsWithGroupId
		) {
			// Keep this tree node
			return true;
		}

		// This means we have no groupId and none of our ancestors or descendants have a groupId in the loadingGroupIds
		this.stripTree(tree, groupId);
		return false;
	}

	// Takes all the blobs of a tree and puts it into the blobContents
	private async populateBlobContents(
		tree: ISnapshotTreeEx,
		blobContents: Map<string, ArrayBufferLike>,
	): Promise<void> {
		await Promise.all(
			Object.entries(tree.blobs).map(async ([path, blobId]) => {
				const content = await this.readBlob(blobId);
				blobContents.set(path, content);
			}),
		);
		await Promise.all(
			Object.values(tree.trees).map(async (childTree) => {
				await this.populateBlobContents(childTree, blobContents);
			}),
		);
	}

	private async populateGroupId(tree: ISnapshotTreeEx): Promise<void> {
		await this.readGroupId(tree);
		await Promise.all(
			Object.values(tree.trees).map(async (childTree) => {
				await this.populateGroupId(childTree);
			}),
		);
	}

	private stripTree(tree: ISnapshotTreeEx, groupId: string | undefined) {
		tree.blobs = {};
		tree.groupId = groupId;
		tree.trees = {};
		tree.omitted = true;
	}

	private async readGroupId(tree: ISnapshotTreeEx): Promise<string | undefined> {
		const groupIdBlobId = tree.blobs[".groupId"];
		if (groupIdBlobId !== undefined) {
			const groupIdBuffer = await this.readBlob(groupIdBlobId);
			const groupId = bufferToString(groupIdBuffer, "utf8");
			tree.groupId = groupId;
			delete tree.blobs[".groupId"];
			return groupId;
		}

		return tree.groupId;
	}

	public async readBlob(blobId: string): Promise<ArrayBufferLike> {
		const blob = await this.manager.getBlob(blobId);
		this.blobsShaCache.set(blob.sha, "");
		const bufferContent = stringToBuffer(blob.content, blob.encoding);
		return bufferContent;
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		if (context.referenceSequenceNumber === 0) {
			if (this.localDeltaConnectionServer === undefined || this.resolvedUrl === undefined) {
				throw new Error(
					"Insufficient constructor parameters. An ILocalDeltaConnectionServer and IResolvedUrl required",
				);
			}
			await createDocument(this.localDeltaConnectionServer, this.resolvedUrl, summary);
			const version = await this.getVersions(this.id, 1);
			return version[0].id;
		}
		return this.summaryTreeUploadManager.writeSummaryTree(
			summary,
			context.ackHandle ?? "",
			"channel",
		);
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		const uint8ArrayFile = new Uint8Array(file);
		return this.manager
			.createBlob(Uint8ArrayToString(uint8ArrayFile, "base64"), "base64")
			.then((r) => ({ id: r.sha, url: r.url, minTTLInSeconds }));
	}

	public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
		throw new Error("NOT IMPLEMENTED!");
	}

	private async getPreviousFullSnapshot(
		parentHandle: string,
	): Promise<ISnapshotTreeEx | null | undefined> {
		return parentHandle
			? this.getVersions(parentHandle, 1).then(async (versions) => {
					// Clear the cache as the getSnapshotTree call will fill the cache.
					this.blobsShaCache.clear();
					return this.getSnapshotTree(versions[0]);
			  })
			: undefined;
	}
}
