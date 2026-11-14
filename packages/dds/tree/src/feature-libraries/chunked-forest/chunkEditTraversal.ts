/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert, fail, oob } from "@fluidframework/core-utils/internal";

import type { FieldKey, Range, TreeChunk, UpPath } from "../../core/index.js";
import { replaceArrayRange } from "../../util/index.js";

import { BasicChunk } from "./basicChunk.js";
import { ChunkTraversal, type ChunkLocalCursor } from "./chunkCursor.js";
import {
	type ChunkEditCursor,
	getFieldLength,
	isEditableChunk,
	locateNodeInChunks,
	validateChunkEditRange,
} from "./chunkEditing.js";
import {
	type ChunkCompressor,
	basicChunkTree,
	splitFieldAtIndex,
	coalesceUniformChunks,
} from "./chunkTree.js";

/**
 * Tries a format-specific edit, then performs a generic splice if the field exposes child chunks.
 * @remarks
 * Requires an exclusively owned field. Returns undefined for unsupported inline edits without consuming content.
 * Generic edits to a chunk's root sequence must preserve its top-level node count; its owning parent handles length changes.
 * The adapter remains at the same field and receives the edited array for format-specific bookkeeping.
 * @param cursor - Active editing adapter, positioned at the field to edit.
 * @param range - Half-open logical node range to remove from the whole field.
 * @param content - Incoming chunks, with one owned reference per entry; the array itself is not modified.
 * @param compressor - Policy and ID compressor used for splitting and coalescing.
 * @returns Owned chunks containing the removed nodes, consuming incoming references on success.
 */
export function trySpliceField(
	cursor: ChunkEditCursor,
	range: Range,
	content: readonly TreeChunk[],
	compressor: ChunkCompressor,
): TreeChunk[] | undefined {
	validateChunkEditRange(range, cursor.getFieldLength());
	const specialized = cursor.trySplice?.(range, content, compressor);
	if (specialized !== undefined) {
		return specialized;
	}
	const chunks = cursor.getFieldChunks();
	if (
		chunks === undefined ||
		(cursor.atChunkRoot() && range.end - range.start !== getFieldLength(content))
	) {
		return undefined;
	}
	assert(
		cursor.setFieldChunks !== undefined,
		"Exposed child arrays require write-back support",
	);
	const removed = spliceChunkField(chunks, range, content, compressor);
	cursor.setFieldChunks(chunks);
	return removed;
}

/**
 * Splices an exclusively owned child array, first offering contained replacements to the child format.
 * Consumes incoming references and returns owned outgoing references. The caller finalizes field bookkeeping.
 */
function spliceChunkField(
	chunks: TreeChunk[],
	range: Range,
	content: readonly TreeChunk[],
	compressor: ChunkCompressor,
): TreeChunk[] {
	const count = range.end - range.start;
	if (count > 0 && count === getFieldLength(content)) {
		const { chunk, indexOfChunk, indexWithinChunk } = locateNodeInChunks(chunks, range.start);
		if (isEditableChunk(chunk) && indexWithinChunk + count <= chunk.topLevelLength) {
			// Keep a speculative clone out of the owning array until the edit succeeds, so a declined attempt
			// leaves the parent's reference unchanged and can fall back without consuming incoming content.
			const editable = chunk.isShared() ? chunk.clone() : chunk;
			const replaced = trySpliceField(
				editable.getEditCursor(),
				{ start: indexWithinChunk, end: indexWithinChunk + count },
				content,
				compressor,
			);
			if (replaced !== undefined) {
				if (editable !== chunk) {
					chunks[indexOfChunk] = editable;
					chunk.referenceRemoved();
				}
				return replaced;
			}
			if (editable !== chunk) {
				// A declined edit leaves the input untouched; discard the speculative clone before splitting.
				editable.referenceRemoved();
			}
		}
	}
	// Splitting the start first prevents the end split from shifting its saved chunk index.
	// If repeated scans become costly, splitting both boundaries in one pass could avoid walking the same prefix twice.
	const start = splitFieldAtIndex(chunks, range.start, compressor);
	const end = splitFieldAtIndex(chunks, range.end, compressor);
	const removed = chunks.slice(start, end);
	replaceArrayRange(chunks, start, end, content);
	// Check the incoming chunks and one neighbor on each side. With no incoming chunks, this covers
	// the newly adjacent pair on either side of the removed range.
	coalesceUniformChunks(chunks, compressor.policy, {
		start: Math.max(0, start - 1),
		end: Math.min(chunks.length, start + content.length + 1),
	});
	return removed;
}

