/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, skipInProduction } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";
import {
	areEqualChangeAtomIdOpts,
	areEqualChangeAtomIds,
	makeChangeAtomId,
	newChangeAtomIdRangeMap,
	newChangeAtomIdTransform,
	offsetChangeAtomId,
	type ChangeAtomId,
	type ChangeAtomIdMap,
	RebaseValidation,
	type ChangesetLocalId,
	type FieldKey,
	type FieldKindIdentifier,
	type RevisionInfo,
	type RevisionTag,
	type TaggedChange,
	type TreeChunk,
	comparePartialRevisions,
	comparePartialChangesetLocalIds,
} from "../../core/index.js";
import {
	brand,
	compareStrings,
	createTupleComparator,
	hasConflict,
	hasSome,
	idAllocatorFromMaxId,
	merge,
	newTupleBTree,
	setInNestedMap,
	tryGetFromNestedMap,
	type Mutable,
	type RangeMap,
	type RangeMapEntry,
	type RangeQueryResult,
	type RangeQueryResultFragment,
	type TupleBTree,
} from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	rangeQueryChangeAtomIdMap,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import { NodeMoveType } from "./crossFieldQueries.js";
import type { FieldChangeHandler } from "./fieldChangeHandler.js";
import type { FieldKindConfiguration } from "./fieldKindConfiguration.js";
import { NodeAttachState } from "./fieldChangeHandler.js";
import type { FlexFieldKind } from "./fieldKind.js";
import { genericFieldKind } from "./genericFieldKind.js";
import {
	newCrossFieldRangeTable,
	type CrossFieldKey,
	type CrossFieldKeyTable,
	type CrossFieldRangeTable,
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
import { makeDummyChunk } from "./chunkUtils.js";

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
	// Node IDs in field changes and in the root table should always be normalized.
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
	const visited = newChangeAtomIdBTree<true>();
	let currentId = nodeId;

	while (true) {
		visited.set([currentId.revision, currentId.localId], true);
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}
		assert(!visited.has([dealiased.revision, dealiased.localId]), 0xd42 /* Node alias loop */);

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

export function fieldKindsFromConfiguration(
	configuration: FieldKindConfiguration,
): ReadonlyMap<FieldKindIdentifier, FlexFieldKind> {
	return new Map(Array.from(configuration.values(), ({ kind }) => [kind.identifier, kind]));
}

export interface ValidationOptions {
	/**
	 * When set to true, the cross field table will not be validated.
	 * @defaultValue `false`
	 */
	ignoreCrossFieldTable?: boolean;
}

export function validateChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	options: ValidationOptions = {},
): void {
	const result = isChangesetValid(change, fieldKinds, options);
	if (result !== true) {
		throw new Error(`Malformed changeset: ${result}`);
	}
}

/**
 * Debug-only validation function to check if a change is well-formed.
 * @param change - The change to validate.
 * @returns In production builds, always returns `true`.
 * In debug builds, returns `true` if the change is well-formed, otherwise a string describing the validation error.
 * @remarks
 * Using this function over {@link isSharedTreeChangeValid} allows tree-shaking of the validation logic in production builds.
 */
export let debugOnlyChangesetValidator: (
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	options?: ValidationOptions,
) => true | string = () => true;
skipInProduction(() => {
	debugOnlyChangesetValidator = isChangesetValid;
});

