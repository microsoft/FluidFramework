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
	intoDelta: (change: GenericChangeset, deltaFromChild: ToDelta): DeltaFieldChanges => {
		let nodeIndex = 0;
		const markList: DeltaMark[] = [];
		for (const [index, nodeChange] of change.entries()) {
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

function getNestedChanges(change: GenericChangeset): [NodeId, number | undefined][] {
	return change.toArray().map(([index, nodeChange]) => [nodeChange, index]);
}

function rebaseGenericChange(
	change: GenericChangeset,
	over: GenericChangeset,
	rebaseChild: NodeChangeRebaser,
): GenericChangeset {
	const rebased: GenericChangeset = change.clone();
	let nextIndex = 0;

	// eslint-disable-next-line no-constant-condition
	while (true) {
		// XXX: Handle the case where there is no new child but we must include the base changes anyway.
		const pair = change.getPairOrNextHigher(nextIndex);
		if (pair === undefined) {
			break;
		}

		const [index, node] = pair;
		const basePair = over.getPairOrNextHigher(pair[0]);
		if (basePair === undefined) {
			break;
		}

		const [baseIndex, baseNode] = basePair;
		if (index === baseIndex) {
			const rebasedChild = rebaseChild(node, baseNode);
			if (rebasedChild !== undefined) {
				rebased.set(index, rebasedChild);
			} else {
				rebased.delete(index);
			}
			nextIndex = index + 1;
		} else {
			nextIndex = baseIndex;
		}
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
export function newGenericChangeset(nodes: [number, NodeId][] = []): GenericChangeset {
	return new BTree(nodes);
}

function* relevantRemovedRoots(
	change: GenericChangeset,
	relevantRemovedRootsFromChild: RelevantRemovedRootsFromChild,
): Iterable<DeltaDetachedNodeId> {
	for (const nodeChange of change.values()) {
		yield* relevantRemovedRootsFromChild(nodeChange);
	}
}
