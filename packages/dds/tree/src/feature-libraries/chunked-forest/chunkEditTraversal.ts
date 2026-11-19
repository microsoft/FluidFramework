/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert, fail, oob } from "@fluidframework/core-utils/internal";

import type {
	FieldKey,
	ITreeCursorSynchronous,
	Range,
	TreeChunk,
	UpPath,
	Value,
} from "../../core/index.js";
import { replaceArrayRange } from "../../util/index.js";

import { BasicChunk } from "./basicChunk.js";
import { ChunkCursor, type ChunkLocalCursor } from "./chunkCursor.js";
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
 * Tries {@link ChunkEditCursor.trySplice}, then performs a generic splice if the field exposes child chunks.
 * @remarks
 * Requires an exclusively owned field. Returns undefined for unsupported inline edits without consuming content.
 * Generic edits to a chunk's root sequence must preserve {@link ChunkLocalCursor.rootLength}; its owning parent handles length changes.
 * Generic splices use {@link ChunkEditCursor.getFieldChunks} and {@link ChunkEditCursor.setFieldChunks}
 * to update the array and finalize format-specific bookkeeping, leaving the adapter at the same field.
 * @param cursor - Active {@link ChunkEditCursor}, positioned at the field to edit.
 * @param range - Half-open logical node range to remove from the whole field.
 * @param content - Incoming chunks, with one owned reference per entry; the array itself is not modified.
 * @param compressor - {@link ChunkCompressor} used for splitting and coalescing.
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
	const chunks = cursor.getFieldChunks?.();
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
	const nonEmptyContent = content.some((chunk) => chunk.topLevelLength === 0)
		? content.filter((chunk) => {
				if (chunk.topLevelLength === 0) {
					chunk.referenceRemoved();
					return false;
				}
				return true;
			})
		: content;
	const removed = spliceChunkField(chunks, range, nonEmptyContent, compressor);
	cursor.setFieldChunks(chunks);
	return removed;
}

/**
 * Splices an exclusively owned child array, first offering contained replacements to the child format.
 * @remarks
 * Consumes incoming references and returns owned outgoing references. The caller finalizes field bookkeeping.
 * Contained replacements delegate through {@link trySpliceField}; the fallback uses {@link splitFieldAtIndex}
 * and {@link coalesceUniformChunks} to preserve neighboring storage where possible.
 */
