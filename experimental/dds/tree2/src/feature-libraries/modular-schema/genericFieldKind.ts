/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DeltaDetachedNodeId,
	DeltaFieldChanges,
	DeltaMark,
	makeAnonChange,
	RevisionMetadataSource,
	tagChange,
	TaggedChange,
} from "../../core";
import { fail, IdAllocator } from "../../util";
import { Multiplicity } from "../multiplicity";
import { CrossFieldManager } from "./crossFieldQueries";
import {
	FieldChangeHandler,
	ToDelta,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	RelevantRemovedRootsFromChild,
	NodeChangePruner,
} from "./fieldChangeHandler";
import { FieldKindWithEditor } from "./fieldKind";
import { makeGenericChangeCodec } from "./genericFieldKindCodecs";
import { GenericChange, GenericChangeset } from "./genericFieldKindTypes";
import { NodeChangeset } from "./modularChangeTypes";

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericChangeset> = {
	rebaser: {
		compose: (
			changes: TaggedChange<GenericChangeset>[],
			composeChildren: NodeChangeComposer,
		): GenericChangeset => {
			if (changes.length === 0) {
				return [];
			}
			const composed: GenericChangeset = [];
			for (const change of changes) {
				let listIndex = 0;
				for (const { index, nodeChange } of change.change) {
					const taggedChange = tagChange(nodeChange, change.revision);
					while (listIndex < composed.length && composed[listIndex].index < index) {
						listIndex += 1;
					}
					const match: GenericChange | undefined = composed[listIndex];
					if (match === undefined) {
						composed.push({ index, nodeChange: composeChildren([taggedChange]) });
					} else if (match.index > index) {
						composed.splice(listIndex, 0, {
							index,
							nodeChange: composeChildren([taggedChange]),
						});
					} else {
						composed.splice(listIndex, 1, {
							index,
							nodeChange: composeChildren([
								// `match.nodeChange` was the result of a call to `composeChildren`,
								// so it does not need a revision tag.
								// See the contract of `FieldChangeHandler.compose`.
								makeAnonChange(match.nodeChange),
								taggedChange,
							]),
						});
					}
				}
			}
			return composed;
		},
		amendCompose: () => fail("Not implemented"),
		invert: (
			{ change }: TaggedChange<GenericChangeset>,
			invertChild: NodeChangeInverter,
		): GenericChangeset => {
			return change.map(
				({ index, nodeChange }: GenericChange): GenericChange => ({
					index,
					nodeChange: invertChild(nodeChange),
				}),
			);
		},
		rebase: rebaseGenericChange,
		prune: pruneGenericChange,
	},
	codecsFactory: makeGenericChangeCodec,
	editor: {
		buildChildChange(index, change): GenericChangeset {
			return [{ index, nodeChange: change }];
		},
	},
	intoDelta: (
		{ change }: TaggedChange<GenericChangeset>,
		deltaFromChild: ToDelta,
	): DeltaFieldChanges => {
		let nodeIndex = 0;
		const markList: DeltaMark[] = [];
		for (const { index, nodeChange } of change) {
			if (nodeIndex < index) {
				const offset = index - nodeIndex;
				markList.push({ count: offset });
				nodeIndex = index;
			}
			markList.push({ count: 1, fields: deltaFromChild(nodeChange) });
			nodeIndex += 1;
		}
		return { local: markList };
	},
	relevantRemovedRoots,
	isEmpty: (change: GenericChangeset): boolean => change.length === 0,
};

function rebaseGenericChange(
	change: GenericChangeset,
	{ change: over }: TaggedChange<GenericChangeset>,
	rebaseChild: NodeChangeRebaser,
): GenericChangeset {
	const rebased: GenericChangeset = [];
	let iChange = 0;
	let iOver = 0;
	while (iChange < change.length || iOver < over.length) {
		const a = change[iChange];
		const b = over[iOver];
		const aIndex = a?.index ?? Infinity;
		const bIndex = b?.index ?? Infinity;
		let nodeChangeA: NodeChangeset | undefined;
		let nodeChangeB: NodeChangeset | undefined;
		let index: number;
		if (aIndex === bIndex) {
			index = a.index;
			nodeChangeA = a.nodeChange;
			nodeChangeB = b.nodeChange;
			iChange += 1;
			iOver += 1;
		} else if (aIndex < bIndex) {
			index = a.index;
			nodeChangeA = a.nodeChange;
			iChange += 1;
		} else {
			index = b.index;
			nodeChangeB = b.nodeChange;
			iOver += 1;
		}

		const nodeChange = rebaseChild(nodeChangeA, nodeChangeB);
		if (nodeChange !== undefined) {
			rebased.push({
				index,
				nodeChange,
			});
		}
	}

	return rebased;
}

function pruneGenericChange(
	changeset: GenericChangeset,
	pruneChild: NodeChangePruner,
): GenericChangeset {
	const pruned: GenericChangeset = [];
	for (const change of changeset) {
		const prunedNode = pruneChild(change.nodeChange);
		if (prunedNode !== undefined) {
			pruned.push({ ...change, nodeChange: prunedNode });
		}
	}
	return pruned;
}

/**
 * {@link FieldKind} used to represent changes to elements of a field in a field-kind-agnostic format.
 */
export const genericFieldKind: FieldKindWithEditor = new FieldKindWithEditor(
	"ModularEditBuilder.Generic",
	Multiplicity.Sequence,
	genericChangeHandler,
	(types, other) => false,
	new Set(),
);

/**
 * Converts a {@link GenericChangeset} into a field-kind-specific `TChange`.
 * @param changeset - The generic changeset to convert.
 * @param target - The {@link FieldChangeHandler} for the `FieldKind` that the returned change should target.
 * @param composeChild - A delegate to compose {@link NodeChangeset}s.
 * @returns An equivalent changeset as represented by the `target` field-kind.
 */
export function convertGenericChange<TChange>(
	changeset: GenericChangeset,
	target: FieldChangeHandler<TChange>,
	composeChild: NodeChangeComposer,
	genId: IdAllocator,
	revisionMetadata: RevisionMetadataSource,
): TChange {
	const perIndex: TaggedChange<TChange>[] = changeset.map(({ index, nodeChange }) =>
		makeAnonChange(target.editor.buildChildChange(index, nodeChange)),
	);

	return target.rebaser.compose(
		perIndex,
		composeChild,
		genId,
		invalidCrossFieldManager,
		revisionMetadata,
	);
}

const invalidFunc = () => fail("Should not be called when converting generic changes");
const invalidCrossFieldManager: CrossFieldManager = {
	set: invalidFunc,
	get: invalidFunc,
};

export function newGenericChangeset(): GenericChangeset {
	return [];
}

function* relevantRemovedRoots(
	{ change }: TaggedChange<GenericChangeset>,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
): Iterable<DeltaDetachedNodeId> {
	for (const { nodeChange } of change) {
		yield* relevantRemovedRootsFromChild(nodeChange);
	}
}