export function isChangesetValid(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	options: ValidationOptions = {},
): true | string {
	for (const nodeIdKey of change.nodeChanges.keys()) {
		if (!change.nodeToParent.has(nodeIdKey)) {
			return `Missing nodeToParent entry for node change with key ${JSON.stringify(nodeIdKey)}`;
		}
	}

	const unreachableNodes: ChangeAtomIdBTree<NodeLocation> = brand(change.nodeToParent.clone());
	const unreachableCFKs = change.crossFieldKeys.clone();

	const rootFieldResult = validateFieldChanges(
		fieldKinds,
		change,
		change.fieldChanges,
		undefined,
		unreachableNodes,
		unreachableCFKs,
		options,
	);
	if (rootFieldResult !== true) {
		return rootFieldResult;
	}

	for (const [[revision, localId], node] of change.nodeChanges.entries()) {
		if (node.fieldChanges === undefined) {
			continue;
		}

		const nodeId = normalizeNodeId({ revision, localId }, change.nodeAliases);
		const fieldResult = validateFieldChanges(
			fieldKinds,
			change,
			node.fieldChanges,
			nodeId,
			unreachableNodes,
			unreachableCFKs,
			options,
		);
		if (fieldResult !== true) {
			return fieldResult;
		}
	}

	for (const [detachIdKey, nodeId] of change.rootNodes.nodeChanges.entries()) {
		const detachId: ChangeAtomId = { revision: detachIdKey[0], localId: detachIdKey[1] };
		const normalizedNodeId = normalizeNodeId(nodeId, change.nodeAliases);
		const location = getFromChangeAtomIdMap(change.nodeToParent, normalizedNodeId);
		if (location === undefined) {
			return `Missing nodeToParent entry for root node change with key ${JSON.stringify(normalizedNodeId)}`;
		}
		if (!areEqualChangeAtomIdOpts(location.root, detachId)) {
			return "Inconsistent node location";
		}

		unreachableNodes.delete([normalizedNodeId.revision, normalizedNodeId.localId]);
	}

	if (!containsRollbacks(change)) {
		for (const entry of change.crossFieldKeys.entries()) {
			if (entry.start.target !== NodeMoveType.Attach) {
				continue;
			}

			const attachResult = validateAttach(change, entry.start, entry.length);
			if (attachResult !== true) {
				return attachResult;
			}
		}
	}

	if (unreachableNodes.size > 0) {
		return `${unreachableNodes.size} unreachable nodes found`;
	}
	if (unreachableCFKs.entries().length > 0) {
		return "Unreachable cross-field keys found";
	}

	return true;
}

function containsRollbacks(change: ModularChangeset): boolean {
	if (change.revisions === undefined) {
		return false;
	}

	for (const revInfo of change.revisions) {
		if (revInfo.rollbackOf !== undefined) {
			return true;
		}
	}
	return false;
}

function validateAttach(
	changeset: ModularChangeset,
	attachId: ChangeAtomId,
	count: number,
): true | string {
	let countProcessed = count;
	const buildEntry = hasBuildForIdRange(changeset.builds, attachId, countProcessed);
	countProcessed = buildEntry.length;
	const refresherEntry = hasBuildForIdRange(changeset.refreshers, attachId, countProcessed);
	countProcessed = refresherEntry.length;

	const detachEntry = getDetachFieldForAttach(
		changeset.crossFieldKeys,
		changeset.rootNodes,
		attachId,
		countProcessed,
	);
	countProcessed = detachEntry.length;

	const renameEntry = changeset.rootNodes.newToOldId.getFirst(attachId, countProcessed);
	countProcessed = renameEntry.length;

	if (
		!buildEntry.value &&
		!refresherEntry.value &&
		detachEntry.value === undefined &&
		renameEntry.value === undefined
	) {
		return "No build, refresher, detach, or rename found for attach";
	}

	if (countProcessed < count) {
		return validateAttach(
			changeset,
			offsetChangeAtomId(attachId, countProcessed),
			count - countProcessed,
		);
	}
	return true;
}

