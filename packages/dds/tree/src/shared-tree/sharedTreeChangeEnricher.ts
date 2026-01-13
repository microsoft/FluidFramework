/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import {
	AnchorSet,
	type DeltaDetachedNodeId,
	type DetachedFieldIndex,
	type IEditableForest,
	type IForestSubscription,
	type ReadOnlyDetachedFieldIndex,
	type RevisionTag,
	type TreeStoredSchemaRepository,
	tagChange,
	visitDelta,
} from "../core/index.js";
import {
	type TreeChunk,
	chunkTree,
	defaultChunkPolicy,
	intoDelta,
	relevantRemovedRoots,
	updateRefreshers as updateDataChangeRefreshers,
} from "../feature-libraries/index.js";
import { disposeSymbol } from "../util/index.js";
import { updateRefreshers } from "./sharedTreeChangeFamily.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import type { ChangeEnricherCheckout } from "../shared-tree-core/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

interface BorrowedState {
	readonly forest: IForestSubscription;
	readonly removedRoots: ReadOnlyDetachedFieldIndex;
}

interface OwnedState {
	readonly forest: IEditableForest;
	readonly removedRoots: DetachedFieldIndex;
}

export class SharedTreeChangeEnricher implements ChangeEnricherCheckout<SharedTreeChange> {
	private readonly changeQueue: [SharedTreeChange, RevisionTag | undefined][] = [];
	protected readonly borrowed: BorrowedState;
	protected owned?: OwnedState;

	/**
	 * @param borrowedForest - The state based on which to enrich changes.
	 * Not owned by the constructed instance.
	 * @param schema - The schema that corresponds to the forest.
	 * @param borrowedRemovedRoots - The set of removed roots based on which to enrich changes.
	 * Not owned by the constructed instance.
	 * @param idCompressor - The id compressor to use when chunking trees.
	 */
	public constructor(
		borrowedForest: IForestSubscription,
		borrowedRemovedRoots: ReadOnlyDetachedFieldIndex,
		private readonly schema: TreeStoredSchemaRepository,
		private readonly idCompressor?: IIdCompressor,
	) {
		this.borrowed = {
			forest: borrowedForest,
			removedRoots: borrowedRemovedRoots,
		};
	}

	public updateChangeEnrichments(change: SharedTreeChange): SharedTreeChange {
		return updateRefreshers(
			change,
			(id) => this.getDetachedRoot(id),
			relevantRemovedRoots,
			updateDataChangeRefreshers,
		);
	}

	private getDetachedRoot(id: DeltaDetachedNodeId): TreeChunk | undefined {
		this.purgeChangeQueue();
		const state = this.owned ?? this.borrowed;
		const root = state.removedRoots.tryGetEntry(id);
		if (root !== undefined) {
			const cursor = state.forest.getCursorAboveDetachedFields();
			const parentField = state.removedRoots.toFieldKey(root);
			cursor.enterField(parentField);
			cursor.enterNode(0);
			return chunkTree(cursor, {
				policy: defaultChunkPolicy,
				idCompressor: this.idCompressor,
			});
		}
		return undefined;
	}

	public applyTipChange(change: SharedTreeChange, revision?: RevisionTag): void {
		this.changeQueue.push([change, revision]);
	}

	private purgeChangeQueue(): void {
		if (this.owned === undefined) {
			this.owned = {
				forest: this.borrowed.forest.clone(this.schema, new AnchorSet()),
				removedRoots: this.borrowed.removedRoots.clone(),
			};
		}
		for (const [change, revision] of this.changeQueue) {
			for (const dataOrSchemaChange of change.changes) {
				const type = dataOrSchemaChange.type;
				switch (type) {
					case "data": {
						const delta = intoDelta(tagChange(dataOrSchemaChange.innerChange, revision));
						const visitor = this.owned.forest.acquireVisitor();
						visitDelta(delta, visitor, this.owned.removedRoots, revision);
						visitor.free();
						break;
					}
					case "schema": {
						// This enricher doesn't need to maintain schema information.
						// Note that the refreshers being generated through `updateChangeEnrichments` will be encoded using
						// the schema that was used in the input context of the data changeset these refreshers are on.
						// See the encoding logic in SharedTreeCore for details.
						break;
					}
					default: {
						unreachableCase(type);
					}
				}
			}
		}
		this.changeQueue.length = 0;
	}

	public [disposeSymbol](): void {
		// TODO: in the future, forest and/or its AnchorSet may require disposal.
	}
}
