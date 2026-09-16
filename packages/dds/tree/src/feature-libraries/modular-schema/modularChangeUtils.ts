/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	makeChangeAtomId,
	newChangeAtomIdRangeMap,
	newChangeAtomIdTransform,
	offsetChangeAtomId,
	type ChangeAtomId,
	type ChangesetLocalId,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionTag,
	type TaggedChange,
} from "../../core/index.js";
import {
	brand,
	type Mutable,
	type RangeQueryResult,
	type RangeQueryResultFragment,
} from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	rangeQueryChangeAtomIdMap,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import type { FieldChangeHandler } from "./fieldChangeHandler.js";
import { NodeAttachState } from "./fieldChangeHandler.js";
import type { FlexFieldKind } from "./fieldKind.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	newCrossFieldRangeTable,
	type CrossFieldKey,
	type CrossFieldKeyTable,
	type FieldChange,
	type FieldChangeMap,
	type FieldId,
	type ModularChangeset,
	type NodeChangeset,
	type NodeId,
	type NodeLocation,
	type RebaseVersion,
	type RootNodeTable,
} from "./modularChangeTypes.js";
import { NodeMoveType } from "./crossFieldQueries.js";

export function hasConflicts(change: ModularChangeset): boolean {
	return (change.constraintViolationCount ?? 0) > 0;
}

/**
 * Creates a normalized changeset from the provided properties.
 *
 * Required changeset maps are initialized when omitted, and empty optional properties are not
 * included in the returned changeset. `maxId` accepts an unbranded allocator ID; `undefined`
 * indicates that the changeset contains no IDs.
 */
export function makeModularChangeset(
	props: Partial<Omit<ModularChangeset, "maxId">> & { maxId?: number } = {},
): ModularChangeset {
	const p = props;
	const changeset: Mutable<ModularChangeset> = {
		rebaseVersion: p.rebaseVersion ?? 1,
		fieldChanges: p.fieldChanges ?? new Map<FieldKey, FieldChange>(),
		nodeChanges: p.nodeChanges ?? newChangeAtomIdBTree(),
		rootNodes: p.rootNodes ?? newRootTable(),
		nodeToParent: p.nodeToParent ?? newChangeAtomIdBTree(),
		nodeAliases: p.nodeAliases ?? newChangeAtomIdBTree(),
		crossFieldKeys: p.crossFieldKeys ?? newCrossFieldRangeTable(),
	};

	if (p.revisions !== undefined && p.revisions.length > 0) {
		changeset.revisions = p.revisions;
	}
	if (p.maxId !== undefined && p.maxId >= 0) {
		changeset.maxId = brand(p.maxId);
	}
	if (p.constraintViolationCount !== undefined && p.constraintViolationCount > 0) {
		changeset.constraintViolationCount = p.constraintViolationCount;
	}
	if (p.noChangeConstraint !== undefined) {
		changeset.noChangeConstraint = p.noChangeConstraint;
	}
	if (p.noChangeConstraintOnRevert !== undefined) {
		changeset.noChangeConstraintOnRevert = p.noChangeConstraintOnRevert;
	}
	if (p.builds !== undefined && p.builds.size > 0) {
		changeset.builds = p.builds;
	}
	if (p.destroys !== undefined && p.destroys.size > 0) {
		changeset.destroys = p.destroys;
	}
	if (p.refreshers !== undefined && p.refreshers.size > 0) {
		changeset.refreshers = p.refreshers;
	}
	return changeset;
}

export function getRevInfoFromTaggedChanges(changes: TaggedChange<ModularChangeset>[]): {
	revInfos: RevisionInfo[];
	maxId: ChangesetLocalId;
} {
	let maxId = -1;
	const revInfos: RevisionInfo[] = [];
	const revisions = new Set<RevisionTag>();
	for (const taggedChange of changes) {
		const change = taggedChange.change;
		maxId = Math.max(change.maxId ?? -1, maxId);
		const infosToAdd = revisionInfoFromTaggedChange(taggedChange);
		for (const info of infosToAdd) {
			if (!revisions.has(info.revision)) {
				revisions.add(info.revision);
				revInfos.push(info);
			}
		}
	}

	return { maxId: brand(maxId), revInfos };
}

