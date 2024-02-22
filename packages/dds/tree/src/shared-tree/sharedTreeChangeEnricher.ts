/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	RevisionTag,
	IEditableForest,
	DetachedFieldIndex,
	tagChange,
	DeltaDetachedNodeId,
	visitDelta,
} from "../core/index.js";
import { TreeChunk, chunkTree, defaultChunkPolicy, intoDelta } from "../feature-libraries/index.js";
import { fail } from "../util/index.js";
import { ChangeEnricherCheckout } from "./defaultCommitEnricher.js";
import { updateRefreshers } from "./sharedTreeChangeFamily.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";

export class SharedTreeChangeEnricher implements ChangeEnricherCheckout<SharedTreeChange> {
	public constructor(
		private readonly forest: IEditableForest,
		private readonly removedRoots: DetachedFieldIndex,
	) {}

	public updateChangeEnrichments(
		change: SharedTreeChange,
		revision: RevisionTag,
	): SharedTreeChange {
		const taggedChange = tagChange(change, revision);
		return updateRefreshers(taggedChange, (id: DeltaDetachedNodeId): TreeChunk | undefined => {
			const root = this.removedRoots.tryGetEntry(id);
			if (root !== undefined) {
				const cursor = this.forest.getCursorAboveDetachedFields();
				const parentField = this.removedRoots.toFieldKey(root);
				cursor.enterField(parentField);
				cursor.enterNode(0);
				return chunkTree(cursor, defaultChunkPolicy);
			}
			return undefined;
		});
	}

	public applyTipChange(change: SharedTreeChange, revision?: RevisionTag): void {
		for (const dataOrSchemaChange of change.changes) {
			if (dataOrSchemaChange.type === "data") {
				const delta = intoDelta(tagChange(dataOrSchemaChange.innerChange, revision));
				const visitor = this.forest.acquireVisitor();
				visitDelta(delta, visitor, this.removedRoots);
				visitor.free();
			} else if (dataOrSchemaChange.type === "schema") {
				// TODO: does SharedTreeChangeEnricher need to maintain a schema?
				// const visitor = this.forest.acquireVisitor();
				// for (const { root } of this.removedRoots.entries()) {
				// 	const field = this.removedRoots.toFieldKey(root);
				// 	// TODO:AD5509 Handle arbitrary-length fields once the storage of removed roots is no longer atomized.
				// 	visitor.destroy(field, 1);
				// }
				// visitor.free();
				// this.removedRoots.purge();
			} else {
				fail("Unknown Shared Tree change type.");
			}
		}
	}

	public dispose(): void {
		// TODO: how come forest doesn't have a dispose method?
	}
}
