/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	DeltaDetachedNodeId,
	DeltaFieldMap,
	FieldKindIdentifier,
	RevisionTag,
} from "../../core/index.js";
import { makeAnonChange } from "../../core/index.js";
import { brand } from "../../util/index.js";
import type { TreeChunk } from "../chunked-forest/index.js";
import { chunkTree, combineChunks, defaultChunkPolicy } from "../chunked-forest/index.js";

import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
} from "../changeAtomIdBTree.js";

import type { FlexFieldKind } from "./fieldKind.js";
import { getChangeHandler, intoDelta } from "./modularChangeFamily.js";
import type {
	CrossFieldKeyTable,
	FieldChangeMap,
	FieldChangeset,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import { newCrossFieldKeyTable } from "./modularChangeTypes.js";

/**
 * A set of detached node IDs, keyed by revision then by the numeric portion (`localId`/`minor`) of the ID.
 */
type DetachedNodeIdSet = Map<RevisionTag | undefined, Set<number>>;

/** Chunking policy used to re-chunk a build when it is split into smaller builds. */
const minimizeChunkCompressor = {
	policy: defaultChunkPolicy,
	idCompressor: undefined,
} as const;

function addToDetachedNodeIdSet(
	set: DetachedNodeIdSet,
	revision: RevisionTag | undefined,
	localId: number,
): void {
	const minors = set.get(revision) ?? new Set<number>();
	minors.add(localId);
	set.set(revision, minors);
}

function detachedNodeIdSetHas(
	set: DetachedNodeIdSet,
	revision: RevisionTag | undefined,
	localId: number,
): boolean {
	return set.get(revision)?.has(localId) ?? false;
}

/**
 * Collects the set of detached node IDs whose content ends up attached within the live document tree
 * once the given change is applied.
 *
 * @remarks
 * These are the "used" detached nodes: any build whose nodes are not in this set has no observable
 * effect on the resulting document and can be dropped.
 *
 * The delta's marks describe changes to a field: an `attach` brings a detached node into the live
 * tree, while `mark.fields` describes edits to the *pre-existing* content of the cell (which is being
 * detached/removed when `mark.detach` is set). Nested content of freshly built/attached nodes is not
 * carried on the attach mark itself; it is expressed via `DeltaRoot.global` keyed by the node's ID.
 * Consequently this walk only descends into a node's nested content when that node itself remains in
 * the live tree, so that content attached beneath a removed node is correctly treated as unused.
 */
function collectAttachedDetachedNodeIds(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): DetachedNodeIdSet {
	const attached: DetachedNodeIdSet = new Map();
	const delta = intoDelta(makeAnonChange(change), fieldKinds);

	// Index the nested changes of detached nodes by their ID for lookup as nodes become "live".
	const globalById = new Map<RevisionTag | undefined, Map<number, DeltaFieldMap>>();
	if (delta.global !== undefined) {
		for (const { id, fields } of delta.global) {
			const byMinor = globalById.get(id.major) ?? new Map<number, DeltaFieldMap>();
			byMinor.set(id.minor, fields);
			globalById.set(id.major, byMinor);
		}
	}

	// Worklist of detached node IDs newly discovered to be live, whose own nested content must be visited.
	const worklist: DeltaDetachedNodeId[] = [];
	const markLive = (major: RevisionTag | undefined, minor: number): void => {
		if (!detachedNodeIdSetHas(attached, major, minor)) {
			addToDetachedNodeIdSet(attached, major, minor);
			worklist.push({ major, minor });
		}
	};

	const visitLiveFields = (fields: DeltaFieldMap | undefined): void => {
		if (fields === undefined) {
			return;
		}
		for (const field of fields.values()) {
			for (const mark of field.marks) {
				if (mark.attach !== undefined) {
					for (let offset = 0; offset < mark.count; offset += 1) {
						markLive(mark.attach.major, mark.attach.minor + offset);
					}
				}
				// `mark.fields` edits the cell's pre-existing content. Only descend when that content
				// stays in the live tree (i.e. it is not being detached out of the tree).
				if (mark.detach === undefined) {
					visitLiveFields(mark.fields);
				}
			}
		}
	};

	visitLiveFields(delta.fields);

	// Process nodes discovered to be live: pull in their nested content (from `global`) and propagate
	// liveness backwards across renames (a node attached under its post-rename ID was built under its
	// pre-rename ID). Iterate to a fixed point.
	while (worklist.length > 0) {
		const next = worklist.pop();
		if (next === undefined) {
			break;
		}
		const { major, minor } = next;
		visitLiveFields(globalById.get(major)?.get(minor));
		if (delta.rename !== undefined) {
			for (const { oldId, newId, count } of delta.rename) {
				if (newId.major === major && minor >= newId.minor && minor < newId.minor + count) {
					markLive(oldId.major, oldId.minor + (minor - newId.minor));
				}
			}
		}
	}

	return attached;
}

/** Splits a chunk into one chunk per top-level node, in order. */
function splitChunkIntoNodes(chunk: TreeChunk): TreeChunk[] {
	const cursor = chunk.cursor();
	cursor.firstNode();
	const nodes: TreeChunk[] = [];
	for (let index = 0; index < chunk.topLevelLength; index += 1) {
		nodes.push(chunkTree(cursor, minimizeChunkCompressor));
		cursor.nextNode();
	}
	return nodes;
}

/**
 * "Minimizes" a {@link ModularChangeset} so that it contains no extraneous
 * information, i.e. no new content that isn't observable from document tree
 * and no edits without net observed effect on the document tree.
 *
 * @remarks
 * "Extraneous information" includes, for example, data for nodes that were both created and removed within the same
 * transaction, or changes whose effects cancel out to nothing. Minimizing reduces the size of an edit without altering
 * its observable effect.
 *
 * Every node created during the change contributes a `build`. Once the change is squashed, a build is only meaningful
 * for nodes that remain attached in the resulting document. This function inspects the change's
 * {@link intoDelta | delta} to determine which built nodes end up attached ("transient" nodes are those that do not),
 * then:
 *
 * - removes the field-level effects (e.g. sequence-field marks) that create, move, and remove each transient node,
 * delegating to {@link FieldChangeHandler.removeTransientEffects},
 * - drops the nested node changes and derived indexes (`nodeToParent`, `crossFieldKeys`) that become unreferenced,
 * - drops any build whose nodes are entirely unused, and splits any partially-used build so that only the runs of used
 * nodes are retained, and
 * - prunes destroys for the removed builds, since destroying a node that was never built has no effect.
 *
 * The result applies to produce the same document as the input change.
 *
 * @param change - The change to minimize. Not mutated by this function.
 * @param fieldKinds - The field kinds to delegate to when computing the change's delta and pruning transient effects.
 */
export function minimizeModularChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ModularChangeset {
	const builds = change.builds;
	if (builds === undefined || builds.size === 0) {
		return change;
	}

	assert(change.destroys === undefined, "No destroys expected in change to be minimized");

	const attached = collectAttachedDetachedNodeIds(change, fieldKinds);

	// The set of all cells built by this change.
	const builtCells: DetachedNodeIdSet = new Map();
	for (const [[revision, localId], chunk] of builds.entries()) {
		for (let offset = 0; offset < chunk.topLevelLength; offset += 1) {
			addToDetachedNodeIdSet(builtCells, revision, localId + offset);
		}
	}

	// A cell is "transient" if it was built by this change but its content does not survive (it is not attached in the
	// resulting document).
	const isTransientBuildCell = (id: ChangeAtomId): boolean =>
		detachedNodeIdSetHas(builtCells, id.revision, id.localId) &&
		!detachedNodeIdSetHas(attached, id.revision, id.localId);

	// Rebuild the field/node changes and their derived indexes, omitting the effects of transient nodes and any node
	// changes that become unreferenced as a result.
	const newNodeChanges = newChangeAtomIdBTree<NodeChangeset>();
	const newNodeToParent = newChangeAtomIdBTree<FieldId>();
	const newCrossFieldKeys: CrossFieldKeyTable = newCrossFieldKeyTable();
	const processedNodes = new Set<string>();

	function rewriteFieldMap(
		fieldMap: FieldChangeMap,
		parentNodeId: NodeId | undefined,
	): FieldChangeMap {
		const result: FieldChangeMap = new Map();
		for (const [field, fieldChange] of fieldMap) {
			const handler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
			const prunedChange: FieldChangeset =
				handler.removeTransientEffects === undefined
					? fieldChange.change
					: brand(handler.removeTransientEffects(fieldChange.change, isTransientBuildCell));

			const fieldId: FieldId = { nodeId: parentNodeId, field };
			for (const { key, count } of handler.getCrossFieldKeys(prunedChange)) {
				newCrossFieldKeys.set(key, count, fieldId);
			}
			for (const [nodeId] of handler.getNestedChanges(prunedChange)) {
				rewriteNode(nodeId, fieldId);
			}

			if (!handler.isEmpty(prunedChange)) {
				result.set(field, { ...fieldChange, change: prunedChange });
			}
		}
		return result;
	}

	function rewriteNode(nodeId: NodeId, parentFieldId: FieldId): void {
		const canonical = normalizeNodeId(nodeId, change.nodeAliases);
		const key = `${canonical.revision === undefined ? "" : String(canonical.revision)}:${canonical.localId}`;
		if (processedNodes.has(key)) {
			return;
		}
		processedNodes.add(key);
		setInChangeAtomIdMap(newNodeToParent, canonical, parentFieldId);

		const nodeChangeset = getFromChangeAtomIdMap(change.nodeChanges, canonical);
		assert(nodeChangeset !== undefined, "Unknown node ID referenced by field change");

		const newFields =
			nodeChangeset.fieldChanges === undefined
				? undefined
				: rewriteFieldMap(nodeChangeset.fieldChanges, canonical);

		const newNode: NodeChangeset = { ...nodeChangeset };
		if (newFields !== undefined && newFields.size > 0) {
			newNode.fieldChanges = newFields;
		} else {
			delete newNode.fieldChanges;
		}
		setInChangeAtomIdMap(newNodeChanges, canonical, newNode);
	}

	const newFieldChanges = rewriteFieldMap(change.fieldChanges, undefined);

	const newBuilds = newChangeAtomIdBTree<TreeChunk>();
	const droppedBuildIds: DetachedNodeIdSet = new Map();

	for (const [[revision, localId], chunk] of builds.entries()) {
		const length = chunk.topLevelLength;
		const usedFlags: boolean[] = [];
		let usedCount = 0;
		for (let offset = 0; offset < length; offset += 1) {
			const used = detachedNodeIdSetHas(attached, revision, localId + offset);
			usedFlags.push(used);
			if (used) {
				usedCount += 1;
			}
		}

		if (usedCount === length) {
			// Fully used: keep the build as-is.
			newBuilds.set([revision, localId], chunk);
			continue;
		}

		// Partially or fully unused: split into per-node chunks and keep only runs of used nodes.
		const nodeChunks = splitChunkIntoNodes(chunk);
		let index = 0;
		while (index < length) {
			if (usedFlags[index] !== true) {
				addToDetachedNodeIdSet(droppedBuildIds, revision, localId + index);
				nodeChunks[index]?.referenceRemoved();
				index += 1;
				continue;
			}
			const runStart = index;
			while (index < length && usedFlags[index] === true) {
				index += 1;
			}
			newBuilds.set(
				[revision, brand(localId + runStart)],
				combineChunks(nodeChunks.slice(runStart, index)),
			);
		}
	}

	return {
		...change,
		fieldChanges: newFieldChanges,
		nodeChanges: newNodeChanges,
		nodeToParent: newNodeToParent,
		crossFieldKeys: newCrossFieldKeys,
		builds: newBuilds.size > 0 ? newBuilds : undefined,
	};
}

/**
 * Resolves a node ID through the change's alias table to its canonical form.
 */
function normalizeNodeId(nodeId: NodeId, nodeAliases: ChangeAtomIdBTree<NodeId>): NodeId {
	let currentId = nodeId;
	for (;;) {
		const dealiased = getFromChangeAtomIdMap(nodeAliases, currentId);
		if (dealiased === undefined) {
			return currentId;
		}
		currentId = dealiased;
	}
}