export function revisionInfoFromTaggedChange(
	taggedChange: TaggedChange<ModularChangeset>,
): RevisionInfo[] {
	const revInfos: RevisionInfo[] = [];
	if (taggedChange.change.revisions !== undefined) {
		revInfos.push(...taggedChange.change.revisions);
	} else if (taggedChange.revision !== undefined) {
		const info: Mutable<RevisionInfo> = { revision: taggedChange.revision };
		if (taggedChange.rollbackOf !== undefined) {
			info.rollbackOf = taggedChange.rollbackOf;
		}
		revInfos.push(info);
	}
	return revInfos;
}

export function getChangeHandler(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	kind: FieldKindIdentifier,
): FieldChangeHandler<unknown> {
	return getFieldKind(fieldKinds, kind).changeHandler;
}

function getFieldKind(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	kind: FieldKindIdentifier,
): FlexFieldKind {
	if (kind === genericFieldKind.identifier) {
		return genericFieldKind;
	}
	const fieldKind = fieldKinds.get(kind);
	assert(fieldKind !== undefined, 0x3ad /* Unknown field kind */);
	return fieldKind;
}

export interface ConstraintState {
	violationCount: number;
}

export function newConstraintState(violationCount: number): ConstraintState {
	return {
		violationCount,
	};
}

export function updateConstraints(
	rebasedFields: FieldChangeMap,
	rebasedNodes: ChangeAtomIdBTree<NodeChangeset>,
	rebasedRoots: RootNodeTable,
	constraintState: ConstraintState,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	updateConstraintsForFields(
		rebasedFields,
		NodeAttachState.Attached,
		constraintState,
		rebasedNodes,
		fieldKinds,
	);

	for (const [_detachId, nodeId] of rebasedRoots.nodeChanges.entries()) {
		updateConstraintsForNode(
			nodeId,
			NodeAttachState.Detached,
			rebasedNodes,
			constraintState,
			fieldKinds,
		);
	}
}

function updateConstraintsForFields(
	fields: FieldChangeMap,
	inputAttachState: NodeAttachState,
	constraintState: ConstraintState,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	for (const field of fields.values()) {
		const handler = getChangeHandler(fieldKinds, field.fieldKind);
		for (const { nodeId } of handler.getNestedChanges(field.change)) {
			updateConstraintsForNode(nodeId, inputAttachState, nodes, constraintState, fieldKinds);
		}
	}
}

function updateConstraintsForNode(
	nodeId: NodeId,
	inputAttachState: NodeAttachState,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	constraintState: ConstraintState,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	const node = getFromChangeAtomIdMap(nodes, nodeId) ?? fail(0xb24 /* Unknown node ID */);

	const updatedNode: Mutable<NodeChangeset> = { ...node };
	setInChangeAtomIdMap(nodes, nodeId, updatedNode);

	if (node.nodeExistsConstraint !== undefined) {
		const isNowViolated = inputAttachState === NodeAttachState.Detached;
		if (node.nodeExistsConstraint.violated !== isNowViolated) {
			updatedNode.nodeExistsConstraint = {
				...node.nodeExistsConstraint,
				violated: isNowViolated,
			};
			constraintState.violationCount += isNowViolated ? 1 : -1;
		}
	}

	if (node.fieldChanges !== undefined) {
		updateConstraintsForFields(
			node.fieldChanges,
			inputAttachState,
			constraintState,
			nodes,
			fieldKinds,
		);
	}
}

export function nodeChangeFromId(
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	aliases: ChangeAtomIdBTree<NodeId>,
	id: NodeId,
): NodeChangeset {
	const normalizedId = normalizeNodeId(id, aliases);
	const node = getFromChangeAtomIdMap(nodes, normalizedId);
	assert(node !== undefined, 0x9ca /* Unknown node ID */);
	return node;
}

/**
 * @returns The canonical form of nodeId, according to nodeAliases
 */
export function normalizeNodeId(
	nodeId: NodeId,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): NodeId {
	let currentId = nodeId;

	while (true) {
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}

		currentId = dealiased;
	}
}

