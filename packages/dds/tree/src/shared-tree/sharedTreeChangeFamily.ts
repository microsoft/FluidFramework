/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ICodecFamily, ICodecOptions } from "../codec/index.js";
import {
	ChangeEncodingContext,
	ChangeFamily,
	ChangeRebaser,
	DeltaDetachedNodeId,
	RevisionMetadataSource,
	RevisionTag,
	RevisionTagCodec,
	TaggedChange,
	mapTaggedChange,
} from "../core/index.js";
import {
	fieldKinds,
	ModularChangeFamily,
	ModularChangeset,
	FieldBatchCodec,
	TreeCompressionStrategy,
	addMissingRefreshers,
	relevantRemovedRoots as defaultRelevantRemovedRoots,
	TreeChunk,
	filterSuperfluousRefreshers,
} from "../feature-libraries/index.js";
import { Mutable, NestedSet, addToNestedSet, fail, nestedSetContains } from "../util/index.js";
import { makeSharedTreeChangeCodecFamily } from "./sharedTreeChangeCodecs.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

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
	) {
		this.modularChangeFamily = new ModularChangeFamily(
			fieldKinds,
			revisionTagCodec,
			fieldBatchCodec,
			codecOptions,
			chunkCompressionStrategy,
		);
		this.codecs = makeSharedTreeChangeCodecFamily(
			this.modularChangeFamily.latestCodec,
			codecOptions,
		);
	}

	public buildEditor(changeReceiver: (change: SharedTreeChange) => void): SharedTreeEditBuilder {
		return new SharedTreeEditBuilder(this.modularChangeFamily, changeReceiver);
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

	public invert(change: TaggedChange<SharedTreeChange>, isRollback: boolean): SharedTreeChange {
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
		change: SharedTreeChange,
		over: TaggedChange<SharedTreeChange>,
		revisionMetadata: RevisionMetadataSource,
	): SharedTreeChange {
		if (change.changes.length === 0 || over.change.changes.length === 0) {
			return change;
		}

		if (hasSchemaChange(change) || hasSchemaChange(over.change)) {
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
			change.changes.length === 1 && over.change.changes.length === 1,
			0x884 /* SharedTreeChange should have exactly one inner change if no schema change is present. */,
		);

		const dataChangeIntention = change.changes[0];
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
						dataChangeIntention.innerChange,
						mapTaggedChange(over, dataChangeOver.innerChange),
						revisionMetadata,
					),
				},
			],
		};
	}

	public get rebaser(): ChangeRebaser<SharedTreeChange> {
		return this;
	}
}

function hasSchemaChange(change: SharedTreeChange): boolean {
	return change.changes.some((innerChange) => innerChange.type === "schema");
}

/**
 * Returns the set of removed roots that should be in memory for the given change to be applied.
 * A removed root is relevant if any of the following is true:
 * - It is being inserted
 * - It is being restored
 * - It is being edited
 * - The ID it is associated with is being changed
 *
 * May be conservative by returning more removed roots than strictly necessary.
 *
 * Will never return IDs for non-root trees, even if they are removed.
 *
 * @param change - The change to be applied.
 */
export function* relevantRemovedRoots(
	taggedChange: TaggedChange<SharedTreeChange>,
): Iterable<DeltaDetachedNodeId> {
	for (const innerChange of taggedChange.change.changes) {
		if (innerChange.type === "data") {
			yield* defaultRelevantRemovedRoots(
				mapTaggedChange(taggedChange, innerChange.innerChange),
			);
		}
	}
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
 * @param change - The change to compute refreshers for.
 * @param getDetachedNode - retrieves a tree chunk for the corresponding detached node id.
 * Is expected to read from a forest in a state that corresponds to the input context of the given change.
 * @returns An equivalent change with an updated set of appropriate refreshers.
 */
export function updateRefreshers(
	change: TaggedChange<SharedTreeChange>,
	getDetachedNode: (id: DeltaDetachedNodeId) => TreeChunk | undefined,
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
	// - were already included in the earlier data changes
	// - correspond to trees that were removed by earlier data changes
	const includedRoots: NestedSet<RevisionTag | undefined, number> = new Map();
	const monitoredDetachedNodes = (id: DeltaDetachedNodeId): TreeChunk | undefined => {
		addToNestedSet(includedRoots, id.major, id.minor);
		return getDetachedNode(id);
	};
	const filteredDetachedNodes = (id: DeltaDetachedNodeId): TreeChunk | undefined =>
		nestedSetContains(includedRoots, id.major, id.minor)
			? undefined
			: monitoredDetachedNodes(id);
	let isFirstDataChange = true;
	return mapDataChanges(change.change, (innerChange) => {
		const taggedInnerChange = mapTaggedChange(change, innerChange);
		const removedRoots = defaultRelevantRemovedRoots(taggedInnerChange);
		// TODO: remove this filtering stage once modularAddMissingRefreshers removes old refreshers
		const filtered = mapTaggedChange(
			change,
			filterSuperfluousRefreshers(taggedInnerChange, removedRoots),
		);
		if (isFirstDataChange) {
			isFirstDataChange = false;
			return addMissingRefreshers(filtered, monitoredDetachedNodes, removedRoots, false);
		} else {
			return addMissingRefreshers(filtered, filteredDetachedNodes, removedRoots, true);
		}
	});
}
