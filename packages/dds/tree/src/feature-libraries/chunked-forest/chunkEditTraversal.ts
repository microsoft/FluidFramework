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

import { BasicChunk } from "./basicChunk.js";
import { ChunkCursor, type ChunkLocalCursor } from "./chunkCursor.js";
import {
	type ChunkEditCursor,
	getFieldLength,
	isEditableChunk,
	locateNodeInChunks,
	validateChunkEditRange,
} from "./chunkEditing.js";
import { type ChunkEdit, ChunkSequenceEditor } from "./chunkSequence.js";
import {
	type ChunkCompressor,
	basicChunkTree,
	groupChunks,
	splitFieldAtIndex,
	coalesceUniformChunks,
} from "./chunkTree.js";

/** Narrows the additional contract supplied by editing adapters. */
function assertEditingCursor(cursor: ChunkLocalCursor): asserts cursor is ChunkEditCursor {
	assert(
		"release" in cursor && typeof cursor.release === "function",
		"Expected an editing cursor",
	);
}

/**
 * Tries {@link ChunkEditCursor.trySplice}, then performs a generic splice if the field exposes child chunks.
 * @remarks
 * Requires an exclusively owned field. Returns undefined for unsupported inline edits without consuming content.
 * Generic edits to a chunk's root sequence must preserve {@link ChunkLocalCursor.rootLength}; its owning parent handles length changes.
 * Generic splices use {@link ChunkEditCursor.getFieldEditor} to transfer references and publish updated
 * metadata, leaving the adapter at the same field.
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
	const field = cursor.getFieldEditor?.();
	if (
		field === undefined ||
		(cursor.atChunkRoot() && range.end - range.start !== getFieldLength(content))
	) {
		return undefined;
	}
	const nonEmptyContent = content.some((chunk) => chunk.topLevelLength === 0)
		? content.filter((chunk) => {
				if (chunk.topLevelLength === 0) {
					chunk.referenceRemoved();
					return false;
				}
				return true;
			})
		: content;
	return spliceChunkField(field, range, nonEmptyContent, compressor);
}

/**
 * Splices an exclusively owned child array, first offering contained replacements to the child format.
 * @remarks
 * Consumes incoming references and returns owned outgoing references.
 * The field editor publishes structural changes and their offsets together.
 * Contained replacements delegate through {@link trySpliceField}; the fallback uses {@link splitFieldAtIndex}
 * and {@link coalesceUniformChunks} to preserve neighboring storage where possible.
 */
function spliceChunkField(
	field: ChunkSequenceEditor,
	range: Range,
	content: readonly TreeChunk[],
	compressor: ChunkCompressor,
): TreeChunk[] {
	const chunks = field.chunks;
	const count = range.end - range.start;
	if (count > 0 && count === getFieldLength(content)) {
		const { chunk, indexOfChunk, indexWithinChunk } = locateNodeInChunks(chunks, range.start);
		if (
			isEditableChunk(chunk) &&
			chunk.supportsRootEdits() &&
			indexWithinChunk + count <= chunk.topLevelLength
		) {
			const scope = field.acquireChild(indexOfChunk, true, true);
			assert(isEditableChunk(scope.chunk), "Expected editable storage");
			const cursor = scope.chunk.getEditCursor(scope);
			let replaced: TreeChunk[] | undefined;
			try {
				replaced = trySpliceField(
					cursor,
					{ start: indexWithinChunk, end: indexWithinChunk + count },
					content,
					compressor,
				);
			} finally {
				cursor.release(replaced !== undefined);
			}
			if (replaced !== undefined) {
				return replaced;
			}
		}
	}
	// Splitting the start first prevents the end split from shifting its saved chunk index.
	const start = splitFieldAtIndex(field, range.start, compressor);
	const end = splitFieldAtIndex(field, range.end, compressor);
	const removed = field.splice(start, end - start, content);
	// Check the incoming chunks and one neighbor on each side. With no incoming chunks, this covers
	// the newly adjacent pair on either side of the removed range.
	coalesceUniformChunks(field, compressor.policy, {
		start: Math.max(0, start - 1),
		end: Math.min(chunks.length, start + content.length + 1),
	});
	if (chunks.length > compressor.policy.sequenceChunkSplitThreshold) {
		field.transformRange(0, chunks.length, (owned) => groupChunks(owned, compressor.policy));
	}
	return removed;
}

/**
 * Ensures the selected node is stored in an exclusively owned {@link BasicChunk}.
 * @remarks
 * Mutates the owning chunk array, splitting and converting only the selected node as needed.
 * The returned chunk is owned by that array; no additional reference is transferred to the caller.
 * @param field - Owning field editor or exclusively owned child array used during normalization.
 * @param index - Logical index of the selected node in the whole array's content.
 * @param compressor - {@link ChunkCompressor} used by {@link splitFieldAtIndex} and {@link basicChunkTree}.
 */