export function spliceChunkField(
	chunks: TreeChunk[],
	range: Range,
	content: readonly TreeChunk[],
	compressor: ChunkCompressor,
): TreeChunk[] {
	const count = range.end - range.start;
	if (count > 0 && count === getFieldLength(content)) {
		const { chunk, indexOfChunk, indexWithinChunk } = locateNodeInChunks(chunks, range.start);
		if (
			isEditableChunk(chunk) &&
			chunk.supportsRootEdits() &&
			indexWithinChunk + count <= chunk.topLevelLength
		) {
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
 * Ensures the selected node is stored in an exclusively owned {@link BasicChunk}.
 * @remarks
 * Mutates the owning chunk array, splitting and converting only the selected node as needed.
 * The returned chunk is owned by that array; no additional reference is transferred to the caller.
 * @param chunks - Exclusively owned child array whose references may be replaced during normalization.
 * @param index - Logical index of the selected node in the whole array's content.
 * @param compressor - {@link ChunkCompressor} used by {@link splitFieldAtIndex} and {@link basicChunkTree}.
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
		assert(isolatedChunk.topLevelLength === 1, 0xda9 /* expected an isolated node */);
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
 * Owns navigation through a {@link ChunkCursor} and supplies editing policy at chunk boundaries.
 * @remarks
 * Starts on the root {@link BasicChunk} node and borrows its reference.
 * The caller must exclusively own the root, keep it alive until {@link ChunkEditTraversal.free}, and not introduce sharing on the active path.
 * Crossing a boundary makes the child exclusive before navigation continues, exposing sharing inherited from ancestors.
 * Inline nodes need no separate ownership checks.
 */
export class ChunkEditTraversal
	implements
		Pick<
			ITreeCursorSynchronous,
			"enterNode" | "exitNode" | "enterField" | "exitField" | "getFieldLength" | "value"
		>
{
	/** Shared cursor that applies the editor's ownership policy before crossing chunk boundaries. */
	private readonly navigation: ChunkCursor;

	/**
	 * Starts on the supplied root node, ready to enter one of its fields.
	 * @param root - Exclusively owned {@link BasicChunk} borrowed for the editor's lifetime.
	 * @param compressor - {@link ChunkCompressor} used by delegated edits and normalization.
	 */
	public constructor(
		root: BasicChunk,
		/** Chunking and ID-compression context used for all edits during this traversal. */
		private readonly compressor: ChunkCompressor,
	) {
		this.navigation = new ChunkCursor(root.getEditCursor(), {
			prepareChunk: (chunks, index, location) => this.prepareChunk(chunks, index, location),
			cursorForChunk: (chunk) => this.cursorForChunk(chunk),
		});
		this.enterNode(0);
	}

	/**
	 * Releases borrowed navigation state through {@link ChunkCursor.releaseNavigation}.
	 * @remarks
	 * Does not change the content's reference counts.
	 */
	public free(): void {
		this.navigation.releaseNavigation();
	}

	public enterNode(index: number): void {
		this.navigation.enterNode(index);
	}

	public exitNode(): void {
		this.navigation.exitNode();
	}

	public enterField(key: FieldKey): void {
		this.navigation.enterField(key);
	}

	public exitField(): void {
		this.navigation.exitField();
	}

	public getFieldLength(): number {
		return this.navigation.getFieldLength();
	}

	public get value(): Value {
		return this.navigation.value;
	}

	/**
	 * Tests whether the current location is the named field directly under the supplied root node.
	 * @remarks
	 * Requires fields mode; used to reject transfers of a detached field into itself.
	 */
	public isRootField(key: FieldKey): boolean {
		return this.navigation.isRootField(key);
	}

	/**
	 * Returns {@link ChunkCursor.localAdapter} as a {@link ChunkEditCursor}.
	 * @remarks
	 * Editing traversal enters only storage that provides a child-array hook, a format-specific splice hook, or both.
	 */
	private get editingCursor(): ChunkEditCursor {
		const local = this.navigation.localAdapter;
		assert("getFieldChunks" in local || "trySplice" in local, "Expected an editing cursor");
		return local as ChunkEditCursor;
	}

	/** Makes the selected child exclusive, using {@link ensureExclusiveBasicChunk} for formats without editing support. */
	private prepareChunk(
		chunks: readonly TreeChunk[],
		index: number,
		existingLocation?: ReturnType<typeof locateNodeInChunks>,
	): ReturnType<typeof locateNodeInChunks> {
		const owned = this.editingCursor.getFieldChunks?.() ?? fail("Expected owned child chunks");
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

	/** Obtains the prepared child's {@link ChunkEditCursor} after the ownership check. */
	private cursorForChunk(chunk: TreeChunk): ChunkLocalCursor {
		// Editing adapters may carry format-specific mutation state, so do not reuse a read adapter here.
		assert(isEditableChunk(chunk), "Expected editable child storage");
		return chunk.getEditCursor();
	}

	/**
	 * Applies every valid splice, normalizing the current field's parent path when its format declines the edit.
	 * @remarks
	 * Uses {@link trySpliceField} and consumes incoming references as specified by {@link ChunkEditCursor.trySplice}.
	 * Requires fields mode and remains at the same logical field after editing.
	 * @param range - Half-open logical node range to remove; an empty range inserts without removal.
	 * @param content - Incoming chunks, with one owned reference per entry. The array itself is not modified.
	 * @returns Owned chunks containing the removed nodes.
	 */
	public splice(range: Range, content: readonly TreeChunk[]): TreeChunk[] {
		let removed = trySpliceField(this.editingCursor, range, content, this.compressor);
		if (removed === undefined) {
			// A declined attempt preserves the tree and incoming references, so normalization can retry the same edit.
			this.normalizeCurrentField();
			removed = trySpliceField(this.editingCursor, range, content, this.compressor);
			assert(removed !== undefined, "Basic chunks must support owned-field edits");
		}
		return removed;
	}

	/**
	 * Converts only the active chunk's parent path, then re-enters it through the shared traversal.
	 * @remarks
	 * Suspended ancestors already provide independently stored child references and need no conversion.
	 * {@link ChunkCursor.restoreOwningField} supplies the original owning field.
	 * Re-entering through {@link ChunkEditTraversal.enterBasicNode} rebuilds frames for new chunk boundaries so subsequent exits restore the correct owners.
	 */
	private normalizeCurrentField(): void {
		// Preserve the local path before conversion releases the old chunk and invalidates its adapter.
		const fieldPath = this.navigation.localAdapter.getFieldPath();
		const path: UpPath[] = [];
		for (let node = fieldPath.parent; node !== undefined; node = node.parent) {
			path.push(node);
		}
		const root = path.pop() ?? fail("Expected a node within the chunk");
		const start = this.navigation.restoreOwningField();
		// Translate the old chunk-relative root index into its suspended owning field's coordinates.
		this.enterBasicNode(start + root.parentIndex);
		while (path.length > 0) {
			const node = path.pop() ?? oob();
			this.enterField(node.parentField);
			this.enterBasicNode(node.parentIndex);
		}
		this.enterField(fieldPath.field);
	}

	/**
	 * Normalizes the selected child with {@link ensureExclusiveBasicChunk}, then enters it through {@link ChunkEditTraversal.enterNode}.
	 * @remarks
	 * Requires a field with a separately stored child array; index is relative to that whole field.
	 */
	private enterBasicNode(index: number): void {
		const chunks =
			this.editingCursor.getFieldChunks?.() ?? fail("Expected separately stored children");
		ensureExclusiveBasicChunk(chunks, index, this.compressor);
		this.enterNode(index);
	}
}
