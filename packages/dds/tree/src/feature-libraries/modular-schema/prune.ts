/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	ChangesetLocalId,
	FieldKindIdentifier,
	RevisionTag,
} from "../../core/index.js";
import { brand, type Mutable, type TupleBTree } from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import type { FlexFieldKind } from "./fieldKind.js";
import { newFieldIdKeyBTree } from "./modularChangeFamily.js";
import type {
	FieldChangeMap,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
	NodeLocation,
	RootNodeTable,
} from "./modularChangeTypes.js";
import {
	fieldIdKeyFromFieldId,
	getChangeHandler,
	nodeChangeFromId,
	normalizeFieldId,
	tryRemoveDetachLocation,
	type FieldIdKey,
} from "./modularChangeUtils.js";
import { fail } from "@fluidframework/core-utils/internal";

export function pruneChangeset(
	changeset: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ModularChangeset {
	const prunedChangeset: Mutable<ModularChangeset> = {
		...changeset,
		nodeChanges: changeset.nodeChanges.clone(),
		nodeToParent: changeset.nodeToParent.clone(),
		nodeAliases: changeset.nodeAliases.clone(),
	};

	const fieldsWithRootMoves = getFieldsWithRootMoves(
		changeset.rootNodes,
		changeset.nodeAliases,
	);

	const fieldToRootChanges = getFieldToRootChanges(changeset.rootNodes, changeset.nodeAliases);

	prunedChangeset.fieldChanges =
		pruneFieldMap(
			prunedChangeset.fieldChanges,
			undefined,
			prunedChangeset.nodeChanges,
			prunedChangeset.nodeToParent,
			prunedChangeset.nodeAliases,
			prunedChangeset.rootNodes,
			fieldsWithRootMoves,
			fieldToRootChanges,
			fieldKinds,
		) ?? new Map();

	prunedChangeset.rootNodes = pruneRoots(
		prunedChangeset.rootNodes,
		prunedChangeset.nodeChanges,
		prunedChangeset.nodeToParent,
		prunedChangeset.nodeAliases,
		fieldsWithRootMoves,
		fieldToRootChanges,
		fieldKinds,
	);

	return prunedChangeset;
}
function pruneFieldMap(
	changeset: FieldChangeMap | undefined,
	parentId: NodeId | undefined,
	nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	aliases: ChangeAtomIdBTree<NodeId>,
	roots: RootNodeTable,
	fieldsWithRootMoves: TupleBTree<FieldIdKey, boolean>,
	fieldToRootChanges: TupleBTree<FieldIdKey, ChangeAtomId[]>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): FieldChangeMap | undefined {
	if (changeset === undefined) {
		return undefined;
	}

	const prunedChangeset: FieldChangeMap = new Map();
	for (const [field, fieldChange] of changeset) {
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);

		const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
			pruneNodeChange(
				nodeId,
				nodeMap,
				nodeToParent,
				aliases,
				roots,
				fieldsWithRootMoves,
				fieldToRootChanges,
				fieldKinds,
			),
		);

		const fieldId: FieldId = { nodeId: parentId, field };
		const fieldIdKey = fieldIdKeyFromFieldId(fieldId);
		const rootsWithChanges = fieldToRootChanges.get(fieldIdKey) ?? [];
		let hasRootWithNodeChange = false;
		for (const rootId of rootsWithChanges) {
			const nodeId =
				getFromChangeAtomIdMap(roots.nodeChanges, rootId) ?? fail("No root change found");

			const isRootChangeEmpty =
				pruneNodeChange(
					nodeId,
					nodeMap,
					nodeToParent,
					aliases,
					roots,
					fieldsWithRootMoves,
					fieldToRootChanges,
					fieldKinds,
				) === undefined;

			if (isRootChangeEmpty) {
				roots.nodeChanges.delete([rootId.revision, rootId.localId]);
				tryRemoveDetachLocation(roots, rootId, 1);
			} else {
				hasRootWithNodeChange = true;
			}
		}

		const hasRootChanges =
			hasRootWithNodeChange || fieldsWithRootMoves.get(fieldIdKey) === true;

		if (!handler.isEmpty(prunedFieldChangeset) || hasRootChanges) {
			prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
		}
	}

	return prunedChangeset.size > 0 ? prunedChangeset : undefined;
}

