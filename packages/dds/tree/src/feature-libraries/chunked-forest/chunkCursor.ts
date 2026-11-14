/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	cursorChunk,
	dummyRoot,
	type ChunkedCursor,
	type FieldKey,
	type FieldUpPath,
	type PathRootPrefix,
	type TreeChunk,
	type TreeType,
	type UpPath,
	type Value,
} from "../../core/index.js";
import { SynchronousCursor } from "../treeCursorUtils.js";

import { getFieldLength, locateNodeInChunks } from "./chunkEditing.js";

/**
 * Storage-local field adapter used by {@link ChunkTraversal}, not a complete tree cursor.
 * {@link ChunkInlineCursor} extends this contract with navigation over nodes stored within the chunk.
 * {@link ChunkCursor} composes these adapters into a complete {@link ChunkedCursor} over the logical tree.
 *
 * When {@link ChunkLocalCursor.getFieldChunks} returns an array, the shared traversal enters those child chunks.
 * Otherwise the adapter must implement {@link ChunkInlineCursor} to enter nodes stored inline.
 * A sequence exposes its root field, so crossing that boundary adds no logical tree depth.
 */
export interface ChunkLocalCursor
	extends Pick<
		ChunkedCursor,
		"mode" | "atChunkRoot" | "getFieldKey" | "getFieldLength" | "getFieldPath"
	> {
	/**
	 * Borrows the current field's child array, or returns undefined for inline content.
	 * Requires fields mode. Navigation must not mutate the array or its reference counts.
	 */
	getFieldChunks?(): readonly TreeChunk[] | undefined;
	/**
	 * Copies this adapter's position into an independently navigable adapter.
	 * Borrows the same storage without adding counted references.
	 */
	fork(): ChunkLocalCursor;
}

/**
 * Extends {@link ChunkLocalCursor} with the node and field navigation needed for inline content.
 * Unlike {@link ChunkedCursor}, this adapter leaves navigation across child chunk boundaries to {@link ChunkTraversal}.
 *
 * The omitted members are supplied by {@link ChunkLocalCursor},
 * by {@link SynchronousCursor} for cursor identification and pending-state handling,
 * or by {@link ChunkTraversal} for the convenience operations `firstNode` and `nextNode`.
 */
export interface ChunkInlineCursor
	extends ChunkLocalCursor,
		Omit<
			ChunkedCursor,
			keyof ChunkLocalCursor | keyof SynchronousCursor | "firstNode" | "nextNode"
		> {}

/**
 * A chunk whose local cursor exposes child chunk boundaries without composing child cursors.
 */
export interface CompositeChunk extends TreeChunk {
	/**
	 * Creates a local cursor at this chunk's root field.
	 * @param reuse - Optional exited adapter that the implementation may reset instead of allocating.
	 * The caller relinquishes this adapter's navigation state and must not use it after this call.
	 * Storage remains borrowed, whether the implementation reuses the adapter or returns a new one.
	 */
	getLocalCursor(reuse?: ChunkLocalCursor): ChunkLocalCursor;
}

/** A suspended owning field, including the physical slot and the enclosing logical coordinates. */
interface ChunkCursorFrame {
	/** Parent adapter in fields mode, restored on exit or before normalization replaces the child. */
	readonly cursor: ChunkLocalCursor;
	/** Borrowed child array of the suspended field; owns the reference to the selected child chunk. */
	readonly chunks: readonly TreeChunk[];
	/** Physical child slot, distinct from the node's logical index in the whole field. */
	indexOfChunk: number;
	/** Logical index of the selected chunk's first node in this parent's local field. */
	start: number;
	/** Parent adapter's root-node offset, restored when this boundary is exited. */
	readonly parentOffset: number;
	/** Whether the parent adapter's root field is also the traversal's root field. */
	readonly parentAtRoot: boolean;
	/** Parent chunk's top-level node count, restored for subsequent inline seeks. */
	readonly parentLength: number;
}

/**
 * Composes chunk-local navigation with one active cursor and an explicit stack of chunk boundaries.
 * Borrows all storage. Read cursors and editors expose different capabilities over this traversal.
 * Sequence boundaries contribute offsets, but not nodes, to logical paths.
 */
