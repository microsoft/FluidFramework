/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	FieldKey,
	FieldKindIdentifier,
	RevisionInfo,
	RevisionMetadataSource,
} from "../../../core/index.js";
import type {
	ComposeNodeManager,
	FieldChangeHandler,
	FieldChangeMap,
	ModularChangeFamily,
	ModularChangeset,
	NodeId,
} from "../../../feature-libraries/index.js";
import type {
	ChangeAtomIdBTree,
	CrossFieldKeyTable,
	FieldChange,
	FieldId,
	NodeChangeset,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import {
	type IdAllocator,
	type Mutable,
	type RangeQueryResult,
	brand,
	fail,
	idAllocatorFromMaxId,
} from "../../../util/index.js";
import {
	getChangeHandler,
	getFieldsForCrossFieldKey,
	getParentFieldId,
	newCrossFieldKeyTable,
	newNodeRenameTable,
	newTupleBTree,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { strict as assert } from "node:assert";
import { assertStructuralEquality } from "../../objMerge.js";
import { BTree } from "@tylerbu/sorted-btree-es6";

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

function empty(): ModularChangeset {
	return {
		fieldChanges: new Map(),
		nodeChanges: newTupleBTree(),
		nodeRenames: newNodeRenameTable(),
		rootNodes: [],
		nodeToParent: newTupleBTree(),
		nodeAliases: newTupleBTree(),
		crossFieldKeys: newCrossFieldKeyTable(),
	};
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
}

function build(args: BuildArgs, ...fields: FieldChangesetDescription[]): ModularChangeset {
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newTupleBTree();
	const nodeToParent: ChangeAtomIdBTree<FieldId> = newTupleBTree();
	const crossFieldKeys: CrossFieldKeyTable = newCrossFieldKeyTable();

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
		rootNodes: [], // XXX
		nodeRenames: newNodeRenameTable(), // XXX
		nodeToParent,
		crossFieldKeys,
		nodeAliases: newTupleBTree(),
		maxId: brand(args.maxId ?? idAllocator.getMaxId()),
	};

	if (args.revisions !== undefined) {
		result.revisions = args.revisions;
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

		for (const key of changeHandler.getCrossFieldKeys(fieldChangeset)) {
			crossFieldKeys.set(key, fieldId);
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

	const fieldWithChange = changeHandler.editor.buildChildChange(nodeDescription.index, nodeId);

	return changeHandler.rebaser.compose(
		fieldWithChange,
		fieldChangeset,
		(node1, node2) => node1 ?? node2 ?? fail("Should not compose two undefined nodes"),
		idAllocator,
		dummyComposeManager,
		dummyRevisionMetadata,
	);
}

const unsupportedFunc = () => fail("Not supported");

const dummyComposeManager: ComposeNodeManager = {
	getChangesForBaseDetach(
		_baseDetachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<NodeId> {
		return { value: undefined, length: count };
	},

	composeBaseAttach: unsupportedFunc,
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

	const updatedCrossFieldKeys: CrossFieldKeyTable = newCrossFieldKeyTable();
	for (const key of changeset.crossFieldKeys.keys()) {
		const fields = getFieldsForCrossFieldKey(changeset, key);
		assert(fields.length === 1);
		updatedCrossFieldKeys.set(key, fields[0]);
	}

	return {
		...changeset,
		nodeToParent: brand(updatedNodeToParent),
		crossFieldKeys: updatedCrossFieldKeys,
		nodeAliases: newTupleBTree(),
	};
}
