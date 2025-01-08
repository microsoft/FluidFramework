/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type DeltaDetachedNodeId,
	type DeltaMark,
	type RevisionMetadataSource,
	Multiplicity,
	type RevisionTag,
	replaceAtomRevisions,
} from "../../core/index.js";
import { type IdAllocator, fail } from "../../util/index.js";
import { assert } from "@fluidframework/core-utils/internal";
import type { CrossFieldManager } from "./crossFieldQueries.js";
import type {
	FieldChangeHandler,
	NestedChangesIndices,
	NodeChangeComposer,
	NodeChangePruner,
	NodeChangeRebaser,
	RelevantRemovedRootsFromChild,
	ToDelta,
} from "./fieldChangeHandler.js";
import { FieldKindWithEditor } from "./fieldKindWithEditor.js";
import { makeGenericChangeCodec } from "./genericFieldKindCodecs.js";
import { newGenericChangeset, type GenericChangeset } from "./genericFieldKindTypes.js";
import type { NodeId } from "./modularChangeTypes.js";
import { BTree } from "@tylerbu/sorted-btree-es6";

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericChangeset> = {
	rebaser: {
		compose,
		invert: (change: GenericChangeset): GenericChangeset => change,
		rebase: rebaseGenericChange,
		prune: pruneGenericChange,
		replaceRevisions,
	},
	codecsFactory: makeGenericChangeCodec,
	editor: {
		buildChildChange(index, change): GenericChangeset {
			return newGenericChangeset([[index, change]]);
		},
	},
	intoDelta: (change: GenericChangeset, deltaFromChild: ToDelta) => {
		let nodeIndex = 0;
		const markList: DeltaMark[] = [];
		for (const [index, nodeChange] of change.entries()) {
			if (nodeIndex < index) {
				const offset = index - nodeIndex;
				markList.push({ count: offset });
				nodeIndex = index;
			}
			const childDelta = deltaFromChild(nodeChange);
			if (childDelta !== undefined) {
				markList.push({ count: 1, fields: childDelta });
			}
			nodeIndex += 1;
		}
		return { local: markList };
	},
	relevantRemovedRoots,
	isEmpty: (change: GenericChangeset): boolean => change.length === 0,
	getNestedChanges,
	createEmpty: newGenericChangeset,
	getCrossFieldKeys: (_change) => [],
};

function compose(
	change1: GenericChangeset,
	change2: GenericChangeset,
	composeChildren: NodeChangeComposer,
): GenericChangeset {
	const composed = change1.clone();
	for (const [index, id2] of change2.entries()) {
		const id1 = composed.get(index);
		const idComposed = id1 !== undefined ? composeChildren(id1, id2) : id2;
		composed.set(index, idComposed);
	}

	return composed;
}

function getNestedChanges(change: GenericChangeset): NestedChangesIndices {
	// For generic changeset, the indices in the input and output contexts are the same.
	return change.toArray().map(([index, nodeChange]) => [nodeChange, index, index]);
}

function rebaseGenericChange(
	change: GenericChangeset,
	over: GenericChangeset,
	rebaseChild: NodeChangeRebaser,
): GenericChangeset {
	const rebased: GenericChangeset = new BTree();
	let nextIndex = 0;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const newEntry = change.getPairOrNextHigher(nextIndex);
		const baseEntry = over.getPairOrNextHigher(nextIndex);

		if (baseEntry === undefined && newEntry === undefined) {
			break;
		}

		const newIndex = newEntry?.[0] ?? Number.POSITIVE_INFINITY;
		const baseIndex = baseEntry?.[0] ?? Number.POSITIVE_INFINITY;
		let newNodeChange: NodeId | undefined;
		let baseNodeChange: NodeId | undefined;
		let index: number;
		if (newIndex === baseIndex) {
			assert(
				newEntry !== undefined && baseEntry !== undefined,
				0xa0d /* Entries should be defined */,
			);
			index = newIndex;
			newNodeChange = newEntry[1];
			baseNodeChange = baseEntry[1];
		} else if (newIndex < baseIndex) {
			assert(newEntry !== undefined, 0xa0e /* Entry should be defined */);
			index = newIndex;
			newNodeChange = newEntry[1];
		} else {
			assert(baseEntry !== undefined, 0xa0f /* Entry should be defined */);
			index = baseIndex;
			baseNodeChange = baseEntry[1];
		}

		const nodeChange = rebaseChild(newNodeChange, baseNodeChange);
		if (nodeChange !== undefined) {
			rebased.set(index, nodeChange);
		}

		nextIndex = index + 1;
	}

	return rebased;
}

function pruneGenericChange(
	changeset: GenericChangeset,
	pruneChild: NodeChangePruner,
): GenericChangeset {
	const pruned: GenericChangeset = new BTree();
	for (const [index, node] of changeset.entries()) {
		const prunedNode = pruneChild(node);
		if (prunedNode !== undefined) {
			pruned.set(index, node);
		}
	}
	return pruned;
}

function replaceRevisions(
	changeset: GenericChangeset,
	oldRevisions: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): GenericChangeset {
	return changeset.mapValues((node) => replaceAtomRevisions(node, oldRevisions, newRevision));
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
	const perIndex: TChange[] = [];
	for (const [index, nodeChange] of changeset.entries()) {
		perIndex.push(target.editor.buildChildChange(index, nodeChange));
	}

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
	onMoveIn: invalidFunc,
	moveKey: invalidFunc,
};

function* relevantRemovedRoots(
	change: GenericChangeset,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
): Iterable<DeltaDetachedNodeId> {
	for (const nodeChange of change.values()) {
		yield* relevantRemovedRootsFromChild(nodeChange);
	}
}