/**
 * Ensures the selected node is stored in an exclusively owned BasicChunk.
 * @remarks
 * Mutates the owning chunk array, splitting and converting only the selected node as needed.
 * The returned chunk is owned by that array; no additional reference is transferred to the caller.
 * @param chunks - Exclusively owned child array whose references may be replaced during normalization.
 * @param index - Logical index of the selected node in the whole array's content.
 * @param compressor - Representation policy and ID compressor used when splitting or converting storage.
 */
export function ensureExclusiveBasicChunk(
	chunks: TreeChunk[],
	index: number,
	compressor: ChunkCompressor,
): BasicChunk {
	const { chunk, indexOfChunk } = locateNodeInChunks(chunks, index);
	let finalIndexOfChunk: number;
	let basicChunk: BasicChunk;
	if (chunk instanceof BasicChunk) {
		basicChunk = chunk;
		finalIndexOfChunk = indexOfChunk;
	} else {
		// Split the end first so the last call returns the target node's final chunk index.
		if (chunk.topLevelLength > 1) {
			splitFieldAtIndex(chunks, index + 1, compressor);
			finalIndexOfChunk = splitFieldAtIndex(chunks, index, compressor);
		} else {
			finalIndexOfChunk = indexOfChunk;
		}
		// Splitting can replace and release the original chunk, so read the current array entry.
		const isolatedChunk = chunks[finalIndexOfChunk] ?? oob();
		assert(isolatedChunk.topLevelLength === 1, "expected an isolated node");
		const cursor = isolatedChunk.cursor();
		cursor.firstNode();
		// Conversion can reuse a BasicChunk inside the source, so acquire it before releasing the source.
		basicChunk = basicChunkTree(cursor, compressor);
		chunks[finalIndexOfChunk] = basicChunk;
		isolatedChunk.referenceRemoved();
	}
	debugAssert(() => chunks[finalIndexOfChunk] === basicChunk || "bad child index");
	if (basicChunk.isShared()) {
		const exclusiveChunk = basicChunk.clone();
		chunks[finalIndexOfChunk] = exclusiveChunk;
		basicChunk.referenceRemoved();
		return exclusiveChunk;
	}
	return basicChunk;
}

/**
 * Ownership-aware traversal using the same chunk boundary stack as read cursors.
 * @remarks
 * Starts on the root BasicChunk node and borrows its reference.
 * The caller must exclusively own the root, keep it alive until free(), and not introduce sharing on the active path.
 * Crossing a boundary makes the child exclusive before navigation continues, exposing sharing inherited from ancestors.
 * Inline nodes need no separate ownership checks.
 */
export class ChunkEditTraversal extends ChunkTraversal {
	/**
	 * Starts on the supplied root node, ready to enter one of its fields.
	 * @param root - Exclusively owned root borrowed for the editor's lifetime.
	 * @param compressor - Representation policy used by delegated edits and normalization.
	 */
	public constructor(
		root: BasicChunk,
		/** Chunking and ID-compression context used for all edits during this traversal. */
		private readonly compressor: ChunkCompressor,
	) {
		super(root.getEditCursor());
		this.enterNode(0);
	}

	/** Releases borrowed navigation state without changing the content's reference counts. */
	public free(): void {
		this.clearTraversal();
	}

	/**
	 * Tests whether the current location is the named field directly under the supplied root node.
	 * Requires fields mode; used to reject transfers of a detached field into itself.
	 */
	public isRootField(key: FieldKey): boolean {
		return this.parentStack.length === 0 && this.local.getFieldKey() === key;
	}