export abstract class ChunkTraversal
	extends SynchronousCursor
	implements Omit<ChunkedCursor, "fork">
{
	/** Physical chunk boundaries from root to leaf, including transparent sequence boundaries. */
	protected readonly parentStack: ChunkCursorFrame[] = [];
	/** Offset of the active chunk's root nodes in their logical field, including all enclosing sequences. */
	protected offset = 0;
	/** Whether the active chunk's root field is also the traversal's root field. */
	protected atRoot = true;
	/** Active chunk's top-level node count, used to seek inline before crossing a boundary. */
	protected rootLength: number;
	/**
	 * Active storage-local adapter; undefined after navigation state has been released.
	 * Its root field and paths are relative to the active chunk, not the traversal's original root.
	 * Inline ancestors remain in this adapter's state; separately stored ancestors are retained in parentStack.
	 */
	private current: ChunkLocalCursor | undefined;

	/**
	 * Starts traversal at the root field exposed by an adapter.
	 * @param local - Adapter positioned at its chunk's root field. Its storage is borrowed for the traversal's lifetime.
	 */
	public constructor(local: ChunkLocalCursor) {
		super();
		this.current = local;
		this.rootLength = local.getFieldLength();
	}

	/** Active adapter, rejecting access after navigation state has been released. */
	protected get local(): ChunkLocalCursor {
		return this.current ?? fail("Cursor has been freed");
	}
	protected set local(cursor: ChunkLocalCursor) {
		this.current = cursor;
	}

	/** Requires inline content: sequence adapters are only active at fields with separately stored children. */
	private get inline(): ChunkInlineCursor {
		const local = this.local;
		assert("enterNode" in local, "Expected an inline-node adapter");
		return local as ChunkInlineCursor;
	}

	/** Discards all adapters and boundary frames without changing counted references to content. */
	protected clearTraversal(): void {
		this.current = undefined;
		this.parentStack.length = 0;
	}

	/**
	 * Obtains a root-field adapter, including for chunks that only expose a complete cursor.
	 * @param chunk - Chunk whose storage is borrowed by the returned adapter.
	 * @param reuse - Exited adapter offered for reuse under {@link CompositeChunk.getLocalCursor}'s contract.
	 */
	protected static localCursor(chunk: TreeChunk, reuse?: ChunkLocalCursor): ChunkLocalCursor {
		if ("getLocalCursor" in chunk) {
			return (chunk as CompositeChunk).getLocalCursor(reuse);
		}
		const cursor = chunk.cursor();
		// A wrapper chunk can forward cursor() to another chunk. Unwrap its fresh traversal instead of nesting it.
		if (cursor instanceof ChunkCursor) {
			assert(cursor.parentStack.length === 0, "Expected a fresh root-field cursor");
			return cursor.local;
		}
		return cursor;
	}

	/** Replaces navigation state with a borrowed adapter positioned at its root field. */
	protected reset(local: ChunkLocalCursor): void {
		this.parentStack.length = 0;
		this.local = local;
		this.offset = 0;
		this.atRoot = true;
		this.rootLength = local.getFieldLength();
	}

	/**
	 * Copies adapters and boundary frames so the target navigates independently over the same borrowed storage.
	 * The target must have no suspended parent frames. Used when forking read cursors.
	 */
	protected copyTo(target: ChunkTraversal): void {
		target.local = this.local.fork();
		// Read navigation does not mutate the borrowed child arrays. Copy mutable frame positions and adapter state,
		// but keep references to the same content arrays rather than copying the stored tree.
		for (const frame of this.parentStack) {
			target.parentStack.push({ ...frame, cursor: frame.cursor.fork() });
		}
		target.offset = this.offset;
		target.atRoot = this.atRoot;
		target.rootLength = this.rootLength;
	}

	public get mode(): CursorLocationType {
		return this.local.mode;
	}
	public get value(): Value {
		return this.inline.value;
	}
	public get type(): TreeType {
		return this.inline.type;
	}
	/**
	 * Returns the active adapter's borrowed chunk for the current node, when available.
	 * Requires nodes mode; the returned chunk covers the range described by chunkStart and chunkLength.
	 */
	public get [cursorChunk](): TreeChunk | undefined {
		return this.inline[cursorChunk];
	}
	public atChunkRoot(): boolean {
		return this.atRoot && this.local.atChunkRoot();
	}
	public get fieldIndex(): number {
		const inline = this.inline;
		return inline.fieldIndex + (inline.atChunkRoot() ? this.offset : 0);
	}
	public get chunkStart(): number {
		const inline = this.inline;
		return inline.chunkStart + (inline.atChunkRoot() ? this.offset : 0);
	}
	public get chunkLength(): number {
		return this.inline.chunkLength;
	}
	public getFieldKey(): FieldKey {
		return this.local.getFieldKey();
	}
	public getFieldLength(): number {
		return this.local.getFieldLength();
	}
	public enterField(key: FieldKey): void {
		this.inline.enterField(key);
	}
	public exitField(): void {
		this.inline.exitField();
	}
	public firstField(): boolean {
		return this.inline.firstField();
	}
	public nextField(): boolean {
		return this.inline.nextField();
	}

	public firstNode(): boolean {
		if (this.getFieldLength() === 0) {
			return false;
		}
		this.enterNode(0);
		return true;
	}

	/**
	 * Selects storage before crossing its owning boundary; editing traversal can make that slot exclusive.
	 * @param chunks - Child array exposed by the active field adapter.
	 * @param index - Logical node index in the whole field, not a physical chunk-array index.
	 * @param location - Optional known location in that array, avoiding a repeated scan during sibling traversal.
	 * @returns The selected chunk and its physical and logical offsets after any ownership changes.
	 */
	protected prepareChunk(
		chunks: readonly TreeChunk[],
		index: number,
		location?: ReturnType<typeof locateNodeInChunks>,
	): ReturnType<typeof locateNodeInChunks> {
		return location ?? locateNodeInChunks(chunks, index);
	}

	/**
	 * Creates the selected child's root-field adapter after {@link ChunkTraversal.prepareChunk} resolves ownership.
	 * Editing traversal overrides this to obtain the child's editing adapter.
	 * @param chunk - Selected child whose storage is borrowed.
	 * @param reuse - Exited adapter offered for reuse under {@link CompositeChunk.getLocalCursor}'s contract.
	 */
	protected cursorForChunk(chunk: TreeChunk, reuse?: ChunkLocalCursor): ChunkLocalCursor {
		return ChunkTraversal.localCursor(chunk, reuse);
	}

	public enterNode(index: number): void {
		this.enterNodeAt(index);
	}

	/**
	 * Enters a node, crossing separately stored child boundaries until reaching inline content.
	 * @param index - Logical index in the active field.
	 * @param location - Optional location already resolved in that field's child array.
	 * @param reuse - Exited adapter that is no longer retained by a boundary frame and may be reset for a sibling.
	 * @param reuseFrame - Popped frame for this same owning field, available for reuse at the first crossed boundary.
	 */
	private enterNodeAt(
		index: number,
		location?: ReturnType<typeof locateNodeInChunks>,
		reuse?: ChunkLocalCursor,
		reuseFrame?: ChunkCursorFrame,
	): void {
		assert(this.mode === CursorLocationType.Fields, "Expected a field");
		let localIndex = index;
		let selectedLocation = location;
		let reusableFrame = reuseFrame;
		for (;;) {
			const chunks = this.local.getFieldChunks?.();
			if (chunks === undefined) {
				this.inline.enterNode(localIndex);
				return;
			}
			const { chunk, indexOfChunk, indexWithinChunk } = this.prepareChunk(
				chunks,
				localIndex,
				selectedLocation,
			);
			selectedLocation = undefined;
			const start = localIndex - indexWithinChunk;
			const transparent = this.local.atChunkRoot();
			if (reusableFrame === undefined) {
				this.parentStack.push({
					cursor: this.local,
					chunks,
					indexOfChunk,
					start,
					parentOffset: this.offset,
					parentAtRoot: this.atRoot,
					parentLength: this.rootLength,
				});
			} else {
				reusableFrame.indexOfChunk = indexOfChunk;
				reusableFrame.start = start;
				this.parentStack.push(reusableFrame);
				reusableFrame = undefined;
			}
			this.offset = start + (transparent ? this.offset : 0);
			this.atRoot = transparent && this.atRoot;
			this.local = this.cursorForChunk(chunk, reuse);
			this.rootLength = chunk.topLevelLength;
			localIndex = indexWithinChunk;
		}
	}

	/**
	 * Pops one physical boundary and restores its suspended field adapter and logical coordinates.
	 * Requires a nonempty parent stack. Returns the frame so seeking or normalization can locate the exited child.
	 */
	protected restoreParent(): ChunkCursorFrame {
		const frame = this.parentStack.pop() ?? oob();
		this.local = frame.cursor;
		this.offset = frame.parentOffset;
		this.atRoot = frame.parentAtRoot;
		this.rootLength = frame.parentLength;
		return frame;
	}

	public exitNode(): void {
		const inline = this.inline;
		assert(inline.mode === CursorLocationType.Nodes, "Expected a node");
		if (!inline.atChunkRoot() || this.parentStack.length === 0) {
			inline.exitNode();
			return;
		}
		do {
			this.restoreParent();
		} while (this.local.atChunkRoot() && this.parentStack.length > 0);
	}

	public nextNode(): boolean {
		return this.seekNodes(1);
	}

	public seekNodes(offset: number): boolean {
		const inline = this.inline;
		assert(inline.mode === CursorLocationType.Nodes, "Expected a node");
		if (!inline.atChunkRoot()) {
			return inline.seekNodes(offset);
		}
		let index = inline.fieldIndex + offset;
		if (index >= 0 && index < this.rootLength) {
			return inline.seekNodes(offset);
		}
		// Only the exited adapter can be reused: ancestor adapters remain suspended in the stack.
		inline.exitNode();
		while (this.parentStack.length > 0) {
			const frame = this.restoreParent();
			const fieldIndex = frame.start + index;
			let slot = frame.indexOfChunk;
			while (index < 0 && slot > 0) {
				slot--;
				index += (frame.chunks[slot] ?? oob()).topLevelLength;
			}
			while (index >= 0 && slot < frame.chunks.length) {
				const chunk = frame.chunks[slot] ?? oob();
				const length = chunk.topLevelLength;
				if (index < length) {
					this.enterNodeAt(
						fieldIndex,
						{ chunk, indexOfChunk: slot, indexWithinChunk: index },
						inline,
						frame,
					);
					return true;
				}
				index -= length;
				slot++;
			}
			index = fieldIndex;
			if (!this.local.atChunkRoot()) {
				break;
			}
		}
		return false;
	}

	/**
	 * Composes logical parent paths only when requested; ordinary navigation retains physical frames.
	 * @privateRemarks
	 * Each request walks the chunk-boundary depth, in addition to the adapters' work constructing inline paths.
	 * Repeated path or anchor creation could amortize this by caching a prefix, possibly reusing anchor paths.
	 * Such a cache would need to be adjusted or invalidated when navigation moves above its saved depth.
	 */
	private pathPrefix(prefix?: PathRootPrefix): PathRootPrefix | undefined {
		let result = prefix;
		for (const frame of this.parentStack) {
			const field = frame.cursor.getFieldPath(result);
			result = {
				parent: field.parent,
				rootFieldOverride: field.field,
				indexOffset:
					frame.start + (frame.cursor.atChunkRoot() ? (result?.indexOffset ?? 0) : 0),
			};
		}
		return result;
	}

	public getPath(prefix?: PathRootPrefix): UpPath {
		return this.inline.getPath(this.pathPrefix(prefix)) ?? fail("Expected a node path");
	}

	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return this.local.getFieldPath(this.pathPrefix(prefix));
	}
}

