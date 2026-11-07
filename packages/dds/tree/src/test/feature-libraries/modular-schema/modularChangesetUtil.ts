/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BTree } from "@tylerbu/sorted-btree-es6";

import type {
	ChangeAtomId,
	ChangesetLocalId,
	DeltaDetachedNodeId,
	DeltaFieldChanges,
	DeltaFieldMap,
	DeltaMark,
	DeltaRoot,
	FieldKey,
	FieldKindIdentifier,
	RevisionInfo,
	RevisionMetadataSource,
} from "../../../core/index.js";
import {
	chunkFieldSingle,
	cursorForJsonableTreeField,
	defaultChunkPolicy,
	fieldKinds as defaultFieldKinds,
	jsonableTreeFromFieldCursor,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
	type ComposeNodeManager,
	type FieldChangeHandler,
	type FieldChangeMap,
	type FlexFieldKind,
	type ModularChangeFamily,
	type ModularChangeset,
	type NodeId,
	type TreeChunk,
} from "../../../feature-libraries/index.js";
import {
	cloneRootTable,
	type RenameDescription,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	addNodeRename,
	getChangeHandler,
	newRootTable,
	normalizeChangeset,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeUtils.js";
import {
	newCrossFieldRangeTable,
	type CrossFieldKeyTable,
	type FieldChange,
	type FieldId,
	type NodeChangeset,
	type NodeLocation,
	type RebaseVersion,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/modularChangeTypes.js";
import {
	type IdAllocator,
	type Mutable,
	type RangeQueryResult,
	areAdjacentIntegerRanges,
	assertStructuralEquality,
	brand,
	idAllocatorFromMaxId,
} from "../../../util/index.js";
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
	assertStructuralEquality(actual, expected, {
		transform: (item) => (item instanceof BTree ? item.toArray() : item),
	});
}

export function assertModularChangesetsEqual(
	a: ModularChangeset,
	b: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind> = defaultFieldKinds,
	options: { ignoreRevertConstraints?: boolean; ignoreRebaseVersion?: boolean } = {},
): void {
	// Some changesets end up with different maxID values after rebase despite being otherwise equal.
	const aMaxId = a.maxId;
	const bMaxId = b.maxId;
	const maxId: ChangesetLocalId | undefined =
		aMaxId !== undefined || bMaxId !== undefined
			? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				brand(Math.max((aMaxId ?? bMaxId)!, (bMaxId ?? aMaxId)!))
			: undefined;

	const ignoreRevertConstraints = options.ignoreRevertConstraints ?? false;
	const ignoreRebaseVersion = options.ignoreRebaseVersion ?? false;

	// Removing aliases ensures that we don't consider the changesets different if they only differ in their aliases.
	// It also means that we risk treating some changesets that are the same (once you consider aliases) as different.
	let aNormalized: ModularChangeset = {
		...normalizeChangeset(a, fieldKinds, ignoreRevertConstraints, false, deepCloneChunkedTree),
		maxId,
	};

	let bNormalized: ModularChangeset = {
		...normalizeChangeset(b, fieldKinds, ignoreRevertConstraints, false, deepCloneChunkedTree),
		maxId,
	};

	if (ignoreRebaseVersion) {
		aNormalized = upgradeToRebaseVersionV2(aNormalized);
		bNormalized = upgradeToRebaseVersionV2(bNormalized);
	}

	assertEqual(aNormalized, bNormalized);
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

export function assertModularChangesetsEqualIgnoreRebaseVersion(
	actual: ModularChangeset,
	expected: ModularChangeset,
	fieldKinds?: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): void {
	assertModularChangesetsEqual(
		upgradeToRebaseVersionV2(actual),
		upgradeToRebaseVersionV2(expected),
		fieldKinds,
	);
}

export function empty(): ModularChangeset {
	return {
		rebaseVersion: 1,
		fieldChanges: new Map(),
		nodeChanges: newChangeAtomIdBTree(),
		rootNodes: newRootTable(),
		nodeToParent: newChangeAtomIdBTree(),
		nodeAliases: newChangeAtomIdBTree(),
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
	if (change.constraintViolationCount !== undefined) {
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
	for (const mark of delta.marks) {
		const normalizedMark = normalizeDeltaMark(mark, genId, idMap);
		if (lastMark !== undefined && canMergeDeltaMarks(lastMark, normalizedMark)) {
			lastMark.count += normalizedMark.count;
		} else {
			normalizedMarks.push(normalizedMark);
			lastMark = normalizedMark;
		}
	}

	return { marks: normalizedMarks };
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

interface TestRenameDescription extends RenameDescription {
	readonly firstIntermediateRename?: ChangeAtomId;
}

interface BuildArgs {
	rebaseVersion?: RebaseVersion;
	family: ModularChangeFamily;
	maxId?: number;
	revisions?: RevisionInfo[];
	builds?: ChangeAtomIdBTree<TreeChunk>;
	renames?: TestRenameDescription[];
	roots?: {
		detachId: ChangeAtomId;
		detachLocation?: FieldId;
		change: NodeChangesetDescription;
	}[];
	detachedMoves?: {
		detachId: ChangeAtomId;
		count: number;
		newLocation: FieldId;
	}[];
	aliases?: { from: NodeId; to: NodeId }[];
}

function build(args: BuildArgs, ...fields: FieldChangesetDescription[]): ModularChangeset {
	const nodeChanges: ChangeAtomIdBTree<NodeChangeset> = newChangeAtomIdBTree();
	const nodeToParent: ChangeAtomIdBTree<NodeLocation> = newChangeAtomIdBTree();
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
		for (const { detachId, change, detachLocation } of args.roots) {
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

			if (detachLocation !== undefined) {
				rootNodes.detachLocations.set(detachId, 1, detachLocation);
			}
		}
	}

	assert(args.maxId === undefined || args.maxId >= idAllocator.getMaxId());
	const result: Mutable<ModularChangeset> = {
		rebaseVersion: args.rebaseVersion ?? 1,
		nodeChanges,
		fieldChanges,
		rootNodes,
		nodeToParent,
		crossFieldKeys,
		nodeAliases: newChangeAtomIdBTree(),
		maxId: brand(args.maxId ?? idAllocator.getMaxId()),
	};

	if (args.revisions !== undefined) {
		result.revisions = args.revisions;
	}

	if (args.builds !== undefined) {
		result.builds = args.builds;
	}

	if (args.renames !== undefined) {
		for (const rename of args.renames) {
			addNodeRename(
				result.rootNodes,
				rename.oldId,
				rename.newId,
				rename.count,
				rename.detachLocation,
			);

			if (rename.firstIntermediateRename !== undefined) {
				result.rootNodes.firstIntermediateRenames.set(
					rename.oldId,
					rename.count,
					rename.firstIntermediateRename,
				);
			}
		}
	}

	if (args.detachedMoves !== undefined) {
		for (const { detachId, count, newLocation } of args.detachedMoves) {
			result.rootNodes.outputDetachLocations.set(detachId, count, newLocation);
		}
	}

	if (args.aliases !== undefined) {
		for (const alias of args.aliases) {
			setInChangeAtomIdMap(result.nodeAliases, alias.from, alias.to);
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

		let fieldChangeset: unknown = field.changeset;
		for (const nodeDescription of field.children) {
			fieldChangeset = addNodeToField(
				family,
				fieldChangeset,
				nodeDescription,
				fieldId,
				changeHandler,
				nodes,
				nodeToParent,
				crossFieldKeys,
				idAllocator,
			);
		}

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
		fieldWithChange,
		fieldChangeset,
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
	): RangeQueryResult<NodeId | undefined> {
		return { value: undefined, length: count };
	},

	composeAttachDetach: unsupportedFunc,
	sendNewChangesToBaseSourceLocation: unsupportedFunc,
};

const dummyRevisionMetadata: RevisionMetadataSource = {
	compareRevisions: unsupportedFunc,
	tryGetInfo: unsupportedFunc,
	hasRollback: unsupportedFunc,
};

function upgradeToRebaseVersionV2(change: ModularChangeset): ModularChangeset {
	const updatedRootTable = cloneRootTable(change.rootNodes);
	updatedRootTable.detachLocations.clear();
	updatedRootTable.outputDetachLocations.clear();
	return { ...change, rebaseVersion: 2, rootNodes: updatedRootTable };
}
