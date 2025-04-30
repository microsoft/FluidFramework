/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	type ChangeAtomId,
	type DeltaDetachedNodeId,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaRoot,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionMetadataSource,
} from "../../../core/index.js";
import type {
	ComposeNodeManager,
	FieldChangeHandler,
	FieldChangeMap,
	ModularChangeFamily,
	ModularChangeset,
	NodeId,
} from "../../../feature-libraries/index.js";
import {
	newCrossFieldRangeTable,
	type ChangeAtomIdBTree,
	type CrossFieldKey,
	type CrossFieldKeyTable,
	type FieldChange,
	type FieldId,
	type NodeChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import {
	type IdAllocator,
	type Mutable,
	type RangeMap,
	type RangeQueryResult,
	brand,
	idAllocatorFromMaxId,
	newTupleBTree,
} from "../../../util/index.js";
import {
	contextualizeFieldChangeset,
	getChangeHandler,
	getParentFieldId,
	newRootTable,
	normalizeFieldId,
	renameNodes,
	type RenameDescription,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { strict as assert } from "node:assert";
import { assertStructuralEquality } from "../../objMerge.js";
import { BTree } from "@tylerbu/sorted-btree-es6";
import type { RangeQueryEntry } from "../../../util/rangeMap.js";

export const Change = {
	build,
	node,
	nodeWithId,
	field: newField,
	empty,
};

export interface FieldChangesetDescription {
	readonly fieldKey: FieldKey;
	readonly kind: FieldKindIdentifier;
	readonly changeset: unknown;
	readonly children: NodeChangesetDescription[];
}

export interface NodeChangesetDescription {
	readonly id?: NodeId;
	readonly index: number;
	readonly fields: FieldChangesetDescription[];
}

export function assertEqual<T>(actual: T, expected: T): void {
	assertStructuralEquality(actual, expected, (item) =>
		item instanceof BTree ? item.toArray() : item,
	);
}

export function assertModularChangesetsEqual(a: ModularChangeset, b: ModularChangeset): void {
	// Some changesets end up with different maxID values after rebase despite being otherwise equal.
	const aMaxId = a.maxId;
	const bMaxId = b.maxId;
	const maxId =
		aMaxId !== undefined || bMaxId !== undefined
			? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				Math.max((aMaxId ?? bMaxId)!, (bMaxId ?? aMaxId)!)
			: undefined;

	// Removing aliases ensures that we don't consider the changesets different if they only differ in their aliases.
	// It also means that we risk treating some changesets that are the same (once you consider aliases) as different.
	const aNormalized = { ...removeAliases(normalizeCrossFieldKeys(a)), maxId };
	const bNormalized = { ...removeAliases(normalizeCrossFieldKeys(b)), maxId };

	assertEqual(aNormalized, bNormalized);
}

function normalizeCrossFieldKeys(change: ModularChangeset): ModularChangeset {
	const normalized = { ...change };
	normalized.crossFieldKeys = normalizeRangeMap(
		normalized.crossFieldKeys,
		areEqualCrossFieldKeys,
		areEqualFieldIds,
	);

	return normalized;
}

function normalizeRangeMap<K, V>(
	map: RangeMap<K, V>,
	areEqualKeys: EqualityFunc<K>,
	areEqualValues: EqualityFunc<V>,
): RangeMap<K, V> {
	const normalized = map.clone();
	normalized.clear();

	let prevEntry: RangeQueryEntry<K, V> | undefined;

	for (const entry of map.entries()) {
		if (prevEntry !== undefined) {
			if (
				areEqualKeys(map.offsetKey(prevEntry.start, prevEntry.length), entry.start) &&
				areEqualValues(map.offsetValue(prevEntry.value, prevEntry.length), entry.value)
			) {
				prevEntry = { ...prevEntry, length: prevEntry.length + entry.length };
			} else {
				map.set(prevEntry.start, prevEntry.length, prevEntry.value);
				prevEntry = entry;
			}
		} else {
			prevEntry = entry;
		}
	}

	if (prevEntry !== undefined) {
		map.set(prevEntry.start, prevEntry.length, prevEntry.value);
	}

	return normalized;
}

type EqualityFunc<T> = (a: T, b: T) => boolean;

function areEqualCrossFieldKeys(a: CrossFieldKey, b: CrossFieldKey): boolean {
	return areEqualChangeAtomIds(a, b) && a.target === b.target;
}

function areEqualFieldIds(a: FieldId, b: FieldId): boolean {
	return areEqualChangeAtomIdOpts(a.nodeId, b.nodeId) && a.field === b.field;
}

export function empty(): ModularChangeset {
	return {
		fieldChanges: new Map(),
		nodeChanges: newTupleBTree(),
		rootNodes: newRootTable(),
		nodeToParent: newTupleBTree(),
		nodeAliases: newTupleBTree(),
		crossFieldKeys: newCrossFieldRangeTable(),
	};
}

export function isModularEmpty(change: ModularChangeset): boolean {
	if (change.builds !== undefined && change.builds.length > 0) {
		return false;
	}
	if (change.refreshers !== undefined && change.refreshers.length > 0) {
		return false;
	}
	if (change.destroys !== undefined && change.destroys.length > 0) {
		return false;
	}
	if (
		change.constraintViolationCount !== undefined ||
		change.constraintViolationCountOnRevert !== undefined
	) {
		return false;
	}
	if (change.crossFieldKeys.entries().length > 0) {
		return false;
	}
	if (change.fieldChanges.size > 0) {
		return false;
	}
	if (change.nodeChanges.size > 0) {
		return false;
	}
	if (change.rootNodes.nodeChanges.size > 0) {
		return false;
	}
	return true;
}

export function normalizeDelta(
	delta: DeltaRoot,
	idAllocator?: IdAllocator,
	idMap?: Map<number, number>,
): DeltaRoot {
	const genId = idAllocator ?? idAllocatorFromMaxId();
	const map = idMap ?? new Map();

	const normalized: Mutable<DeltaRoot> = {};
	if (delta.fields !== undefined) {
		normalized.fields = normalizeDeltaFieldMap(delta.fields, genId, map);
	}
	if (delta.build !== undefined && delta.build.length > 0) {
		normalized.build = delta.build.map(({ id, trees }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, map),
			trees,
		}));
	}
	if (delta.global !== undefined && delta.global.length > 0) {
		normalized.global = delta.global.map(({ id, fields }) => ({
			id: normalizeDeltaDetachedNodeId(id, genId, map),
			fields: normalizeDeltaFieldMap(fields, genId, map),
		}));
	}
	if (delta.rename !== undefined && delta.rename.length > 0) {
		normalized.rename = delta.rename.map(({ oldId, count, newId }) => ({
			oldId: normalizeDeltaDetachedNodeId(oldId, genId, map),
			count,
			newId: normalizeDeltaDetachedNodeId(newId, genId, map),
		}));
	}

	return normalized;
}