/**
 * Read cursor over the shared traversal. Forks copy navigation state without adding counted references.
 */
export class ChunkCursor extends ChunkTraversal implements ChunkedCursor {
	/** Creates a read cursor at a chunk's root field, borrowing its storage without adding a reference. */
	public static fromChunk(chunk: TreeChunk): ChunkCursor {
		return new ChunkCursor(ChunkTraversal.localCursor(chunk));
	}

	/**
	 * Creates a read cursor at a field backed by a borrowed array of chunks.
	 * @param chunks - Field contents, kept alive by the caller for the cursor's lifetime.
	 * @param key - Root field key reported by the cursor and its paths.
	 */
	public static fromChunks(
		chunks: readonly TreeChunk[],
		key: FieldKey = dummyRoot,
	): ChunkCursor {
		return new ChunkCursor(new ChunkSequenceCursor(chunks, key));
	}

	public fork(): ChunkCursor {
		const cursor = ChunkCursor.fromChunks([]);
		this.copyTo(cursor);
		return cursor;
	}
}

/**
 * Local adapter for a sequence: its nodes are all stored in child chunks.
 */
export class ChunkSequenceCursor implements ChunkLocalCursor {
	public readonly mode = CursorLocationType.Fields;
	/** Creates an adapter that exposes the supplied chunk sequence as its root field. */
	public constructor(
		/** Borrowed field contents; the adapter owns no counted references. */
		private readonly chunks: readonly TreeChunk[],
		/** Field key used for the adapter's root field and its paths. */
		private readonly key: FieldKey = dummyRoot,
	) {}
	public getFieldChunks(): readonly TreeChunk[] {
		return this.chunks;
	}
	public getFieldLength(): number {
		return getFieldLength(this.chunks);
	}
	public getFieldKey(): FieldKey {
		return this.key;
	}
	public atChunkRoot(): boolean {
		return true;
	}
	public fork(): ChunkSequenceCursor {
		return new ChunkSequenceCursor(this.chunks, this.key);
	}
	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return { parent: prefix?.parent, field: prefix?.rootFieldOverride ?? this.key };
	}
}
