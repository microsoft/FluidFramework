/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import {
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

/**
 * A helper for enriching `SharedTreeChange`s.
 * It lazily forks the borrowed state (which it does not mutate) and lazily applies {@link enqueueChange|changes} to the forked state when {@link enrich|commit enrichment} requires access to detached root data.
 */
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

	/**
	 * Enriches a change.
	 * @param change - The change to enrich (not mutated)
	 * @returns An enriched copy of the given `change`.
	 * @remarks
	 * Invoking this method will flush {@link enqueueChange|queued} changes if the enrichment process requires reading detached roots from the forest.
	 */
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

	/**
	 * Enqueues a change to be applied before reading detached root data during the next {@link enrich|enrichment}.
	 * @param change - The change to apply or a function that returns the change to apply.
	 * If a function is provided, it will be invoked during a future call to {@link enrich} (if at all).
	 */
	public enqueueChange(
		change: TaggedChange<SharedTreeChange> | (() => TaggedChange<SharedTreeChange>),
	): void {
		this.changeQueue.push(typeof change === "function" ? change : () => change);
	}

	/**
	 * Flushes all {@link enqueueChange|queued} changes by applying the data changes to a forked forest and detached field index.
	 * @remarks
	 * This validates that the data changes are valid.
	 */
	public purgeChangeQueue(): void {
		if (this.changeQueue.length === 0) {
			return;
		}
		if (this.owned === undefined) {
			this.onForkState?.();
			this.owned = {
				forest: this.borrowed.forest.clone(this.schema),
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

	/**
	 * Dispose of this object and its resources.
	 */
	public [disposeSymbol](): void {
		// TODO: in the future, forest and/or its AnchorSet may require disposal.
	}
}
