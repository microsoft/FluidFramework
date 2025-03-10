/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateTreeEntry } from "@fluidframework/gitresources";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import {
	FileMode,
	ISnapshotTreeEx,
	ISummaryTree,
	SummaryObject,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import { assert } from "./assert";
import { gitHashFile, IsoBuffer, Uint8ArrayToString } from "./common-utils";
import { ISummaryUploadManager, IGitManager } from "./storage";
import { IWholeSummaryPayloadType } from "./storageContracts";
import { unreachableCase } from "./utils";

/**
 * Recursively writes summary tree as individual summary blobs.
 * @internal
 */
export class SummaryTreeUploadManager implements ISummaryUploadManager {
	constructor(
		private readonly manager: IGitManager,
		private readonly blobsShaCache: Map<string, string>,
		private readonly getPreviousFullSnapshot: (
			parentHandle: string,
		) => Promise<ISnapshotTreeEx | null | undefined>,
	) {}

	public async writeSummaryTree(
		summaryTree: ISummaryTree,
		parentHandle: string,
		summaryType: IWholeSummaryPayloadType,
		sequenceNumber?: number,
		initial?: boolean,
	): Promise<string> {
		const previousFullSnapshot = await this.getPreviousFullSnapshot(parentHandle);
		return this.writeSummaryTreeCore(summaryTree, previousFullSnapshot ?? undefined);
	}

	private async writeSummaryTreeCore(
		summaryTree: ISummaryTree,
		previousFullSnapshot: ISnapshotTreeEx | undefined,
	): Promise<string> {
		const entries = await Promise.all(
			Object.keys(summaryTree.tree).map(async (key) => {
				const entry = summaryTree.tree[key];
				const pathHandle = await this.writeSummaryTreeObject(entry, previousFullSnapshot);
				const treeEntry: ICreateTreeEntry = {
					mode: getGitMode(entry),
					path: encodeURIComponent(key),
					sha: pathHandle,
					type: getGitType(entry),
				};
				return treeEntry;
			}),
		);

		if (summaryTree.groupId !== undefined) {
			const groupId = summaryTree.groupId;
			const groupIdBlobHandle = await this.writeSummaryBlob(groupId);
			entries.push({
				mode: FileMode.File,
				path: encodeURIComponent(".groupId"),
				sha: groupIdBlobHandle,
				type: "blob",
			});
		}

		const treeHandle = await this.manager.createGitTree({ tree: entries });
		return treeHandle.sha;
	}

	private async writeSummaryTreeObject(
		object: SummaryObject,
		previousFullSnapshot: ISnapshotTreeEx | undefined,
	): Promise<string> {
		switch (object.type) {
			case SummaryType.Blob: {
				return this.writeSummaryBlob(object.content);
			}
			case SummaryType.Handle: {
				if (previousFullSnapshot === undefined) {
					throw Error("Parent summary does not exist to reference by handle.");
				}
				return this.getIdFromPath(object.handleType, object.handle, previousFullSnapshot);
			}
			case SummaryType.Tree: {
				return this.writeSummaryTreeCore(object, previousFullSnapshot);
			}
			case SummaryType.Attachment: {
				return object.id;
			}

			default:
				unreachableCase(object, `Unknown type: ${(object as any).type}`);
		}
	}

	private async writeSummaryBlob(content: string | Uint8Array): Promise<string> {
		const { parsedContent, encoding } =
			typeof content === "string"
				? { parsedContent: content, encoding: "utf-8" }
				: { parsedContent: Uint8ArrayToString(content, "base64"), encoding: "base64" };

		// The gitHashFile would return the same hash as returned by the server as blob.sha
		const hash = await gitHashFile(IsoBuffer.from(parsedContent, encoding));
		if (!this.blobsShaCache.has(hash)) {
			this.blobsShaCache.set(hash, "");
			const blob = await this.manager.createBlob(parsedContent, encoding);
			assert(hash === blob.sha, 0x0b6 /* "Blob.sha and hash do not match!!" */);
		}
		return hash;
	}

	private getIdFromPath(
		handleType: SummaryType,
		handlePath: string,
		previousFullSnapshot: ISnapshotTreeEx,
	): string {
		const path = handlePath.split("/").map((part) => decodeURIComponent(part));
		if (path[0] === "") {
			// root of tree should be unnamed
			path.shift();
		}
		if (path.length === 0) {
			return previousFullSnapshot.id;
		}

		return this.getIdFromPathCore(handleType, path, previousFullSnapshot);
	}

	private getIdFromPathCore(
		handleType: SummaryType,
		path: string[],
		/** Previous snapshot, subtree relative to this path part */
		previousSnapshot: ISnapshotTreeEx,
	): string {
		assert(path.length > 0, 0x0b3 /* "Expected at least 1 path part" */);
		const key = path[0];
		if (path.length === 1) {
			switch (handleType) {
				case SummaryType.Blob: {
					const tryId = previousSnapshot.blobs[key];
					assert(
						!!tryId,
						0x0b4 /* "Parent summary does not have blob handle for specified path." */,
					);
					return tryId;
				}
				case SummaryType.Tree: {
					const tryId = previousSnapshot.trees[key]?.id;
					assert(
						!!tryId,
						0x0b5 /* "Parent summary does not have tree handle for specified path." */,
					);
					return tryId;
				}
				default:
					throw Error(`Unexpected handle summary object type: "${handleType}".`);
			}
		}
		return this.getIdFromPathCore(handleType, path.slice(1), previousSnapshot.trees[key]);
	}
}
