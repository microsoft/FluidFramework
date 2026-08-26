/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangesetLocalId, FieldKindIdentifier, RevisionTag } from "../../core/index.js";
import { brand, type Mutable } from "../../util/index.js";
import { setInChangeAtomIdMap, type ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import type { FlexFieldKind } from "./fieldKind.js";
import type {
	FieldChangeMap,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import { getChangeHandler, nodeChangeFromId, normalizeNodeId } from "./modularChangeUtils.js";

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

	prunedChangeset.fieldChanges =
		pruneFieldMap(
			prunedChangeset.fieldChanges,
			prunedChangeset.nodeChanges,
			prunedChangeset.nodeToParent,
			prunedChangeset.nodeAliases,
			fieldKinds,
		) ?? new Map();

	return prunedChangeset;
}

function pruneFieldMap(
	changeset: FieldChangeMap | undefined,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<FieldId>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): FieldChangeMap | undefined {
	if (changeset === undefined) {
		return undefined;
	}

	const prunedChangeset: FieldChangeMap = new Map();
	for (const [field, fieldChange] of changeset) {
		const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);

		const prunedFieldChangeset = handler.rebaser.prune(fieldChange.change, (nodeId) =>
			pruneNodeChange(nodeId, nodes, nodeToParent, nodeAliases, fieldKinds),
		);

		if (!handler.isEmpty(prunedFieldChangeset)) {
			prunedChangeset.set(field, { ...fieldChange, change: brand(prunedFieldChangeset) });
		}
	}

	return prunedChangeset.size > 0 ? prunedChangeset : undefined;
}

function pruneNodeChange(
	nodeId: NodeId,
	nodeMap: ChangeAtomIdBTree<NodeChangeset>,
	nodeToParent: ChangeAtomIdBTree<FieldId>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): NodeId | undefined {
	const changeset = nodeChangeFromId(nodeMap, nodeId);
	const prunedFields =
		changeset.fieldChanges === undefined
			? undefined
			: pruneFieldMap(changeset.fieldChanges, nodeMap, nodeToParent, nodeAliases, fieldKinds);

	const prunedChange = { ...changeset, fieldChanges: prunedFields };
	if (prunedChange.fieldChanges === undefined) {
		delete prunedChange.fieldChanges;
	}

	const normalizedNodeId = normalizeNodeId(nodeId, nodeAliases);
	if (isEmptyNodeChangeset(prunedChange)) {
		const nodeIdKey: [RevisionTag | undefined, ChangesetLocalId] = [
			normalizedNodeId.revision,
			normalizedNodeId.localId,
		];

		nodeMap.delete(nodeIdKey);
		nodeToParent.delete(nodeIdKey);

		// TODO: Also remove aliases for this node.
		return undefined;
	} else {
		setInChangeAtomIdMap(nodeMap, normalizedNodeId, prunedChange);
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