function hasBuildForIdRange(
	builds: ChangeAtomIdBTree<TreeChunk> | undefined,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<boolean> {
	if (builds === undefined) {
		return { value: false, length: count };
	}

	const prevBuildEntry = builds.nextLowerPair([id.revision, id.localId]);

	if (prevBuildEntry !== undefined) {
		const prevBuildKey: ChangeAtomId = {
			revision: prevBuildEntry[0][0],
			localId: prevBuildEntry[0][1],
		};

		const prevBuildLength = prevBuildEntry[1].topLevelLength;
		const lastLocalId = prevBuildKey.localId + prevBuildLength - 1;
		if (prevBuildKey.revision === id.revision && lastLocalId >= id.localId) {
			return { value: true, length: Math.min(count, lastLocalId - id.localId + 1) };
		}
	}

	const buildEntry = rangeQueryChangeAtomIdMap(builds, id, count);
	const length =
		buildEntry.value === undefined ? buildEntry.length : buildEntry.value.topLevelLength;

	const hasBuild = buildEntry.value !== undefined;
	return { value: hasBuild, length };
}

/**
 * Asserts that each node has a correct entry in `change.nodeToParent`,
 * and each cross field key has a correct entry in `change.crossFieldKeys`.
 * @returns the number of children found.
 */
function validateFieldChanges(
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	change: ModularChangeset,
	fieldChanges: FieldChangeMap,
	nodeParent: NodeId | undefined,
	unreachableNodes: ChangeAtomIdBTree<NodeLocation>,
	unreachableCFKs: CrossFieldRangeTable<FieldId>,
	options: ValidationOptions = {},
): true | string {
	for (const [field, fieldChange] of fieldChanges.entries()) {
		const fieldId = { nodeId: nodeParent, field };
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
		for (const { nodeId } of handler.getNestedChanges(fieldChange.change)) {
			const normalizedNodeId = normalizeNodeId(nodeId, change.nodeAliases);
			const parentLocation = getFromChangeAtomIdMap(change.nodeToParent, normalizedNodeId);
			if (parentLocation === undefined) {
				return `NodeId ${JSON.stringify(normalizedNodeId)} is missing from the nodeToParent table`;
			}

			const normalizedParentLocation = normalizeNodeLocation(
				parentLocation,
				change.nodeAliases,
			);
			if (
				normalizedParentLocation.field === undefined ||
				!areEqualFieldIds(normalizedParentLocation.field, fieldId)
			) {
				return "Inconsistent node location";
			}

			if (!unreachableNodes.has([normalizedNodeId.revision, normalizedNodeId.localId])) {
				return `Node ${JSON.stringify(normalizedNodeId)} is reachable in multiple locations`;
			}
			unreachableNodes.delete([normalizedNodeId.revision, normalizedNodeId.localId]);
		}

		if (!(options.ignoreCrossFieldTable ?? false)) {
			const keysInField = handler.getCrossFieldKeys(fieldChange.change);
			for (const keyRange of keysInField) {
				const fields = getFieldsForCrossFieldKey(change, keyRange.key, keyRange.count);
				if (!hasSome(fields)) {
					return `Cross-field key ${JSON.stringify(keyRange.key)} is missing in the cross-field key table`;
				}
				if (fields.some((f) => !areEqualFieldIds(f, fieldId))) {
					return `Cross-field key table is pointing to the wrong field for key ${JSON.stringify(keyRange.key)}`;
				}

				unreachableCFKs.delete(keyRange.key, keyRange.count);
			}

			// This check is linear in the size of the changeset, and can be called linearly many times.
			// It is therefore only run in strict validation mode
			if (RebaseValidation.currentLevel === RebaseValidation.Level.Strict) {
				const countInChange = keysInField.reduce((acc, { count }) => acc + count, 0);
				const keysInTable = change.crossFieldKeys
					.entries()
					.filter(({ value }) =>
						areEqualFieldIds(normalizeFieldId(value, change.nodeAliases), fieldId),
					);
				const countInTable = keysInTable.reduce((acc, { length }) => acc + length, 0);
				if (countInChange !== countInTable) {
					return `Mismatch between cross-field key table and changeset for field ${JSON.stringify(fieldId)}`;
				}
			}
		}
	}
	return true;
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

export function normalizeFieldIdOpt(
	fieldId: FieldId | undefined,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): FieldId | undefined {
	return fieldId === undefined ? undefined : normalizeFieldId(fieldId, nodeAliases);
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
	return table.getFirst({ ...id, target: NodeMoveType.Attach }, count);
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

export function getNodeParent(changeset: ModularChangeset, nodeId: NodeId): NodeLocation {
	const normalizedNodeId = normalizeNodeId(nodeId, changeset.nodeAliases);
	const location = getFromChangeAtomIdMap(changeset.nodeToParent, normalizedNodeId);
	assert(location !== undefined, "Parent field should be defined");

	if (location.field !== undefined) {
		return { field: normalizeFieldId(location.field, changeset.nodeAliases) };
	}

	return location;
}

/**
 * Normalizes a modular changeset by remapping node and field IDs and replacing tree chunks with dummy objects.
 * @param change - The modular changeset to normalize.
 * @param fieldKinds - A map of field kind identifiers to their corresponding flex field kinds.
 * @param dropRevertConstraint - Whether to drop revert constraints.
 * @returns The normalized modular changeset.
 */
export function normalizeChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	dropRevertConstraint: boolean,
	dropRevisionInfo: boolean,
	chunkNormalizer: (chunk: TreeChunk) => TreeChunk,
): ModularChangeset {
	const normalized: Mutable<ModularChangeset> = normalizeRangeMaps(
		normalizeNodeIds(removeAliases(change), fieldKinds, dropRevertConstraint, chunkNormalizer),
	);

	return normalized;
}

function normalizeNodeIds(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	dropRevertConstraint: boolean,
	chunkNormalizer: (chunk: TreeChunk) => TreeChunk,
): ModularChangeset {
	const idAllocator = idAllocatorFromMaxId();

	const idRemappings: ChangeAtomIdMap<NodeId> = new Map();
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newChangeAtomIdBTree();
	const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newChangeAtomIdBTree();
	const crossFieldKeyTable: CrossFieldKeyTable = newCrossFieldRangeTable();

	const remapNodeId = (nodeId: NodeId): NodeId => {
		const normalizedId = normalizeNodeId(nodeId, change.nodeAliases);
		const newId = tryGetFromNestedMap(
			idRemappings,
			normalizedId.revision,
			normalizedId.localId,
		);
		assert(newId !== undefined, 0xd98 /* Unknown node ID */);
		return newId;
	};

	const remapFieldId = (fieldId: FieldId): FieldId => {
		return fieldId.nodeId === undefined
			? fieldId
			: { ...fieldId, nodeId: remapNodeId(fieldId.nodeId) };
	};

	const remapNodeLocation = (location: NodeLocation): NodeLocation => {
		const remapped: NodeLocation =
			location.field === undefined ? location : { field: remapFieldId(location.field) };

		return remapped;
	};

	const normalizeNodeChanges = (nodeId: NodeId): NodeId => {
		const normalizedId = normalizeNodeId(nodeId, change.nodeAliases);
		const nodeChangeset = change.nodeChanges.get([
			normalizedId.revision,
			normalizedId.localId,
		]);
		assert(nodeChangeset !== undefined, 0xd99 /* Unknown node ID */);

		const newId: NodeId = { localId: brand(idAllocator.allocate()) };
		setInNestedMap(idRemappings, nodeId.revision, nodeId.localId, newId);

		const parent = change.nodeToParent.get([normalizedId.revision, normalizedId.localId]);
		assert(parent !== undefined, 0xd9a /* Every node should have a parent */);
		const newParent = remapNodeLocation(parent);
		nodeToParent.set([newId.revision, newId.localId], newParent);

		const normalizedNodeChangeset: Mutable<NodeChangeset> = { ...nodeChangeset };
		if (normalizedNodeChangeset.fieldChanges !== undefined) {
			normalizedNodeChangeset.fieldChanges = normalizeNodeIdsInFields(
				normalizedNodeChangeset.fieldChanges,
			);
		}

		if (dropRevertConstraint) {
			delete normalizedNodeChangeset.nodeExistsConstraintOnRevert;
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
			normalizedFieldChanges.set(field, {
				...fieldChange,
				change: changeHandler.rebaser.prune(fieldChange.change, normalizeNodeChanges),
			});

			const crossFieldKeys = changeHandler.getCrossFieldKeys(fieldChange.change);
			for (const { key, count } of crossFieldKeys) {
				const prevId = change.crossFieldKeys.getFirst(key, count)?.value;
				assert(prevId !== undefined, 0xd9b /* Should be an entry for each cross-field key */);
				crossFieldKeyTable.set(key, count, remapFieldId(prevId));
			}
		}

		return normalizedFieldChanges;
	}

	function normalizeRootNodeIds(roots: RootNodeTable): RootNodeTable {
		const normalizedRoots: RootNodeTable = cloneRootTable(roots);
		for (const [detachId, nodeId] of roots.nodeChanges.entries()) {
			normalizedRoots.nodeChanges.set(detachId, normalizeNodeChanges(nodeId));
		}

		for (const entry of roots.detachLocations.entries()) {
			normalizedRoots.detachLocations.set(
				entry.start,
				entry.length,
				remapFieldId(entry.value),
			);
		}

		for (const entry of roots.outputDetachLocations.entries()) {
			normalizedRoots.outputDetachLocations.set(
				entry.start,
				entry.length,
				remapFieldId(entry.value),
			);
		}

		return normalizedRoots;
	}

	const fieldChanges = normalizeNodeIdsInFields(change.fieldChanges);
	const rootNodes = normalizeRootNodeIds(change.rootNodes);

	const normal: Mutable<ModularChangeset> = {
		...change,
		rootNodes,
		nodeChanges,
		fieldChanges,
		nodeToParent,
		crossFieldKeys: crossFieldKeyTable,
	};

	// The TreeChunk objects need to be deep cloned to avoid comparison issues on reference counting
	if (change.builds !== undefined) {
		normal.builds = brand(change.builds.mapValues(chunkNormalizer));
	}
	if (change.refreshers !== undefined) {
		normal.refreshers = brand(change.refreshers.mapValues(chunkNormalizer));
	}
	return normal;
}

function normalizeRangeMaps(change: ModularChangeset): ModularChangeset {
	return {
		...change,
		crossFieldKeys: normalizeRangeMap(
			change.crossFieldKeys,
			areEqualCrossFieldKeys,
			areEqualFieldIds,
		),
		rootNodes: {
			nodeChanges: change.rootNodes.nodeChanges,
			oldToNewId: normalizeRangeMap(
				change.rootNodes.oldToNewId,
				areEqualChangeAtomIds,
				areEqualChangeAtomIds,
			),
			newToOldId: normalizeRangeMap(
				change.rootNodes.newToOldId,
				areEqualChangeAtomIds,
				areEqualChangeAtomIds,
			),
			firstIntermediateRenames: normalizeRangeMap(
				change.rootNodes.firstIntermediateRenames,
				areEqualChangeAtomIds,
				areEqualChangeAtomIds,
			),
			detachLocations: normalizeRangeMap(
				change.rootNodes.detachLocations,
				areEqualChangeAtomIds,
				areEqualFieldIds,
			),
			outputDetachLocations: normalizeRangeMap(
				change.rootNodes.outputDetachLocations,
				areEqualChangeAtomIds,
				areEqualFieldIds,
			),
		},
	};
}

function normalizeRangeMap<K, V>(
	map: RangeMap<K, V>,
	areEqualKeys: EqualityFunc<K>,
	areEqualValues: EqualityFunc<V>,
): RangeMap<K, V> {
	const normalized = map.clone();
	normalized.clear();

	let prevEntry: RangeMapEntry<K, V> | undefined;

	for (const entry of map.entries()) {
		if (prevEntry === undefined) {
			prevEntry = entry;
		} else {
			if (
				areEqualKeys(map.offsetKey(prevEntry.start, prevEntry.length), entry.start) &&
				areEqualValues(map.offsetValue(prevEntry.value, prevEntry.length), entry.value)
			) {
				prevEntry = { ...prevEntry, length: prevEntry.length + entry.length };
			} else {
				normalized.set(prevEntry.start, prevEntry.length, prevEntry.value);
				prevEntry = entry;
			}
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

	const updatedRootTable = cloneRootTable(changeset.rootNodes);
	for (const [rootId, nodeId] of changeset.rootNodes.nodeChanges.entries()) {
		updatedRootTable.nodeChanges.set(rootId, normalizeNodeId(nodeId, changeset.nodeAliases));
	}

	for (const entry of changeset.rootNodes.detachLocations.entries()) {
		updatedRootTable.detachLocations.set(
			entry.start,
			entry.length,
			normalizeFieldId(entry.value, changeset.nodeAliases),
		);
	}

	for (const entry of changeset.rootNodes.outputDetachLocations.entries()) {
		updatedRootTable.outputDetachLocations.set(
			entry.start,
			entry.length,
			normalizeFieldId(entry.value, changeset.nodeAliases),
		);
	}

	return {
		...changeset,
		nodeToParent: brand(updatedNodeToParent),
		crossFieldKeys: updatedCrossFieldKeys,
		nodeAliases: newChangeAtomIdBTree(),
		rootNodes: updatedRootTable,
	};
}

export function areEquivalent(
	change1: ModularChangeset,
	change2: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	ignoreRevertConstraint: boolean = true,
	ignoreRevisionInfo: boolean = true,
	chunkNormalizer: (chunk: TreeChunk) => TreeChunk = makeDummyChunk,
): boolean {
	const normalized1 = normalizeChangeset(
		change1,
		fieldKinds,
		ignoreRevertConstraint,
		ignoreRevisionInfo,
		chunkNormalizer,
	);
	const normalized2 = normalizeChangeset(
		change2,
		fieldKinds,
		ignoreRevertConstraint,
		ignoreRevisionInfo,
		chunkNormalizer,
	);
	const diff = merge(normalized1, normalized2, (item: object) =>
		item instanceof BTree ? item.toArray() : item,
	);
	if (hasConflict(diff)) {
		// Breakpoint here to inspect the diff
		return false;
	}
	return true;
}
export function cloneRootTable(table: RootNodeTable): RootNodeTable {
	return {
		oldToNewId: table.oldToNewId.clone(),
		newToOldId: table.newToOldId.clone(),
		firstIntermediateRenames: table.firstIntermediateRenames.clone(),
		nodeChanges: brand(table.nodeChanges.clone()),
		detachLocations: table.detachLocations.clone(),
		outputDetachLocations: table.outputDetachLocations.clone(),
	};
}

export function newFieldIdKeyBTree<V>(): TupleBTree<FieldIdKey, V> {
	return newTupleBTree(compareFieldIdKeys);
}

const compareFieldIdKeys = createTupleComparator([
	comparePartialRevisions,
	comparePartialChangesetLocalIds,
	compareStrings<FieldKey>,
]);