export function ensureExclusiveBasicChunk(
	field: TreeChunk[] | ChunkSequenceEditor,
	index: number,
	compressor: ChunkCompressor,
): BasicChunk {
	const chunks = field instanceof ChunkSequenceEditor ? field.chunks : field;
	const { chunk, indexOfChunk } = locateNodeInChunks(chunks, index);
	let finalIndexOfChunk: number;
	let basicChunk: BasicChunk;
	if (chunk instanceof BasicChunk) {
		basicChunk = chunk;
		finalIndexOfChunk = indexOfChunk;
	} else {
		// Split the end first so the last call returns the target node's final chunk index.
		if (chunk.topLevelLength > 1) {
			splitFieldAtIndex(field, index + 1, compressor);
			finalIndexOfChunk = splitFieldAtIndex(field, index, compressor);
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
		if (field instanceof ChunkSequenceEditor) {
			field.splice(finalIndexOfChunk, 1, [basicChunk]);
		} else {
			field[finalIndexOfChunk] = basicChunk;
		}
		isolatedChunk.referenceRemoved();
	}
	debugAssert(() => chunks[finalIndexOfChunk] === basicChunk || "bad child index");
	if (field instanceof ChunkSequenceEditor) {
		const scope = field.acquireChild(finalIndexOfChunk);
		assert(scope.chunk instanceof BasicChunk, "Expected a basic chunk");
		const exclusive = scope.chunk;
		scope.close();
		return exclusive;
	}
	if (basicChunk.isShared()) {
		const exclusiveChunk = basicChunk.clone();
		field[finalIndexOfChunk] = exclusiveChunk;
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
	private prepared: ChunkEdit | undefined;

	/**
	 * Starts on the supplied root node, ready to enter one of its fields.
	 * @param root - Exclusively owned {@link BasicChunk} borrowed for the editor's lifetime.
	 * @param compressor - {@link ChunkCompressor} used by delegated edits and normalization.
	 */
	public constructor(
		root: BasicChunk,
		/** Chunking and ID-compression context used for all edits during this traversal. */
		private readonly compressor: ChunkCompressor,
		rootEdit?: ChunkEdit,
	) {
		this.navigation = new ChunkCursor(root.getEditCursor(rootEdit), {
			prepareChunk: (chunks, index, location) => this.prepareChunk(chunks, index, location),
			cursorForChunk: (chunk) => this.cursorForChunk(chunk),
			releaseChunk: (cursor) => {
				assertEditingCursor(cursor);
				cursor.release();
			},
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
		assertEditingCursor(local);
		return local;
	}

	/** Makes the selected child exclusive, using {@link ensureExclusiveBasicChunk} for formats without editing support. */
	private prepareChunk(
		chunks: readonly TreeChunk[],
		index: number,
		existingLocation?: ReturnType<typeof locateNodeInChunks>,
	): ReturnType<typeof locateNodeInChunks> {
		const field =
			this.editingCursor.getFieldEditor?.() ?? fail(0xe09 /* Expected owned child chunks */);
		const owned = field.chunks;
		assert(owned === chunks, 0xe0a /* Expected the active owning array */);
		let location = existingLocation ?? locateNodeInChunks(owned, index);
		if (!isEditableChunk(location.chunk)) {
			ensureExclusiveBasicChunk(field, index, this.compressor);
			location = locateNodeInChunks(owned, index);
		}
		this.prepared = field.acquireChild(location.indexOfChunk, true);
		return { ...location, chunk: this.prepared.chunk };
	}

	/** Obtains the prepared child's {@link ChunkEditCursor} after the ownership check. */
	private cursorForChunk(chunk: TreeChunk): ChunkLocalCursor {
		// Editing adapters may carry format-specific mutation state, so do not reuse a read adapter here.
		assert(isEditableChunk(chunk), 0xe0b /* Expected editable child storage */);
		const scope = this.prepared;
		assert(scope?.chunk === chunk, "Missing prepared editing scope");
		this.prepared = undefined;
		return chunk.getEditCursor(scope);
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
			assert(removed !== undefined, 0xe0c /* Basic chunks must support owned-field edits */);
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
		const root = path.pop() ?? fail(0xe0d /* Expected a node within the chunk */);
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
		const field =
			this.editingCursor.getFieldEditor?.() ??
			fail(0xe0e /* Expected separately stored children */);
		ensureExclusiveBasicChunk(field, index, this.compressor);
		this.enterNode(index);
	}
}
