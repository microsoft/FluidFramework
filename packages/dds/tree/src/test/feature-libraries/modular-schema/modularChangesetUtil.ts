/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	type ChangeAtomId,
	type ChangeAtomIdMap,
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
import {
	chunkFieldSingle,
	cursorForJsonableTreeField,
	defaultChunkPolicy,
	fieldKinds,
	jsonableTreeFromFieldCursor,
	type ComposeNodeManager,
	type FieldChangeHandler,
	type FieldChangeMap,
	type ModularChangeFamily,
	type ModularChangeset,
	type NodeId,
	type TreeChunk,
} from "../../../feature-libraries/index.js";
import {
	newCrossFieldRangeTable,
	type ChangeAtomIdBTree,
	type CrossFieldKey,
	type CrossFieldKeyTable,
	type FieldChange,
	type FieldId,
	type NodeChangeset,
	type NodeLocation,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import {
	type IdAllocator,
	type Mutable,
	type RangeMap,
	type RangeQueryEntry,
	type RangeQueryResult,
	areAdjacentIntegerRanges,
	brand,
	idAllocatorFromMaxId,
	newTupleBTree,
	setInNestedMap,
	tryGetFromNestedMap,
} from "../../../util/index.js";
import {
	contextualizeFieldChangeset,
	getChangeHandler,
	getFieldKind,
	getNodeParent,
	newRootTable,
	normalizeFieldId,
	renameNodes,
	type RenameDescription,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { strict as assert } from "node:assert";
import { assertStructuralEquality } from "../../objMerge.js";
import { BTree } from "@tylerbu/sorted-btree-es6";
import { testIdCompressor } from "../../utils.js";

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
	const aNormalized = { ...normalizeChangeset(a), maxId };
	const bNormalized = { ...normalizeChangeset(b), maxId };

	assertEqual(aNormalized, bNormalized);
}

export function normalizeChangeset(change: ModularChangeset): ModularChangeset {
	return normalizeRangeMaps(normalizeNodeIds(removeAliases(change)));
}

function normalizeNodeIds(change: ModularChangeset): ModularChangeset {
	const idAllocator = idAllocatorFromMaxId();

	const idRemappings: ChangeAtomIdMap<NodeId> = new Map();
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
	const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newTupleBTree();
	const crossFieldKeyTable: CrossFieldKeyTable = newCrossFieldRangeTable();

	const remapNodeId = (nodeId: NodeId): NodeId => {
		const newId = tryGetFromNestedMap(idRemappings, nodeId.revision, nodeId.localId);
		assert(newId !== undefined, "Unknown node ID");
		return newId;
	};

	const remapFieldId = (fieldId: FieldId): FieldId => {
		return fieldId.nodeId === undefined
			? fieldId
			: { ...fieldId, nodeId: remapNodeId(fieldId.nodeId) };
	};

	const remapNodeLocation = (location: NodeLocation): NodeLocation => {
		const remapped: NodeLocation =
			location.field !== undefined ? { field: remapFieldId(location.field) } : location;

		return remapped;
	};

	const normalizeNodeChanges = (nodeId: NodeId): NodeId => {
		const nodeChangeset = change.nodeChanges.get([nodeId.revision, nodeId.localId]);
		assert(nodeChangeset !== undefined, "Unknown node ID");

		const newId: NodeId = { localId: brand(idAllocator.allocate()) };
		setInNestedMap(idRemappings, nodeId.revision, nodeId.localId, newId);

		const parent = change.nodeToParent.get([nodeId.revision, nodeId.localId]);
		assert(parent !== undefined, "Every node should have a parent");
		const newParent = remapNodeLocation(parent);
		nodeToParent.set([newId.revision, newId.localId], newParent);

		const normalizedNodeChangeset: NodeChangeset = { ...nodeChangeset };
		if (normalizedNodeChangeset.fieldChanges !== undefined) {
			normalizedNodeChangeset.fieldChanges = normalizeNodeIdsInFields(
				normalizedNodeChangeset.fieldChanges,
			);
		}

		nodeChanges.set([newId.revision, newId.localId], normalizedNodeChangeset);

		return newId;
	};

	function normalizeNodeIdsInFields(fields: FieldChangeMap): FieldChangeMap {
		const normalizedFieldChanges: FieldChangeMap = new Map();

		for (const [field, fieldChange] of fields) {
			const changeHandler = getFieldKind(fieldKinds, fieldChange.fieldKind).changeHandler;

			// TODO: This relies on field kinds calling prune child on all changes,
			// while pruning is supposed to be an optimization which could be skipped.
			normalizedFieldChanges.set(
				field,
				changeHandler.rebaser.prune(fieldChange.change, normalizeNodeChanges),
			);

			const crossFieldKeys = changeHandler.getCrossFieldKeys(fieldChange.change);
			for (const { key, count } of crossFieldKeys) {
				const prevId = change.crossFieldKeys.getFirst(key, count)?.value;
				assert(prevId !== undefined, "Should be an entry for each cross-field key");
				crossFieldKeyTable.set(key, count, remapFieldId(prevId));
			}
		}

		return normalizedFieldChanges;
	}

	// TODO: Normalize IDs for detached roots
	const fieldChanges = normalizeNodeIdsInFields(change.fieldChanges);
	assert(nodeChanges.size + change.rootNodes.nodeChanges.size === change.nodeChanges.size);

	const normal: Mutable<ModularChangeset> = {
		...change,
		nodeChanges,
		fieldChanges,
		nodeToParent,
		crossFieldKeys: crossFieldKeyTable,
	};

	// The TreeChunk objects need to be deep cloned to avoid comparison issues on reference counting
	if (change.builds !== undefined) {
		normal.builds = brand(change.builds.mapValues(deepCloneChunkedTree));
	}
	if (change.refreshers !== undefined) {
		normal.refreshers = brand(change.refreshers.mapValues(deepCloneChunkedTree));
	}
	return normal;
}

function deepCloneChunkedTree(chunk: TreeChunk): TreeChunk {
	const jsonable = jsonableTreeFromFieldCursor(chunk.cursor());
	const cursor = cursorForJsonableTreeField(jsonable);
	const clone = chunkFieldSingle(cursor, {
		policy: defaultChunkPolicy,
		idCompressor: testIdCompressor,
	});
	return clone;
}

function normalizeRangeMaps(change: ModularChangeset): ModularChangeset {
	const normalized = { ...change };
	normalized.crossFieldKeys = normalizeRangeMap(
		change.crossFieldKeys,
		areEqualCrossFieldKeys,
		areEqualFieldIds,
	);

	normalized.rootNodes.oldToNewId = normalizeRangeMap(
		change.rootNodes.oldToNewId,
		areEqualChangeAtomIds,
		areEqualChangeAtomIds,
	);

	normalized.rootNodes.newToOldId = normalizeRangeMap(
		change.rootNodes.newToOldId,
		areEqualChangeAtomIds,
		areEqualChangeAtomIds,
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
				normalized.set(prevEntry.start, prevEntry.length, prevEntry.value);
				prevEntry = entry;
			}
		} else {
			prevEntry = entry;
		}
	}

	if (prevEntry !== undefined) {
		normalized.set(prevEntry.start, prevEntry.length, prevEntry.value);
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
	const normalizedMarks = [];
	let lastMark: Mutable<DeltaMark> | undefined;
	for (const mark of delta) {
		const normalizedMark = normalizeDeltaMark(mark, genId, idMap);
		if (lastMark !== undefined && canMergeDeltaMarks(lastMark, normalizedMark)) {
			lastMark.count += normalizedMark.count;
		} else {
			normalizedMarks.push(normalizedMark);
			lastMark = normalizedMark;
		}
	}

	return normalizedMarks;
}

