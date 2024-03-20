/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils";
import {
	DeltaDetachedNodeId,
	DetachedFieldIndex,
	IEditableForest,
	RevisionTag,
	tagChange,
	visitDelta,
} from "../core/index.js";
import { TreeChunk, chunkTree, defaultChunkPolicy, intoDelta } from "../feature-libraries/index.js";
import { disposeSymbol } from "../util/index.js";
import { ChangeEnricherCheckout } from "./defaultCommitEnricher.js";
import { updateRefreshers } from "./sharedTreeChangeFamily.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";

export class SharedTreeChangeEnricher implements ChangeEnricherCheckout<SharedTreeChange> {
	/**
	 * @param forest - The state based on which to enrich changes.
	 * Exclusively owned by the constructed instance.
	 * @param removedRoots - The set of removed roots based on which to enrich changes.
	 * Exclusively owned by the constructed instance.
	 */
	public constructor(
		private readonly forest: IEditableForest,
		private readonly removedRoots: DetachedFieldIndex,
	) {}

	public updateChangeEnrichments(
		change: SharedTreeChange,
		revision: RevisionTag,
	): SharedTreeChange {
		const taggedChange = tagChange(change, revision);
		return updateRefreshers(taggedChange, this.getDetachedRoot);
	}

	private readonly getDetachedRoot = (id: DeltaDetachedNodeId): TreeChunk | undefined => {
		const root = this.removedRoots.tryGetEntry(id);
		if (root !== undefined) {
			const cursor = this.forest.getCursorAboveDetachedFields();
			const parentField = this.removedRoots.toFieldKey(root);
			cursor.enterField(parentField);
			cursor.enterNode(0);
			return chunkTree(cursor, defaultChunkPolicy);
		}
		return undefined;
	};

	public applyTipChange(change: SharedTreeChange, revision?: RevisionTag): void {
		for (const dataOrSchemaChange of change.changes) {
			const type = dataOrSchemaChange.type;
			switch (type) {
				case "data": {
					const delta = intoDelta(tagChange(dataOrSchemaChange.innerChange, revision));
					const visitor = this.forest.acquireVisitor();
					visitDelta(delta, visitor, this.removedRoots);
					visitor.free();
					break;
				}
				case "schema":
					// This enricher doesn't need to maintain schema information.
					// Note that the refreshers being generated through `updateChangeEnrichments` will be encoded using
					// the schema that was used in the input context of the data changeset these refreshers are on.
					// See the encoding logic in SharedTreeCore for details.
					break;
				default:
					unreachableCase(type);
			}
		}
	}

	public [disposeSymbol](): void {
		// TODO: in the future, forest and/or its AnchorSet may require disposal.
	}
}
