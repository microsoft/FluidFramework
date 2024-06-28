/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaMark,
	type RevisionMetadataSource,
	Multiplicity,
	type RevisionTag,
	replaceAtomRevisions,
} from "../../core/index.js";
import { type IdAllocator, fail } from "../../util/index.js";

import type { CrossFieldManager } from "./crossFieldQueries.js";
import type {
	FieldChangeHandler,
	NodeChangeComposer,
	NodeChangePruner,
	NodeChangeRebaser,
	RelevantRemovedRootsFromChild,
	ToDelta,
} from "./fieldChangeHandler.js";
import { FieldKindWithEditor } from "./fieldKindWithEditor.js";
import { makeGenericChangeCodec } from "./genericFieldKindCodecs.js";
import type { GenericChangeset } from "./genericFieldKindTypes.js";
import type { NodeId } from "./modularChangeTypes.js";

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericChangeset> = {
	rebaser: {
		compose: (
			change1: GenericChangeset,
			change2: GenericChangeset,
			composeChildren: NodeChangeComposer,
		): GenericChangeset => {
			const composed: GenericChangeset = [];

			let listIndex1 = 0;
			let listIndex2 = 0;

			while (listIndex1 < change1.length || listIndex2 < change2.length) {
				const next1 = change1[listIndex1];
				const next2 = change2[listIndex2];
				const nodeIndex1 = next1?.index ?? Infinity;
				const nodeIndex2 = next2?.index ?? Infinity;
				if (nodeIndex1 < nodeIndex2) {
					composed.push({
						index: nodeIndex1,
						nodeChange: composeChildren(next1.nodeChange, undefined),
					});
					listIndex1 += 1;
				} else if (nodeIndex2 < nodeIndex1) {
					composed.push({
						index: nodeIndex2,
						nodeChange: composeChildren(undefined, next2.nodeChange),
					});
					listIndex2 += 1;
				} else {
					// Both nodes are at the same position.
					composed.push({
						index: nodeIndex1,
						nodeChange: composeChildren(next1.nodeChange, next2.nodeChange),
					});
					listIndex1 += 1;
					listIndex2 += 1;
				}
			}
			return composed;
		},
		invert: (change: GenericChangeset): GenericChangeset => {
			return change;
		},
		rebase: rebaseGenericChange,
		prune: pruneGenericChange,
		replaceRevisions,
	},
	codecsFactory: makeGenericChangeCodec,
	editor: {
		buildChildChange(index, change): GenericChangeset {
			return [{ index, nodeChange: change }];
		},
	},
	intoDelta: (change: GenericChangeset, deltaFromChild: ToDelta): DeltaFieldChanges => {
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
	getNestedChanges,
	createEmpty: (): GenericChangeset => [],
};

function getNestedChanges(change: GenericChangeset): [NodeId, number | undefined][] {
	return change.map(({ index, nodeChange }) => [nodeChange, index]);
}

function rebaseGenericChange(
	change: GenericChangeset,
	over: GenericChangeset,
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
		let nodeChangeA: NodeId | undefined;
		let nodeChangeB: NodeId | undefined;
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

function replaceRevisions(
	changeset: GenericChangeset,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): GenericChangeset {
	return changeset.map((change) => ({
		...change,
		nodeChange: replaceAtomRevisions(change.nodeChange, oldRevisions, newRevision),
	}));
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
	const perIndex: TChange[] = changeset.map(({ index, nodeChange }) =>
		target.editor.buildChildChange(index, nodeChange),
	);

	if (perIndex.length === 0) {
		return target.createEmpty();
	}

	return perIndex.reduce((a, b) =>
		target.rebaser.compose(
			a,
			b,
			composeChild,
			genId,
			invalidCrossFieldManager,
			revisionMetadata,
		),
	);
}

const invalidFunc = (): never => fail("Should not be called when converting generic changes");
const invalidCrossFieldManager: CrossFieldManager = {
	set: invalidFunc,
	get: invalidFunc,
};

export function newGenericChangeset(): GenericChangeset {
	return [];
}

function* relevantRemovedRoots(
	change: GenericChangeset,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
): Iterable<DeltaDetachedNodeId> {
	for (const { nodeChange } of change) {
		yield* relevantRemovedRootsFromChild(nodeChange);
	}
}