	/** Returns the active adapter under the invariant that editing traversal enters only editable storage. */
	private editingCursor(): ChunkEditCursor {
		assert("getFieldChunks" in this.local, "Expected an editing cursor");
		return this.local as ChunkEditCursor;
	}

	protected override prepareChunk(
		chunks: readonly TreeChunk[],
		index: number,
		existingLocation?: ReturnType<typeof locateNodeInChunks>,
	): ReturnType<typeof locateNodeInChunks> {
		const owned = this.editingCursor().getFieldChunks() ?? fail("Expected owned child chunks");
		assert(owned === chunks, "Expected the active owning array");
		const location = existingLocation ?? locateNodeInChunks(owned, index);
		const { chunk, indexOfChunk } = location;
		if (!isEditableChunk(chunk)) {
			ensureExclusiveBasicChunk(owned, index, this.compressor);
			return locateNodeInChunks(owned, index);
		}
		// Ancestors are already exclusive: cloning them has exposed any indirect sharing of this child.
		if (chunk.isShared()) {
			const exclusive = chunk.clone();
			owned[indexOfChunk] = exclusive;
			chunk.referenceRemoved();
			return { ...location, chunk: exclusive };
		}
		return location;
	}

	protected override cursorForChunk(chunk: TreeChunk): ChunkLocalCursor {
		// Editing adapters may carry format-specific mutation state, so do not reuse a read adapter here.
		assert(isEditableChunk(chunk), "Expected editable child storage");
		return chunk.getEditCursor();
	}

	/**
	 * Applies every valid splice, normalizing the current field's parent path when its format declines the edit.
	 * Consumes incoming references and returns owned outgoing references as specified by ChunkEditCursor.trySplice.
	 * Requires fields mode and remains at the same logical field after editing.
	 * @param range - Half-open logical node range to remove; an empty range inserts without removal.
	 * @param content - Incoming chunks, with one owned reference per entry. The array itself is not modified.
	 * @returns Owned chunks containing the removed nodes.
	 */
	public splice(range: Range, content: readonly TreeChunk[]): TreeChunk[] {
		let removed = trySpliceField(this.editingCursor(), range, content, this.compressor);
		if (removed === undefined) {
			// A declined attempt preserves the tree and incoming references, so normalization can retry the same edit.
			this.normalizeCurrentField();
			removed = trySpliceField(this.editingCursor(), range, content, this.compressor);
			assert(removed !== undefined, "Basic chunks must support owned-field edits");
		}
		return removed;
	}

	/**
	 * Converts only the active chunk's parent path, then re-enters it through the shared traversal.
	 * Suspended ancestors already provide independently stored child references and need no conversion.
	 * Re-entering the path rebuilds frames for newly introduced chunk boundaries so subsequent exits restore the correct owners.
	 */
	private normalizeCurrentField(): void {
		// Preserve the local path before conversion releases the old chunk and invalidates its adapter.
		const fieldPath = this.local.getFieldPath();
		const path: UpPath[] = [];
		for (let node = fieldPath.parent; node !== undefined; node = node.parent) {
			path.push(node);
		}
		const root = path.pop() ?? fail("Expected a node within the chunk");
		assert(this.parentStack.length > 0, "Root chunk must support field edits");
		const parent = this.restoreParent();
		// Translate the old chunk-relative root index into its suspended owning field's coordinates.
		this.enterBasicNode(parent.start + root.parentIndex);
		while (path.length > 0) {
			const node = path.pop() ?? oob();
			this.enterField(node.parentField);
			this.enterBasicNode(node.parentIndex);
		}
		this.enterField(fieldPath.field);
	}

	/**
	 * Normalizes the selected child to exclusive BasicChunk storage, then enters it through the shared traversal.
	 * Requires a field with a separately stored child array; index is relative to that whole field.
	 */
	private enterBasicNode(index: number): void {
		const chunks =
			this.editingCursor().getFieldChunks() ?? fail("Expected separately stored children");
		ensureExclusiveBasicChunk(chunks, index, this.compressor);
		this.enterNode(index);
	}
}
