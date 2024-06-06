/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISummaryContext,
	ITree,
	TreeEntry,
} from "@fluidframework/driver-definitions/internal";
import {
	buildSnapshotTree,
	convertSummaryTreeToSnapshotITree,
} from "@fluidframework/driver-utils/internal";
import { FileSnapshotReader, IFileSnapshot } from "@fluidframework/replay-driver/internal";

/**
 * This storage service provides the following functionalities:
 *
 * - It can be used to load a container with a saved snapshot in `IFileSnapshot` format.
 *
 * - When a snapshot is written, it calls a callback and provide the snapshot to it in `IFileSnapshot` format. The
 * callback should be provided when creating the storage service.
 */
export class SnapshotStorageService extends FileSnapshotReader implements IDocumentStorageService {
	public constructor(
		json: IFileSnapshot,
		private readonly snapshotCb: (snapshot: IFileSnapshot) => void,
	) {
		super(json);
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const iTree = convertSummaryTreeToSnapshotITree(summary);
		// Remove null ids from the tree before calling the callback to notify the new snapshot. This is requried
		// because the saved reference snapshots have the null ids removed.
		removeNullTreeIds(iTree);

		this.docTree = buildSnapshotTree(iTree.entries, this.blobs);

		const fileSnapshot: IFileSnapshot = { tree: iTree, commits: {} };
		this.snapshotCb(fileSnapshot);

		return "testHandleId";
	}
}

/**
 * Removed null ids from the snapshot tree for ease of reading and comparison.
 */
function removeNullTreeIds(tree: ITree) {
	for (const node of tree.entries) {
		if (node.type === TreeEntry.Tree) {
			removeNullTreeIds(node.value);
		}
	}
	if (tree.id === undefined || tree.id === null) {
		delete tree.id;
	}
}