function normalizeDeltaFieldMap(
	delta: DeltaFieldMap,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaFieldMap {
	const normalized = new Map();
	for (const [field, fieldChanges] of delta) {
		normalized.set(field, normalizeDeltaFieldChanges(fieldChanges, genId, idMap));
	}
	return normalized;
}

function normalizeDeltaFieldChanges(
	delta: DeltaFieldChanges,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaFieldChanges {
	if (delta.length > 0) {
		return delta.map((mark) => normalizeDeltaMark(mark, genId, idMap));
	}

	return delta;
}

function normalizeDeltaMark(
	delta: DeltaMark,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaMark {
	const normalized: Mutable<DeltaMark> = { ...delta };
	if (normalized.attach !== undefined) {
		normalized.attach = normalizeDeltaDetachedNodeId(normalized.attach, genId, idMap);
	}
	if (normalized.detach !== undefined) {
		normalized.detach = normalizeDeltaDetachedNodeId(normalized.detach, genId, idMap);
	}
	if (normalized.fields !== undefined) {
		normalized.fields = normalizeDeltaFieldMap(normalized.fields, genId, idMap);
	}
	return normalized;
}

function normalizeDeltaDetachedNodeId(
	delta: DeltaDetachedNodeId,
	genId: IdAllocator,
	idMap: Map<number, number>,
): DeltaDetachedNodeId {
	const minor = idMap.get(delta.minor) ?? genId.allocate();
	idMap.set(delta.minor, minor);
	return { minor, major: delta.major };
}

function node(
	index: number,
	...fields: FieldChangesetDescription[]
): NodeChangesetDescription {
	return { index, fields };
}

function nodeWithId(
	index: number,
	id: NodeId,
	...fields: FieldChangesetDescription[]
): NodeChangesetDescription {
	return { id, index, fields };
}

function newField(
	fieldKey: FieldKey,
	kind: FieldKindIdentifier,
	changeset: unknown,
	...children: NodeChangesetDescription[]
): FieldChangesetDescription {
	return { fieldKey, kind, changeset, children };
}

interface BuildArgs {
	family: ModularChangeFamily;
	maxId?: number;
	revisions?: RevisionInfo[];
	renames?: RenameDescription[];
}

function build(args: BuildArgs, ...fields: FieldChangesetDescription[]): ModularChangeset {
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
	const nodeToParent: ChangeAtomIdBTree<FieldId> = newTupleBTree();
	const crossFieldKeys: CrossFieldKeyTable = newCrossFieldRangeTable();

	const idAllocator = idAllocatorFromMaxId();
	const fieldChanges = fieldChangeMapFromDescription(
		args.family,
		fields,
		undefined,
		nodeChanges,
		nodeToParent,
		crossFieldKeys,
		idAllocator,
	);

	assert(args.maxId === undefined || args.maxId >= idAllocator.getMaxId());
	const result: Mutable<ModularChangeset> = {
		nodeChanges,
		fieldChanges,
		rootNodes: newRootTable(),
		nodeToParent,
		crossFieldKeys,
		nodeAliases: newTupleBTree(),
		maxId: brand(args.maxId ?? idAllocator.getMaxId()),
	};

	if (args.revisions !== undefined) {
		result.revisions = args.revisions;
	}

	if (args.renames !== undefined) {
		for (const rename of args.renames) {
			renameNodes(result.rootNodes, rename.oldId, rename.newId, rename.count);
		}
	}

	return result;
}

function fieldChangeMapFromDescription(
	family: ModularChangeFamily,
	fields: FieldChangesetDescription[],
	parent: NodeId | undefined,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<FieldId>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator,
): FieldChangeMap {
	const map: FieldChangeMap = new Map();
	for (const field of fields) {
		const changeHandler = getChangeHandler(family.fieldKinds, field.kind);
		const fieldId: FieldId = {
			nodeId: parent,
			field: field.fieldKey,
		};

		const fieldChangeset = field.children.reduce(
			(change: unknown, nodeDescription: NodeChangesetDescription) =>
				addNodeToField(
					family,
					change,
					nodeDescription,
					fieldId,
					changeHandler,
					nodes,
					nodeToParent,
					crossFieldKeys,
					idAllocator,
				),

			field.changeset,
		);

		for (const { key, count } of changeHandler.getCrossFieldKeys(fieldChangeset)) {
			crossFieldKeys.set(key, count, fieldId);
		}

		const fieldChange: FieldChange = {
			fieldKind: field.kind,
			change: brand(fieldChangeset),
		};
		map.set(field.fieldKey, fieldChange);
	}

	return map;
}

function addNodeToField(
	family: ModularChangeFamily,
	fieldChangeset: unknown,
	nodeDescription: NodeChangesetDescription,
	parentId: FieldId,
	changeHandler: FieldChangeHandler<unknown>,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<FieldId>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator,
): unknown {
	const nodeId: NodeId = nodeDescription.id ?? {
		localId: brand(idAllocator.allocate()),
	};

	const nodeChangeset: NodeChangeset = {
		fieldChanges: fieldChangeMapFromDescription(
			family,
			nodeDescription.fields,
			nodeId,
			nodes,
			nodeToParent,
			crossFieldKeys,
			idAllocator,
		),
	};

	nodes.set([nodeId.revision, nodeId.localId], nodeChangeset);
	nodeToParent.set([nodeId.revision, nodeId.localId], parentId);

	const fieldWithChange = changeHandler.editor.buildChildChanges([
		[nodeDescription.index, nodeId],
	]);

	return changeHandler.rebaser.compose(
		contextualizeFieldChangeset(fieldWithChange),
		contextualizeFieldChangeset(fieldChangeset),
		(node1, node2) => node1 ?? node2 ?? assert.fail("Should not compose two undefined nodes"),
		idAllocator,
		dummyComposeManager,
		dummyRevisionMetadata,
	);
}

const unsupportedFunc = () => assert.fail("Not supported");

const dummyComposeManager: ComposeNodeManager = {
	getNewChangesForBaseDetach(
		baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<ChangeAtomId, NodeId> {
		return { start: baseDetachId, value: undefined, length: count };
	},

	composeAttachDetach: unsupportedFunc,
	composeDetachAttach: unsupportedFunc,
	sendNewChangesToBaseSourceLocation: unsupportedFunc,
};

const dummyRevisionMetadata: RevisionMetadataSource = {
	getIndex: unsupportedFunc,
	tryGetInfo: unsupportedFunc,
	hasRollback: unsupportedFunc,
};

export function removeAliases(changeset: ModularChangeset): ModularChangeset {
	const updatedNodeToParent = changeset.nodeToParent.mapValues((_field, [revision, localId]) =>
		getParentFieldId(changeset, { revision, localId }),
	);

	const updatedCrossFieldKeys: CrossFieldKeyTable = newCrossFieldRangeTable();
	for (const entry of changeset.crossFieldKeys.entries()) {
		updatedCrossFieldKeys.set(
			entry.start,
			entry.length,
			normalizeFieldId(entry.value, changeset.nodeAliases),
		);
	}

	return {
		...changeset,
		nodeToParent: brand(updatedNodeToParent),
		crossFieldKeys: updatedCrossFieldKeys,
		nodeAliases: newTupleBTree(),
	};
}
