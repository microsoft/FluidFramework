/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	ChangeAtomIdMap,
	ChangesetLocalId,
	DeltaFieldMap,
	DeltaRoot,
	ExclusiveMapTree,
	FieldKindIdentifier,
	RevisionTag,
} from "../../core/index.js";
import { makeAnonChange, offsetChangesetLocalId } from "../../core/index.js";
import type { NestedSet } from "../../util/index.js";
import { addToNestedSet, brand, nestedSetContains, setInNestedMap } from "../../util/index.js";

import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import { newChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import type { TreeChunk } from "../chunked-forest/index.js";
import { chunkTree, combineChunks, defaultChunkPolicy } from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";

import type { FlexFieldKind } from "./fieldKind.js";
import { intoDelta } from "./modularChangeFamily.js";
import type { ModularChangeset } from "./modularChangeTypes.js";

/**
 * A set of node IDs, keyed by revision then by the numeric portion (`localId`/`minor`) of the ID.
 */
type ChangeAtomIdSet = NestedSet<RevisionTag | undefined, ChangesetLocalId>;

/** Chunking policy used to re-chunk a build when it is split into smaller builds. */
const minimizeChunkCompressor = {
	policy: defaultChunkPolicy,
	idCompressor: undefined,
} as const;

/**
 * Indexes a delta's {@link DeltaRoot.global | global} detached-node changes by their node ID.
 *
 * @remarks
 * `DeltaRoot.global` describes modifications to nodes that are built and/or removed by the change,
 * keyed by node ID. This builds a `revision -> localId -> fields` lookup so those per-node
 * {@link DeltaFieldMap | field changes} can be resolved quickly (for example, when trimming transient
 * content out of a surviving node's build tree).
 */
function indexGlobalById(delta: DeltaRoot): ChangeAtomIdMap<DeltaFieldMap> {
	const globalById: ChangeAtomIdMap<DeltaFieldMap> = new Map();
	if (delta.global !== undefined) {
		for (const { id, fields } of delta.global) {
			setInNestedMap(globalById, id.major, id.minor, fields);
		}
	}
	return globalById;
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
	delta: DeltaRoot,
	globalById: ChangeAtomIdMap<DeltaFieldMap>,
): ChangeAtomIdSet {
	const attached: ChangeAtomIdSet = new Map();
	// Worklist of detached node IDs newly discovered to be live, whose own nested content must be visited.
	const worklist: ChangeAtomId[] = [];
	const markLive = (id: ChangeAtomId): void => {
		if (!nestedSetContains(attached, id.revision, id.localId)) {
			addToNestedSet(attached, id.revision, id.localId);
			worklist.push(id);
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
						markLive({
							revision: mark.attach.major,
							localId: brand(mark.attach.minor + offset),
						});
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
		const { revision: major, localId: minor } = next;
		visitLiveFields(globalById.get(major)?.get(minor));
		if (delta.rename !== undefined) {
			for (const { oldId, newId, count } of delta.rename) {
				if (newId.major === major && minor >= newId.minor && minor < newId.minor + count) {
					markLive({
						revision: oldId.major,
						localId: brand(oldId.minor + (minor - newId.minor)),
					});
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

/** Extracts the single top-level node of a chunk as a mutable {@link ExclusiveMapTree}. */
function mapTreeFromNodeChunk(chunk: TreeChunk): ExclusiveMapTree {
	const cursor = chunk.cursor();
	cursor.firstNode();
	return mapTreeFromCursor(cursor);
}

/**
 * Trims transient content from a built node's in-memory tree, in place.
 *
 * @returns The number of children removed from the node's fields.
 *
 * @remarks
 * `deltaFields` is the {@link DeltaFieldMap} describing the modifications made to the built node (as
 * produced in the change's delta `global` section, keyed by the node's build ID). It is walked in
 * lockstep with `node`'s fields: a `detach` mark whose target cell is not live removes the corresponding
 * (transient) child from the tree, and a `fields` mark descends into a surviving child to trim its own
 * transient descendants. Content brought in by `attach`-only marks lives in a separate build and is not
 * inlined here, so those marks consume no existing child.
 */
function trimMapTree(
	node: ExclusiveMapTree,
	deltaFields: DeltaFieldMap,
	isLive: (id: ChangeAtomId) => boolean,
): number {
	let changes = 0;
	for (const [fieldKey, fieldChanges] of deltaFields) {
		if (fieldChanges.marks.length === 0) {
			continue;
		}
		const children = node.fields.get(fieldKey);
		if (children === undefined) {
			continue;
		}
		const newChildren: ExclusiveMapTree[] = [];
		let fieldChangeCount = 0;
		let childIndex = 0;
		for (const mark of fieldChanges.marks) {
			if (mark.detach !== undefined) {
				// The detached children are the field's existing (built) content being removed.
				for (let offset = 0; offset < mark.count; offset += 1) {
					if (
						isLive({ revision: mark.detach.major, localId: brand(mark.detach.minor + offset) })
					) {
						// Detached to a cell that survives elsewhere: retain the content.
						newChildren.push(children[childIndex] ?? oob());
					} else {
						fieldChangeCount += 1;
					}
					childIndex += 1;
				}
			} else if (mark.fields !== undefined) {
				// A surviving child that has its own nested modifications.
				const child = children[childIndex] ?? oob();
				fieldChangeCount += trimMapTree(child, mark.fields, isLive);
				newChildren.push(child);
				childIndex += 1;
			} else if (mark.attach === undefined) {
				// Unchanged run of existing children.
				for (let offset = 0; offset < mark.count; offset += 1) {
					newChildren.push(children[childIndex] ?? oob());
					childIndex += 1;
				}
			}
			// Otherwise the mark only attaches new content from a separate build,
			// which is not inlined in this node, so there is nothing to copy over.
		}
		if (fieldChangeCount === 0) {
			// No changes to this field's content, so no need to update the field.
			continue;
		}
		// Any children beyond the marks are unchanged trailing content.
		while (childIndex < children.length) {
			newChildren.push(children[childIndex] ?? oob());
			childIndex += 1;
		}
		if (newChildren.length === 0) {
			node.fields.delete(fieldKey);
		} else {
			node.fields.set(fieldKey, newChildren);
		}
		changes += fieldChangeCount;
	}
	return changes;
}

/**
 * Computes the minimized set of builds for a change.
 *
 * @remarks
 * Iterates over the change's original `builds`, dropping any build whose nodes are entirely unused and splitting any
 * partially-used build so that only the runs of used (live) nodes are retained. Transient content nested within a
 * surviving node's build tree is trimmed via {@link trimMapTree}, re-chunking the node when its tree was modified.
 *
 * @param buildsIn - The original builds from the change to be minimized.
 * @param globalById - The `revision -> localId -> fields` lookup for the change's delta.
 * @param isLive - Predicate reporting whether the node with the given ID ends up attached in the resulting document.
 * @returns The minimized builds.
 */
function computeMinimizedBuilds(
	buildsIn: ChangeAtomIdBTree<TreeChunk>,
	globalById: ChangeAtomIdMap<DeltaFieldMap>,
	isLive: (id: ChangeAtomId) => boolean,
): ChangeAtomIdBTree<TreeChunk> {
	const buildsOut = newChangeAtomIdBTree<TreeChunk>();
	const droppedBuildIds: ChangeAtomIdSet = new Map();

	for (const [[revision, changeSetLocalId], chunk] of buildsIn.entries()) {
		const nodeChunks = splitChunkIntoNodes(chunk);

		// The chunks for a run of consecutive used nodes, flushed as a single build entry.
		let runChunks: TreeChunk[] = [];
		let runStart: number | undefined;
		const flushRun = (): void => {
			if (runStart !== undefined && runChunks.length > 0) {
				buildsOut.set([revision, brand(runStart)], combineChunks(runChunks));
			}
			runChunks = [];
			runStart = undefined;
		};

		for (let index = 0; index < nodeChunks.length; index += 1) {
			let nodeChunk = nodeChunks[index] ?? oob();
			const localId: ChangesetLocalId = offsetChangesetLocalId(changeSetLocalId, index);
			if (isLive({ revision, localId })) {
				// This top-level node survives. Trim any transient content nested within its built tree.
				const globalFields = globalById.get(revision)?.get(localId);
				if (globalFields !== undefined) {
					const mapTree = mapTreeFromNodeChunk(nodeChunk);
					if (trimMapTree(mapTree, globalFields, isLive) > 0) {
						// The node's build tree was modified, so re-chunk it to reflect the trimmed content.
						nodeChunk.referenceRemoved();
						nodeChunk = chunkTree(cursorForMapTreeNode(mapTree), minimizeChunkCompressor);
					}
				}

				runStart ??= localId;
				runChunks.push(nodeChunk);
			} else {
				addToNestedSet(droppedBuildIds, revision, localId);
				nodeChunk.referenceRemoved();
				flushRun();
			}
		}
		flushRun();
	}

	return buildsOut;
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
 * - drops any build whose nodes are entirely unused, and splits any partially-used build so that only the runs of used
 * nodes are retained,
 * - trims transient content nested within a surviving node's build tree, and
 * - prunes destroys for the removed builds, since destroying a node that was never built has no effect.
 *
 * The result applies to produce the same document as the input change.
 *
 * @param change - The change to minimize. Not mutated by this function.
 * @param fieldKinds - The field kinds to delegate to when computing the change's delta.
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

	const delta = intoDelta(makeAnonChange(change), fieldKinds);
	const globalById = indexGlobalById(delta);

	// Compute the set of detached node IDs whose content ends up attached in the resulting document. Content built by
	// this change but absent from this set has no observable effect and is treated as "dead" / trimmable below.
	const attached = collectAttachedDetachedNodeIds(delta, globalById);
	const isLive = ({ revision, localId }: ChangeAtomId): boolean =>
		nestedSetContains(attached, revision, localId);

	const minimizedBuilds = computeMinimizedBuilds(builds, globalById, isLive);

	const minimizedChange = {
		...change,
	};
	if (minimizedBuilds.size > 0) {
		minimizedChange.builds = minimizedBuilds;
	} else {
		delete minimizedChange.builds;
	}
	return minimizedChange;
}