export function makeChangesetInversions(
	fields: FieldChangeMap,
	roots: RootNodeTable,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): { crossFieldKeys: CrossFieldKeyTable; nodeToParent: ChangeAtomIdBTree<NodeLocation> } {
	const crossFieldKeys: CrossFieldKeyTable = newCrossFieldRangeTable();
	const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newChangeAtomIdBTree();
	populateInversionsFromFieldMap(fields, undefined, fieldKinds, crossFieldKeys, nodeToParent);

	nodes.forEachPair(([revision, localId], node) => {
		if (node.fieldChanges !== undefined) {
			populateInversionsFromFieldMap(
				node.fieldChanges,
				{
					revision,
					localId,
				},
				fieldKinds,
				crossFieldKeys,
				nodeToParent,
			);
		}
	});

	for (const [rootId, nodeId] of roots.nodeChanges.entries()) {
		const normalizedNodeId = normalizeNodeId(nodeId, nodeAliases);
		nodeToParent.set([normalizedNodeId.revision, normalizedNodeId.localId], {
			root: makeChangeAtomId(rootId[1], rootId[0]),
		});
	}

	return { crossFieldKeys, nodeToParent };
}

function populateInversionsFromFieldMap(
	fields: FieldChangeMap,
	parent: NodeId | undefined,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	crossFieldKeys: CrossFieldKeyTable,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
): void {
	for (const [fieldKey, fieldChange] of fields) {
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		for (const { key, count } of handler.getCrossFieldKeys(fieldChange.change)) {
			crossFieldKeys.set(key, count, { nodeId: parent, field: fieldKey });
		}

		for (const { nodeId } of handler.getNestedChanges(fieldChange.change)) {
			nodeToParent.set([nodeId.revision, nodeId.localId], {
				field: { nodeId: parent, field: fieldKey },
			});
		}
	}
}

export function validateChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	let numNodes = validateFieldChanges(change, change.fieldChanges, undefined, fieldKinds);

	for (const [[revision, localId], node] of change.nodeChanges.entries()) {
		if (node.fieldChanges === undefined) {
			continue;
		}

		const nodeId: NodeId = { revision, localId };
		const numChildren = validateFieldChanges(change, node.fieldChanges, nodeId, fieldKinds);

		numNodes += numChildren;
	}

	assert(
		numNodes === change.nodeChanges.size,
		0xa4d /* Node table contains unparented nodes */,
	);
}

/**
 * Asserts that each child and cross field key in each field has a correct entry in
 * `nodeToParent` or `crossFieldKeyTable`.
 * @returns the number of children found.
 */
function validateFieldChanges(
	change: ModularChangeset,
	fieldChanges: FieldChangeMap,
	nodeParent: NodeId | undefined,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): number {
	let numChildren = 0;
	for (const [field, fieldChange] of fieldChanges.entries()) {
		const fieldId = { nodeId: nodeParent, field };
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		for (const { nodeId } of handler.getNestedChanges(fieldChange.change)) {
			const location = getNodeLocation(change, nodeId);
			assert(
				location.field !== undefined && areEqualFieldIds(location.field, fieldId),
				0xa4e /* Inconsistent node parentage */,
			);
			numChildren += 1;
		}

		for (const keyRange of handler.getCrossFieldKeys(fieldChange.change)) {
			const fields = getFieldsForCrossFieldKey(change, keyRange.key, keyRange.count);
			assert(
				fields.length === 1 && fields[0] !== undefined && areEqualFieldIds(fields[0], fieldId),
				0xa4f /* Inconsistent cross field keys */,
			);
		}
	}

	return numChildren;
}

export function getNodeLocation(changeset: ModularChangeset, nodeId: NodeId): NodeLocation {
	const location = getFromChangeAtomIdMap(changeset.nodeToParent, nodeId);
	assert(location !== undefined, 0x9cb /* Location should be defined */);
	return normalizeNodeLocation(location, changeset.nodeAliases);
}

export function normalizeNodeLocation(
	location: NodeLocation,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): NodeLocation {
	if (location.field !== undefined) {
		return { field: normalizeFieldId(location.field, nodeAliases) };
	}

	return location;
}

export function normalizeFieldId(
	fieldId: FieldId,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): FieldId {
	return fieldId.nodeId === undefined
		? fieldId
		: { ...fieldId, nodeId: normalizeNodeId(fieldId.nodeId, nodeAliases) };
}

