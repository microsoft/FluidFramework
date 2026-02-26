/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
	AnchorSet,
	type DeltaDetachedNodeId,
	type DetachedFieldIndex,
	type IEditableForest,
	type IForestSubscription,
	type ReadOnlyDetachedFieldIndex,
	type TaggedChange,
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

interface BorrowedState {
	readonly forest: IForestSubscription;
	readonly removedRoots: ReadOnlyDetachedFieldIndex;
}

interface OwnedState {
	readonly forest: IEditableForest;
	readonly removedRoots: DetachedFieldIndex;
}

export class SharedTreeChangeEnricher {
	/**
	 * Queue of changes to be applied before querying for detached roots.
	 */
	private readonly changeQueue: (() => TaggedChange<SharedTreeChange>)[] = [];
	protected readonly borrowed: BorrowedState;
	protected owned?: OwnedState;

	/**
	 * @param borrowedForest - The state based on which to enrich changes.
	 * Not owned by the constructed instance.
	 * @param schema - The schema that corresponds to the forest.
	 * @param borrowedRemovedRoots - The set of removed roots based on which to enrich changes.
	 * Not owned by the constructed instance.
	 * @param idCompressor - The id compressor to use when chunking trees.
	 * @param onEnrichCommit - Optional callback invoked whenever a commit is enriched.
	 * @param onRefresherAdded - Optional callback invoked whenever a refresher is added during enrichment.
	 * @param onForkState - Optional callback invoked whenever the enricher forks its state.
	 * @param onApplyChange - Optional callback invoked whenever a change is applied to the owned state.
	 */
	public constructor(
		borrowedForest: IForestSubscription,
		borrowedRemovedRoots: ReadOnlyDetachedFieldIndex,
		private readonly schema: TreeStoredSchemaRepository,
		private readonly idCompressor?: IIdCompressor,
		private readonly onEnrichCommit?: () => void,
		private readonly onRefresherAdded?: () => void,
		private readonly onForkState?: () => void,
		private readonly onApplyChange?: () => void,
	) {
		this.borrowed = {
			forest: borrowedForest,
			removedRoots: borrowedRemovedRoots,
		};
	}

	public enrich(change: SharedTreeChange): SharedTreeChange {
		this.onEnrichCommit?.();
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
			this.onRefresherAdded?.();
			return chunkTree(cursor, {
				policy: defaultChunkPolicy,
				idCompressor: this.idCompressor,
			});
		}
		return undefined;
	}

	public enqueueChange(
		change: TaggedChange<SharedTreeChange> | (() => TaggedChange<SharedTreeChange>),
	): void {
		this.changeQueue.push(typeof change === "function" ? change : () => change);
	}

	private purgeChangeQueue(): void {
		if (this.changeQueue.length === 0) {
			return;
		}
		if (this.owned === undefined) {
			this.onForkState?.();
			this.owned = {
				forest: this.borrowed.forest.clone(this.schema, new AnchorSet()),
				removedRoots: this.borrowed.removedRoots.clone(),
			};
		}
		for (const getChange of this.changeQueue) {
			const { change, revision } = getChange();
			this.onApplyChange?.();
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
