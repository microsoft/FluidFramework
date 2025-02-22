/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ICodecFamily, ICodecOptions } from "../codec/index.js";
import {
	type ChangeEncodingContext,
	type ChangeFamily,
	type ChangeRebaser,
	type DeltaDetachedNodeId,
	type RevisionMetadataSource,
	type RevisionTag,
	type RevisionTagCodec,
	type TaggedChange,
	mapTaggedChange,
} from "../core/index.js";
import {
	type FieldBatchCodec,
	ModularChangeFamily,
	type ModularChangeset,
	type TreeChunk,
	type TreeCompressionStrategy,
	fieldKindConfigurations,
	fieldKinds,
	makeModularChangeCodecFamily,
} from "../feature-libraries/index.js";
import {
	type Mutable,
	type NestedSet,
	addToNestedSet,
	fail,
	hasSingle,
	nestedSetContains,
} from "../util/index.js";

import { makeSharedTreeChangeCodecFamily } from "./sharedTreeChangeCodecs.js";
import type { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";
import type { IIdCompressor } from "@fluidframework/id-compressor";

/**
 * Implementation of {@link ChangeFamily} that combines edits to fields and schema changes.
 *
 * @sealed
 */
export class SharedTreeChangeFamily
	implements
		ChangeFamily<SharedTreeEditBuilder, SharedTreeChange>,
		ChangeRebaser<SharedTreeChange>
{
	public static readonly emptyChange: SharedTreeChange = {
		changes: [],
	};

	public readonly codecs: ICodecFamily<SharedTreeChange, ChangeEncodingContext>;
	private readonly modularChangeFamily: ModularChangeFamily;

	public constructor(
		revisionTagCodec: RevisionTagCodec,
		fieldBatchCodec: FieldBatchCodec,
		codecOptions: ICodecOptions,
		chunkCompressionStrategy?: TreeCompressionStrategy,
		private readonly idCompressor?: IIdCompressor,
	) {
		const modularChangeCodec = makeModularChangeCodecFamily(
			fieldKindConfigurations,
			revisionTagCodec,
			fieldBatchCodec,
			codecOptions,
			chunkCompressionStrategy,
		);
		this.modularChangeFamily = new ModularChangeFamily(fieldKinds, modularChangeCodec);
		this.codecs = makeSharedTreeChangeCodecFamily(
			this.modularChangeFamily.codecs,
			codecOptions,
		);
	}

	public buildEditor(
		mintRevisionTag: () => RevisionTag,
		changeReceiver: (change: TaggedChange<SharedTreeChange>) => void,
	): SharedTreeEditBuilder {
		return new SharedTreeEditBuilder(
			this.modularChangeFamily,
			mintRevisionTag,
			changeReceiver,
			this.idCompressor,
		);
	}

	public compose(changes: TaggedChange<SharedTreeChange>[]): SharedTreeChange {
		const newChanges: Mutable<SharedTreeChange["changes"]> = [];
		const dataChangeRun: TaggedChange<ModularChangeset>[] = [];

		const flushDataChangeRun = (): void => {
			if (dataChangeRun.length > 0) {
				newChanges.push({
					type: "data",
					innerChange: this.modularChangeFamily.compose(dataChangeRun),
				});
				dataChangeRun.length = 0;
			}
		};

		for (const topChange of changes) {
			for (const change of topChange.change.changes) {
				if (change.type === "schema") {
					flushDataChangeRun();
					newChanges.push(change);
				} else {
					dataChangeRun.push(mapTaggedChange(topChange, change.innerChange));
				}
			}
		}

		flushDataChangeRun();
		return { changes: newChanges };
	}

	public invert(
		change: TaggedChange<SharedTreeChange>,
		isRollback: boolean,
		revision: RevisionTag,
	): SharedTreeChange {
		const invertInnerChange: (
			innerChange: SharedTreeChange["changes"][number],
		) => SharedTreeChange["changes"][number] = (innerChange) => {
			switch (innerChange.type) {
				case "data":
					return {
						type: "data",
						innerChange: this.modularChangeFamily.invert(
							mapTaggedChange(change, innerChange.innerChange),
							isRollback,
							revision,
						),
					};
				case "schema": {
					return {
						type: "schema",
						innerChange: {
							schema: {
								new: innerChange.innerChange.schema.old,
								old: innerChange.innerChange.schema.new,
							},
							isInverse: true,
						},
					};
				}
				default:
					fail("Unknown SharedTree change type.");
			}
		};
		return {
			changes: change.change.changes.map(invertInnerChange).reverse(),
		};
	}

	public rebase(
		change: TaggedChange<SharedTreeChange>,
		over: TaggedChange<SharedTreeChange>,
		revisionMetadata: RevisionMetadataSource,
	): SharedTreeChange {
		if (change.change.changes.length === 0 || over.change.changes.length === 0) {
			return change.change;
		}

		if (hasSchemaChange(change.change) || hasSchemaChange(over.change)) {
			// Any SharedTreeChange (a list of sub-changes) that contains a schema change will cause ANY change that rebases over it to conflict.
			// Similarly, any SharedTreeChange containing a schema change will fail to rebase over ANY change.
			// Those two combine to mean: no concurrency with schema changes is supported.
			// This is fine because it's an open problem. Example: a tree with an A at the root and a schema that allows an A | B at the root will
			// become out of schema if a schema changes to restrict root types to just A is concurrent with a data change that sets it to a B.
			// We don't have an efficient way to detect this document-wide and there are varying opinions on restricting schema changes to prevent this.
			// A SharedTreeChange containing a schema change will NOT conflict in a non-concurrency case, as the "meatless sandwich" optimization
			// will result in rebase never being called.
			return SharedTreeChangeFamily.emptyChange;
		}
		assert(
			hasSingle(change.change.changes) && hasSingle(over.change.changes),
			0x884 /* SharedTreeChange should have exactly one inner change if no schema change is present. */,
		);

		const dataChangeIntention = change.change.changes[0];
		const dataChangeOver = over.change.changes[0];
		assert(
			dataChangeIntention.type === "data" && dataChangeOver.type === "data",
			0x885 /* Data change should be present. */,
		);

		return {
			changes: [
				{
					type: "data",
					innerChange: this.modularChangeFamily.rebase(
						mapTaggedChange(change, dataChangeIntention.innerChange),
						mapTaggedChange(over, dataChangeOver.innerChange),
						revisionMetadata,
					),
				},
			],
		};
	}

	public changeRevision(
		change: SharedTreeChange,
		newRevision: RevisionTag | undefined,
		rollbackOf?: RevisionTag,
	): SharedTreeChange {
		return {
			changes: change.changes.map((inner) => {
				return inner.type === "data"
					? {
							...inner,
							innerChange: this.modularChangeFamily.rebaser.changeRevision(
								inner.innerChange,
								newRevision,
								rollbackOf,
							),
						}
					: inner;
			}),
		};
	}

	public get rebaser(): ChangeRebaser<SharedTreeChange> {
		return this;
	}
}

export function hasSchemaChange(change: SharedTreeChange): boolean {
	return change.changes.some((innerChange) => innerChange.type === "schema");
}

function mapDataChanges(
	change: SharedTreeChange,
	map: (change: ModularChangeset) => ModularChangeset,
): SharedTreeChange {
	return {
		changes: change.changes.map((dataOrSchemaChange) => {
			if (dataOrSchemaChange.type === "data") {
				return {
					type: "data",
					innerChange: map(dataOrSchemaChange.innerChange),
				};
			}
			return dataOrSchemaChange;
		}),
	};
}

/**
 * Produces an equivalent change with an updated set of appropriate refreshers.
 * @param change - The change to compute refreshers for. Not mutated.
 * @param getDetachedNode - retrieves a {@link TreeChunk} for the corresponding detached node id.
 * Is expected to read from a forest in a state that corresponds to the input context of the given change.
 * @returns An equivalent change with an updated set of appropriate refreshers.
 */
export function updateRefreshers(
	change: SharedTreeChange,
	getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
	relevantRemovedRootsFromDataChange: (
		taggedChange: ModularChangeset,
	) => Iterable<DeltaDetachedNodeId>,
	updateDataChangeRefreshers: (
		change: ModularChangeset,
		getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
		removedRoots: Iterable<DeltaDetachedNodeId>,
		requireRefreshers: boolean,
	) => ModularChangeset,
): SharedTreeChange {
	// Adding refreshers to a SharedTreeChange is not as simple as adding refreshers to each of its data changes.
	// This is because earlier data changes affect the state of the forest in ways that can influence the refreshers
	// needed for later data changes. This can happen in two ways:
	// 1. By removing a tree that is a relevant root to a later data change.
	// 2. By changing the contents of a tree that is a relevant root to a later data change.
	// (Note that these two cases can compound)
	// Thankfully, in both of these cases, refreshers can be omitted from the later data changes because the forest
	// applying those data changes is guaranteed to still have have the relevant trees in memory.
	// This means that for the first data change, all required refreshers should be added (and none should be missing).
	// While for later data changes, we should not include refreshers that either:
	// A) were already included in the earlier data changes
	// B) correspond to trees that were removed by earlier data changes
	// Set A is excluded by tracking which roots have already been included in the earlier data changes, and filtering
	// them out from the relevant removed roots.
	// Set B is excluded because the `getDetachedNode` is bound to return `undefined` for them, which tell
	// `defaultUpdateRefreshers` to ignore. One downside of this approach is that it prevents `defaultUpdateRefreshers`
	// from detecting cases where a detached node is missing for another reason (which would be a bug).

	// The roots that have been included as refreshers across all data changes so far.
	const includedRoots: NestedSet<RevisionTag | undefined, number> = new Map();
	function getAndRememberDetachedNode(id: DeltaDetachedNodeId): TreeChunk | undefined {
		addToNestedSet(includedRoots, id.major, id.minor);
		return getDetachedNode(id);
	}
	function* filterIncludedRoots(
		toFilter: Iterable<DeltaDetachedNodeId>,
	): Iterable<DeltaDetachedNodeId> {
		for (const id of toFilter) {
			if (!nestedSetContains(includedRoots, id.major, id.minor)) {
				yield id;
			}
		}
	}
	let isFirstDataChange = true;
	return mapDataChanges(change, (dataChange) => {
		const removedRoots = relevantRemovedRootsFromDataChange(dataChange);
		if (isFirstDataChange) {
			isFirstDataChange = false;
			return updateDataChangeRefreshers(
				dataChange,
				getAndRememberDetachedNode,
				removedRoots,
				true,
			);
		} else {
			return updateDataChangeRefreshers(
				dataChange,
				getAndRememberDetachedNode,
				filterIncludedRoots(removedRoots),
				false,
			);
		}
	});
}