export function getFieldsForCrossFieldKey(
	changeset: ModularChangeset,
	key: CrossFieldKey,
	count: number,
): FieldId[] {
	const fieldIds: FieldId[] = [];
	for (const { value: fieldId } of changeset.crossFieldKeys.getAll(key, count)) {
		if (fieldId !== undefined) {
			fieldIds.push(normalizeFieldId(fieldId, changeset.nodeAliases));
		}
	}

	return fieldIds;
}

export function areEqualFieldIds(a: FieldId, b: FieldId): boolean {
	return areEqualChangeAtomIdOpts(a.nodeId, b.nodeId) && a.field === b.field;
}

export function tryRemoveDetachLocation(
	roots: RootNodeTable,
	rootId: ChangeAtomId,
	count: number,
): void {
	let countProcessed = count;
	const renameEntry = roots.oldToNewId.getFirst(rootId, countProcessed);
	countProcessed = renameEntry.length;

	const outputDetachEntry = roots.outputDetachLocations.getFirst(rootId, countProcessed);
	countProcessed = outputDetachEntry.length;

	const nodeChangeEntry = rangeQueryChangeAtomIdMap(roots.nodeChanges, rootId, countProcessed);
	countProcessed = nodeChangeEntry.length;

	if (
		nodeChangeEntry.value === undefined &&
		renameEntry.value === undefined &&
		outputDetachEntry.value === undefined
	) {
		roots.detachLocations.delete(rootId, countProcessed);
	}

	const countRemaining = count - countProcessed;
	if (countRemaining > 0) {
		tryRemoveDetachLocation(roots, offsetChangeAtomId(rootId, countProcessed), countRemaining);
	}
}

export type FieldIdKey = readonly [
	RevisionTag | undefined,
	ChangesetLocalId | undefined,
	FieldKey,
];

export function fieldIdKeyFromFieldId(fieldId: FieldId): FieldIdKey {
	return [fieldId.nodeId?.revision, fieldId.nodeId?.localId, fieldId.field];
}

export function newRootTable(): RootNodeTable {
	return {
		newToOldId: newChangeAtomIdTransform(),
		oldToNewId: newChangeAtomIdTransform(),
		firstIntermediateRenames: newChangeAtomIdTransform(),
		nodeChanges: newChangeAtomIdBTree(),
		detachLocations: newChangeAtomIdRangeMap(),
		outputDetachLocations: newChangeAtomIdRangeMap(),
	};
}

export function addNodeRename(
	table: RootNodeTable,
	oldId: ChangeAtomId,
	newId: ChangeAtomId,
	count: number,
	detachLocation: FieldId | undefined,
): void {
	if (areEqualChangeAtomIds(oldId, newId)) {
		return;
	}

	for (const entry of table.oldToNewId.getAll(oldId, count)) {
		assert(
			entry.value === undefined ||
				areEqualChangeAtomIds(entry.value, offsetChangeAtomId(newId, entry.offset)),
			"New rename conflicts with existing rename",
		);
	}

	for (const entry of table.newToOldId.getAll(newId, count)) {
		assert(
			entry.value === undefined ||
				areEqualChangeAtomIds(entry.value, offsetChangeAtomId(oldId, entry.offset)),
			"New rename conflicts with existing rename",
		);
	}

	table.oldToNewId.set(oldId, count, newId);
	table.newToOldId.set(newId, count, oldId);

	if (detachLocation !== undefined) {
		table.detachLocations.set(oldId, count, detachLocation);
	}
}

export function makeCrossFieldKeyTable(
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): CrossFieldKeyTable {
	const keys: CrossFieldKeyTable = newCrossFieldRangeTable();
	populateCrossFieldKeyTableForFieldMap(keys, fields, undefined, fieldKinds);
	nodes.forEachPair(([revision, localId], node) => {
		if (node.fieldChanges !== undefined) {
			populateCrossFieldKeyTableForFieldMap(
				keys,
				node.fieldChanges,
				{
					revision,
					localId,
				},
				fieldKinds,
			);
		}
	});

	return keys;
}

function populateCrossFieldKeyTableForFieldMap(
	table: CrossFieldKeyTable,
	fields: FieldChangeMap,
	parent: NodeId | undefined,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	for (const [fieldKey, fieldChange] of fields) {
		const keys = getChangeHandler(fieldKinds, fieldChange.fieldKind).getCrossFieldKeys(
			fieldChange.change,
		);
		for (const { key, count } of keys) {
			table.set(key, count, { nodeId: parent, field: fieldKey });
		}
	}
}

