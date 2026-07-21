/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	ChangeAtomIdMap,
	ChangesetLocalId,
	DeltaFieldMap,
	ExclusiveMapTree,
} from "../../core/index.js";
import { offsetChangesetLocalId } from "../../core/index.js";
import { brand } from "../../util/index.js";

import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import { newChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import type { TreeChunk } from "../chunked-forest/index.js";
import { chunkTree, combineChunks, defaultChunkPolicy } from "../chunked-forest/index.js";
import { cursorForMapTreeNode, mapTreeFromCursor } from "../mapTreeCursor.js";

/** Chunking policy used to re-chunk a build when it is split into smaller builds. */
const minimizeChunkCompressor = {
	policy: defaultChunkPolicy,
	idCompressor: undefined,
} as const;

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
 * @returns The number of subtrees removed from the tree's fields.
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
			// Otherwise the mark attaches new content from a separate build,
			// which is not inlined in this node, OR from a preexisting detatched
			// root or node that gets detached as part of this change. In all
			// cases, there is nothing to copy over.
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
export function computeMinimizedBuilds(
	buildsIn: ChangeAtomIdBTree<TreeChunk>,
	globalById: ChangeAtomIdMap<DeltaFieldMap>,
	isLive: (id: ChangeAtomId) => boolean,
): ChangeAtomIdBTree<TreeChunk> {
	const buildsOut = newChangeAtomIdBTree<TreeChunk>();

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
				nodeChunk.referenceRemoved();
				flushRun();
			}
		}
		flushRun();
	}

	return buildsOut;
}