function pruneRoots(
	roots: RootNodeTable,
	nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	aliases: ChangeAtomIdBTree<NodeId>,
	fieldsWithRootMoves: TupleBTree<FieldIdKey, boolean>,
	fieldsToRootChanges: TupleBTree<FieldIdKey, ChangeAtomId[]>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): RootNodeTable {
	const pruned: RootNodeTable = { ...roots, nodeChanges: newChangeAtomIdBTree() };
	for (const [rootIdKey, nodeId] of roots.nodeChanges.entries()) {
		const rootId: ChangeAtomId = { revision: rootIdKey[0], localId: rootIdKey[1] };
		const hasDetachLocation = roots.detachLocations.getFirst(rootId, 1).value !== undefined;

		// If the root has a detach location it should be pruned by recursion when pruning the field it was detached from.
		const prunedId = hasDetachLocation
			? nodeId
			: pruneNodeChange(
					nodeId,
					nodeMap,
					nodeToParent,
					aliases,
					roots,
					fieldsWithRootMoves,
					fieldsToRootChanges,
					fieldKinds,
				);

		if (prunedId !== undefined) {
			pruned.nodeChanges.set(rootIdKey, prunedId);
		}

		tryRemoveDetachLocation(pruned, rootId, 1);
	}

	return pruned;
}

function pruneNodeChange(
	nodeId: NodeId,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<NodeLocation>,
	aliases: ChangeAtomIdBTree<NodeId>,
	roots: RootNodeTable,
	fieldsWithRootMoves: TupleBTree<FieldIdKey, boolean>,
	fieldsToRootChanges: TupleBTree<FieldIdKey, ChangeAtomId[]>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): NodeId | undefined {
	const changeset = nodeChangeFromId(nodes, aliases, nodeId);
	const prunedFields =
		changeset.fieldChanges === undefined
			? undefined
			: pruneFieldMap(
					changeset.fieldChanges,
					nodeId,
					nodes,
					nodeToParent,
					aliases,
					roots,
					fieldsWithRootMoves,
					fieldsToRootChanges,
					fieldKinds,
				);

	const prunedChange = { ...changeset, fieldChanges: prunedFields };
	if (prunedChange.fieldChanges === undefined) {
		delete prunedChange.fieldChanges;
	}

	if (isEmptyNodeChangeset(prunedChange)) {
		const nodeIdKey: [RevisionTag | undefined, ChangesetLocalId] = [
			nodeId.revision,
			nodeId.localId,
		];

		// TODO: Shouldn't we also delete all aliases associated with this node?
		nodes.delete(nodeIdKey);
		nodeToParent.delete(nodeIdKey);
		return undefined;
	} else {
		setInChangeAtomIdMap(nodes, nodeId, prunedChange);
		return nodeId;
	}
}

function isEmptyNodeChangeset(change: NodeChangeset): boolean {
	return (
		change.fieldChanges === undefined &&
		change.nodeExistsConstraint === undefined &&
		change.nodeExistsConstraintOnRevert === undefined
	);
}

function getFieldsWithRootMoves(
	roots: RootNodeTable,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): TupleBTree<FieldIdKey, boolean> {
	const fields: TupleBTree<FieldIdKey, boolean> = newFieldIdKeyBTree();
	for (const { start: rootId, value: fieldId, length } of roots.detachLocations.entries()) {
		let isRootMoved = false;
		for (const renameEntry of roots.oldToNewId.getAll(rootId, length)) {
			if (renameEntry.value !== undefined) {
				isRootMoved = true;
			}
		}

		for (const outputDetachEntry of roots.outputDetachLocations.getAll(rootId, length)) {
			if (outputDetachEntry.value !== undefined) {
				isRootMoved = true;
			}
		}

		if (isRootMoved) {
			fields.set(fieldIdKeyFromFieldId(normalizeFieldId(fieldId, nodeAliases)), true);
		}
	}

	return fields;
}

function getFieldToRootChanges(
	roots: RootNodeTable,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
): TupleBTree<FieldIdKey, ChangeAtomId[]> {
	const fields: TupleBTree<FieldIdKey, ChangeAtomId[]> = newFieldIdKeyBTree();
	for (const rootIdKey of roots.nodeChanges.keys()) {
		const rootId: ChangeAtomId = { revision: rootIdKey[0], localId: rootIdKey[1] };
		const detachLocation = roots.detachLocations.getFirst(rootId, 1).value;
		if (detachLocation !== undefined) {
			const fieldIdKey = fieldIdKeyFromFieldId(normalizeFieldId(detachLocation, nodeAliases));
			let rootsInField = fields.get(fieldIdKey);
			if (rootsInField === undefined) {
				rootsInField = [];
				fields.set(fieldIdKey, rootsInField);
			}

			rootsInField.push(rootId);
		}
	}

	return fields;
}
