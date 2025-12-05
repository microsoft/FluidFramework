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
import type {
	ChangeEnricherMutableCheckout,
	ChangeEnricherReadonlyCheckout,
} from "../shared-tree-core/index.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

export class SharedTreeReadonlyChangeEnricher
	implements ChangeEnricherReadonlyCheckout<SharedTreeChange>
{
	/**
	 * @param borrowedForest - The state based on which to enrich changes.
	 * Not owned by the constructed instance.
	 * @param schema - The schema that corresponds to the forest.
	 * @param borrowedRemovedRoots - The set of removed roots based on which to enrich changes.
	 * Not owned by the constructed instance.
	 * @param idCompressor - The id compressor to use when chunking trees.
	 */
	public constructor(
		protected readonly borrowedForest: IForestSubscription,
		private readonly schema: TreeStoredSchemaRepository,
		protected readonly borrowedRemovedRoots: ReadOnlyDetachedFieldIndex,
		private readonly idCompressor?: IIdCompressor,
	) {}

	public fork(): ChangeEnricherMutableCheckout<SharedTreeChange> {
		return new SharedTreeMutableChangeEnricher(
			this.borrowedForest.clone(this.schema, new AnchorSet()),
			this.schema,
			this.borrowedRemovedRoots.clone(),
		);
	}

	public updateChangeEnrichments(change: SharedTreeChange): SharedTreeChange {
		return updateRefreshers(
			change,
			this.getDetachedRoot,
			relevantRemovedRoots,
			updateDataChangeRefreshers,
		);
	}

	private readonly getDetachedRoot = (id: DeltaDetachedNodeId): TreeChunk | undefined => {
		const root = this.borrowedRemovedRoots.tryGetEntry(id);
		if (root !== undefined) {
			const cursor = this.borrowedForest.getCursorAboveDetachedFields();
			const parentField = this.borrowedRemovedRoots.toFieldKey(root);
			cursor.enterField(parentField);
			cursor.enterNode(0);
			return chunkTree(cursor, {
				policy: defaultChunkPolicy,
				idCompressor: this.idCompressor,
			});
		}
		return undefined;
	};
}

export class SharedTreeMutableChangeEnricher
	extends SharedTreeReadonlyChangeEnricher
	implements ChangeEnricherMutableCheckout<SharedTreeChange>
{
	/**
	 * @param forest - The state based on which to enrich changes.
	 * Owned by the constructed instance.
	 * @param schema - The schema that corresponds to the forest.
	 * @param removedRoots - The set of removed roots based on which to enrich changes.
	 * Owned by the constructed instance.
	 * @param idCompressor - The id compressor to use when chunking trees.
	 */
	public constructor(
		private readonly forest: IEditableForest,
		schema: TreeStoredSchemaRepository,
		private readonly removedRoots: DetachedFieldIndex,
		idCompressor?: IIdCompressor,
	) {
		super(forest, schema, removedRoots, idCompressor);
	}

	public applyTipChange(change: SharedTreeChange, revision?: RevisionTag): void {
		for (const dataOrSchemaChange of change.changes) {
			const type = dataOrSchemaChange.type;
			switch (type) {
				case "data": {
					const delta = intoDelta(tagChange(dataOrSchemaChange.innerChange, revision));
					const visitor = this.forest.acquireVisitor();
					visitDelta(delta, visitor, this.removedRoots, revision);
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
