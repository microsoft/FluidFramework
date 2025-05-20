/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import {
	IDocumentStorageService,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";
import { getNormalizedObjectStoragePathParts } from "@fluidframework/runtime-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

export class ChannelStorageService implements IChannelStorageService {
	private static flattenTree(
		base: string,
		tree: ISnapshotTree,
		results: { [path: string]: string },
	) {
		for (const [path, subtree] of Object.entries(tree.trees)) {
			ChannelStorageService.flattenTree(`${base}${path}/`, subtree, results);
		}

		for (const [blobName, blobId] of Object.entries(tree.blobs)) {
			results[`${base}${blobName}`] = blobId;
		}
	}

	private readonly flattenedTree: { [path: string]: string };

	constructor(
		private readonly tree: ISnapshotTree | undefined,
		private readonly storage: Pick<IDocumentStorageService, "readBlob">,
		private readonly logger: ITelemetryLoggerExt,
		private readonly extraBlobs?: Map<string, ArrayBufferLike>,
	) {
		this.flattenedTree = {};
		// Create a map from paths to blobs
		if (tree !== undefined) {
			ChannelStorageService.flattenTree("", tree, this.flattenedTree);
		}
	}

	public async contains(path: string): Promise<boolean> {
		return this.flattenedTree[path] !== undefined;
	}

	public async readBlob(path: string): Promise<ArrayBufferLike> {
		const id = await this.getIdForPath(path);
		assert(id !== undefined, 0x9d7 /* id is undefined in ChannelStorageService.readBlob() */);
		const blob = this.extraBlobs === undefined ? undefined : this.extraBlobs.get(id);

		if (blob !== undefined) {
			return blob;
		}
		const blobP = this.storage.readBlob(id);
		blobP.catch((error) =>
			this.logger.sendErrorEvent({ eventName: "ChannelStorageBlobError" }, error),
		);

		return blobP;
	}

	public async list(path: string): Promise<string[]> {
		let tree = this.tree;
		const pathParts = getNormalizedObjectStoragePathParts(path);
		while (tree !== undefined && pathParts.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const part = pathParts.shift()!;
			tree = tree.trees[part];
		}
		if (tree === undefined || pathParts.length > 0) {
			throw new Error("path does not exist");
		}

		return Object.keys(tree?.blobs ?? {});
	}

	private async getIdForPath(path: string): Promise<string | undefined> {
		return this.flattenedTree[path];
	}
}