function canMergeDeltaMarks(mark1: DeltaMark, mark2: DeltaMark): boolean {
	return (
		mark1.fields === undefined &&
		mark2.fields === undefined &&
		areAdjacentDeltaIdRanges(mark1.attach, mark1.count, mark2.attach) &&
		areAdjacentDeltaIdRanges(mark1.detach, mark1.count, mark2.detach)
	);
}

function areAdjacentDeltaIdRanges(
	id1: DeltaDetachedNodeId | undefined,
	count1: number,
	id2: DeltaDetachedNodeId | undefined,
): boolean {
	if (id1 === undefined || id2 === undefined) {
		return id1 === id2;
	}

	return id1.major === id2.major && areAdjacentIntegerRanges(id1.minor, count1, id2.minor);
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
	roots?: { detachId: ChangeAtomId; change: NodeChangesetDescription }[];
}

function build(args: BuildArgs, ...fields: FieldChangesetDescription[]): ModularChangeset {
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
	const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newTupleBTree();
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

	const rootNodes = newRootTable();

	if (args.roots !== undefined) {
		for (const { detachId, change } of args.roots) {
			rootNodes.nodeChanges.set(
				[detachId.revision, detachId.localId],
				addNodeToChangeset(
					args.family,
					change,
					{ root: detachId },
					nodeChanges,
					nodeToParent,
					crossFieldKeys,
					idAllocator,
				),
			);
		}
	}

	assert(args.maxId === undefined || args.maxId >= idAllocator.getMaxId());
	const result: Mutable<ModularChangeset> = {
		nodeChanges,
		fieldChanges,
		rootNodes,
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
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
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
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator,
): unknown {
	const fieldWithChange = changeHandler.editor.buildChildChanges([
		[
			nodeDescription.index,
			addNodeToChangeset(
				family,
				nodeDescription,
				{ field: parentId },
				nodes,
				nodeToParent,
				crossFieldKeys,
				idAllocator,
			),
		],
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

function addNodeToChangeset(
	family: ModularChangeFamily,
	nodeDescription: NodeChangesetDescription,
	location: NodeLocation,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	crossFieldKeys: CrossFieldKeyTable,
	idAllocator: IdAllocator,
): NodeId {
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
	nodeToParent.set([nodeId.revision, nodeId.localId], location);

	return nodeId;
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
	compareRevisions: unsupportedFunc,
	tryGetInfo: unsupportedFunc,
	hasRollback: unsupportedFunc,
};

export function removeAliases(changeset: ModularChangeset): ModularChangeset {
	const updatedNodeToParent = changeset.nodeToParent.mapValues((_field, [revision, localId]) =>
		getNodeParent(changeset, { revision, localId }),
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
