/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict } from "node:assert";
import { assert } from "@fluidframework/core-utils/internal";
import {
	type ChangeAtomIdMap,
	type RevisionTag,
	type TaggedChange,
	makeAnonChange,
	mapTaggedChange,
	tagChange,
	taggedOptAtomId,
} from "../core/index.js";
import type {
	NodeChangeComposer,
	NodeChangePruner,
	NodeChangeRebaser,
	NodeId,
	ToDelta,
} from "../feature-libraries/index.js";
import {
	fail,
	forEachInNestedMap,
	nestedMapFromFlatList,
	nestedMapToFlatList,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../util/index.js";
import { TestChange } from "./testChange.js";
// eslint-disable-next-line import/no-internal-modules
import type { FieldChangeDelta } from "../feature-libraries/modular-schema/fieldChangeHandler.js";

export interface ChangesetWrapper<T> {
	fieldChange: T;
	nodes: ChangeAtomIdMap<TestChange>;
}

export const ChangesetWrapper = {
	create,
	rebase,
	compose,
	invert,
	inlineRevision,
	prune,
	toDelta,
	assertEqual,
};

function create<T>(fieldChange: T, ...nodes: [NodeId, TestChange][]): ChangesetWrapper<T> {
	const nodeChanges = nestedMapFromFlatList(
		nodes.map(([id, change]) => [id.revision, id.localId, change]),
	);

	return { fieldChange, nodes: nodeChanges };
}

function rebase<T>(
	change: TaggedChange<ChangesetWrapper<T>>,
	base: TaggedChange<ChangesetWrapper<T>>,
	rebaseField: (
		change: TaggedChange<T>,
		base: TaggedChange<T>,
		rebaseChild: NodeChangeRebaser,
	) => T,
): ChangesetWrapper<T> {
	const rebasedNodes: ChangeAtomIdMap<TestChange> = new Map();
	const rebaseChild = (
		id1: NodeId | undefined,
		id2: NodeId | undefined,
	): NodeId | undefined => {
		if (id1 !== undefined) {
			const nodeChange = tryGetFromNestedMap(change.change.nodes, id1.revision, id1.localId);
			assert(nodeChange !== undefined, "Unknown node ID");
			let rebasedNode: TestChange | undefined = nodeChange;
			if (id2 !== undefined) {
				const baseNode = tryGetFromNestedMap(base.change.nodes, id2.revision, id2.localId);
				assert(baseNode !== undefined, "Unknown node ID");
				rebasedNode = TestChange.rebase(nodeChange, baseNode);
			}

			if (rebasedNode !== undefined) {
				setInNestedMap(rebasedNodes, id1.revision, id1.localId, rebasedNode);
			}
		}
		return id1;
	};

	const rebasedField = rebaseField(
		mapTaggedChange(change, change.change.fieldChange),
		{ ...base, change: base.change.fieldChange },
		rebaseChild,
	);

	return { fieldChange: rebasedField, nodes: rebasedNodes };
}

function compose<T>(
	change1: TaggedChange<ChangesetWrapper<T>>,
	change2: TaggedChange<ChangesetWrapper<T>>,
	composeField: (
		change1: TaggedChange<T>,
		change2: TaggedChange<T>,
		composeChild: NodeChangeComposer,
	) => T,
): ChangesetWrapper<T> {
	const composedNodes: ChangeAtomIdMap<TestChange> = new Map();
	const composeChild = (id1: NodeId | undefined, id2: NodeId | undefined): NodeId => {
		let composedNode: TestChange;
		if (id1 !== undefined) {
			const node1 = tryGetFromNestedMap(change1.change.nodes, id1.revision, id1.localId);
			assert(node1 !== undefined, "Unknown node ID");

			if (id2 !== undefined) {
				const node2 = tryGetFromNestedMap(change2.change.nodes, id2.revision, id2.localId);
				assert(node2 !== undefined, "Unknown node ID");
				composedNode = TestChange.compose(node1, node2);
			} else {
				composedNode = node1;
			}
		} else {
			assert(id2 !== undefined, "Should not compose two undefined nodes");
			const node2 = tryGetFromNestedMap(change2.change.nodes, id2.revision, id2.localId);
			assert(node2 !== undefined, "Unknown node ID");
			composedNode = node2;
		}

		const id =
			taggedOptAtomId(id1, change1.revision) ??
			taggedOptAtomId(id2, change2.revision) ??
			fail("Should not compose two undefined nodes");

		setInNestedMap(composedNodes, id.revision, id.localId, composedNode);
		return id;
	};

	const composedField = composeField(
		tagChange(change1.change.fieldChange, change1.revision),
		tagChange(change2.change.fieldChange, change2.revision),
		composeChild,
	);

	return { fieldChange: composedField, nodes: composedNodes };
}

function invert<T>(
	change: TaggedChange<ChangesetWrapper<T>>,
	invertField: (
		field: TaggedChange<T>,
		revision: RevisionTag | undefined,
		isRollback: boolean,
	) => T,
	revision: RevisionTag | undefined,
	isRollback: boolean = false,
): ChangesetWrapper<T> {
	const invertedField = invertField(
		tagChange(change.change.fieldChange, change.revision),
		revision,
		isRollback,
	);
	const invertedNodes: ChangeAtomIdMap<TestChange> = new Map();
	forEachInNestedMap(change.change.nodes, (testChange, revision2, localId) => {
		setInNestedMap(invertedNodes, revision2, localId, TestChange.invert(testChange));
	});

	return { fieldChange: invertedField, nodes: invertedNodes };
}

function inlineRevision<T>(
	change: ChangesetWrapper<T>,
	revisionToInline: RevisionTag,
	inlineField: (change: T, revision: RevisionTag) => T,
): ChangesetWrapper<T> {
	const fieldChange = inlineField(change.fieldChange, revisionToInline);
	const nodes = nestedMapFromFlatList(
		nestedMapToFlatList(change.nodes).map(([revision, id, node]) => [
			revision ?? revisionToInline,
			id,
			node,
		]),
	);

	return { fieldChange, nodes };
}

function prune<T>(
	change: ChangesetWrapper<T>,
	pruneField: (change: T, pruneChild: NodeChangePruner) => T,
): ChangesetWrapper<T> {
	const prunedNodes: ChangeAtomIdMap<TestChange> = new Map();
	const pruneChild = (id: NodeId): NodeId | undefined => {
		const node = tryGetFromNestedMap(change.nodes, id.revision, id.localId);
		assert(node !== undefined, "Unknown node ID");
		if (!TestChange.isEmpty(node)) {
			setInNestedMap(prunedNodes, id.revision, id.localId, node);
			return id;
		} else {
			return undefined;
		}
	};

	return { nodes: prunedNodes, fieldChange: pruneField(change.fieldChange, pruneChild) };
}

function toDelta<T>(
	change: ChangesetWrapper<T>,
	fieldToDelta: (change: T, deltaFromChild: ToDelta) => FieldChangeDelta,
): FieldChangeDelta {
	const deltaFromChild = (id: NodeId) => {
		const node = tryGetFromNestedMap(change.nodes, id.revision, id.localId);
		assert(node !== undefined, "Unknown node ID");
		return TestChange.toDelta(makeAnonChange(node));
	};

	return fieldToDelta(change.fieldChange, deltaFromChild);
}

function assertEqual<T>(
	actual: ChangesetWrapper<T>,
	expected: ChangesetWrapper<T>,
	assertFieldsEqual: (actual: T, expected: T) => void,
): void {
	assertFieldsEqual(actual.fieldChange, expected.fieldChange);
	strict.deepEqual(actual.nodes, expected.nodes);
}