export function assignRootChange(
	table: RootNodeTable,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	detachId: ChangeAtomId,
	nodeId: NodeId,
	detachLocation: FieldId | undefined,
	rebaseVersion: RebaseVersion,
): void {
	assert(
		rebaseVersion >= 2 || detachLocation !== undefined,
		"All root changes need a detach location to support compatibility with older client versions",
	);

	setInChangeAtomIdMap(table.nodeChanges, detachId, nodeId);
	setInChangeAtomIdMap(nodeToParent, nodeId, { root: detachId });

	table.detachLocations.set(detachId, 1, detachLocation);
}

export function firstDetachIdFromAttachId(
	roots: RootNodeTable,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const detachIdEntry = getOldRootIdFromNewRootId(roots, attachId, count);
	return { ...detachIdEntry, value: detachIdEntry.value ?? attachId };
}

export function firstAttachIdFromDetachId(
	roots: RootNodeTable,
	detachId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const renameEntry = getNewRootIdFromOldRootId(roots, detachId, count);
	return { ...renameEntry, value: renameEntry.value ?? detachId };
}

export function getFirstFieldForDetach(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return getFirstFieldForCrossFieldKey(
		changeset,
		{
			...attachId,
			target: NodeMoveType.Detach,
		},
		count,
	);
}

export function getFirstFieldForAttach(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return getFirstFieldForCrossFieldKey(
		changeset,
		{
			...attachId,
			target: NodeMoveType.Attach,
		},
		count,
	);
}

function getFirstFieldForCrossFieldKey(
	changeset: ModularChangeset,
	key: CrossFieldKey,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	const result = changeset.crossFieldKeys.getFirst(key, count);
	if (result.value === undefined) {
		return result;
	}

	return { ...result, value: normalizeFieldId(result.value, changeset.nodeAliases) };
}

export function fieldChangeFromId(change: ModularChangeset, id: FieldId): FieldChange {
	const fieldMap = fieldMapFromNodeId(
		change.fieldChanges,
		change.nodeChanges,
		change.nodeAliases,
		id.nodeId,
	);
	return fieldMap.get(id.field) ?? fail(0xb25 /* No field exists for the given ID */);
}

function fieldMapFromNodeId(
	rootFieldMap: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	aliases: ChangeAtomIdBTree<NodeId>,
	nodeId: NodeId | undefined,
): FieldChangeMap {
	if (nodeId === undefined) {
		return rootFieldMap;
	}

	const node = nodeChangeFromId(nodes, aliases, nodeId);
	assert(node.fieldChanges !== undefined, 0x9c9 /* Expected node to have field changes */);
	return node.fieldChanges;
}

export function doesChangeAttachNodes(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResultFragment<boolean>[] {
	return table
		.getAll({ ...id, target: NodeMoveType.Attach }, count)
		.map((entry) => ({ ...entry, value: entry.value !== undefined }));
}

export function getDetachFieldForAttach(
	table: CrossFieldKeyTable,
	roots: RootNodeTable,
	attachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	const renameEntry = firstDetachIdFromAttachId(roots, attachId, count);
	return getFirstDetachField(table, renameEntry.value, renameEntry.length);
}

export function getFirstDetachField(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return table.getFirst({ ...id, target: NodeMoveType.Detach }, count);
}

export function getAttachFieldForDetach(
	table: CrossFieldKeyTable,
	roots: RootNodeTable,
	detachId: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	const renameEntry = firstAttachIdFromDetachId(roots, detachId, count);
	return getFirstAttachField(table, renameEntry.value, renameEntry.length);
}

export function getFirstAttachField(
	table: CrossFieldKeyTable,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<FieldId | undefined> {
	return table.getFirst({ target: NodeMoveType.Attach, ...id }, count);
}

export function getNewRootIdFromOldRootId(
	roots: RootNodeTable,
	oldId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const entry = roots.oldToNewId.getFirst(oldId, count);
	return { ...entry, value: entry.value ?? oldId };
}

export function getOldRootIdFromNewRootId(
	roots: RootNodeTable,
	newId: ChangeAtomId,
	count: number,
): RangeQueryResult<ChangeAtomId> {
	const entry = roots.newToOldId.getFirst(newId, count);
	return { ...entry, value: entry.value ?? newId };
}
