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
import { getChunkSequence } from "./chunkSequence.js";

/**
 * Field navigation within one {@link TreeChunk}, used by {@link ChunkTraversal}.
 *
 * @remarks
 * This is not a complete {@link ChunkedCursor}.
 * {@link ChunkInlineCursor} extends this contract with navigation over nodes stored within the chunk.
 * {@link ChunkCursor} composes these adapters into a complete {@link ChunkedCursor} over the logical tree.
 * Like {@link ChunkedCursor}, local cursors do not own counted references to chunks.
 *
 * When {@link ChunkLocalCursor.getFieldChunks} returns an array, {@link ChunkTraversal} enters those child chunks.
 * Otherwise the adapter must implement {@link ChunkInlineCursor} to enter nodes stored inline.
 * {@link ChunkSequenceCursor} exposes its root field, so crossing that boundary adds no tree depth.
 *
 * A {@link ChunkedCursor} can also implement this contract by providing {@link ChunkLocalCursor.rootLength}
 * and ensuring that its forks implement the same contract.
 */
export interface ChunkLocalCursor
	extends Pick<
		ChunkedCursor,
		"mode" | "atChunkRoot" | "getFieldKey" | "getFieldLength" | "getFieldPath"
	> {
	/**
	 * Number of nodes in this adapter's root field, independent of its current position.
	 * @remarks
	 * Remains fixed while the adapter navigates or edits its storage.
	 */
	readonly rootLength: number;
	/**
	 * Returns the current field's borrowed {@link TreeChunk} array, or undefined for inline content.
	 * @remarks
	 * Requires {@link CursorLocationType.Fields} mode.
	 * Navigation must not mutate the array or change chunk reference counts.
	 */
	getFieldChunks?(): readonly TreeChunk[] | undefined;
	/**
	 * Clones the cursor to produce a new independent cursor.
	 * @remarks
	 * Does not add any counted references to any chunks.
	 * The clone preserves {@link ChunkLocalCursor.rootLength} as well as the current position.
	 */
	fork(): ChunkLocalCursor;
}

/**
 * Extends {@link ChunkLocalCursor} with the node and field navigation needed for inline content.
 *
 * @remarks
 * Unlike {@link ChunkedCursor}, this adapter leaves navigation across child chunk boundaries to {@link ChunkTraversal}.
 *
 * The omitted members are supplied by {@link ChunkLocalCursor},
 * by {@link SynchronousCursor} for cursor identification and pending-state handling,
 * or by {@link ChunkTraversal.firstNode} and {@link ChunkTraversal.nextNode},
 * unless the adapter supplies specialized inline implementations.
 */
export interface ChunkInlineCursor
	extends ChunkLocalCursor,
		Omit<
			ChunkedCursor,
			keyof ChunkLocalCursor | keyof SynchronousCursor | "firstNode" | "nextNode"
		> {
	/**
	 * Optional specialized entry into the first node of an inline field.
	 * @remarks
	 * Follows {@link ChunkedCursor.firstNode}.
	 * {@link ChunkTraversal} handles fields exposed by {@link ChunkLocalCursor.getFieldChunks} instead.
	 */
	firstNode?(): boolean;
	/**
	 * Optional specialized step to the next sibling within this chunk.
	 * @remarks
	 * Follows {@link ChunkedCursor.nextNode}, exiting to the field when no node remains.
	 */
	nextNode?(): boolean;
}

/**
 * A {@link TreeChunk} that exposes a {@link ChunkLocalCursor} for traversal across child chunks.
 * @remarks
 * The local cursor leaves navigation into separately stored children to {@link ChunkTraversal},
 * rather than composing complete {@link ChunkedCursor} instances.
 */
export interface CompositeChunk extends TreeChunk {
	/**
	 * Creates a local cursor at this chunk's root field.
	 * @remarks
	 * Does not add any counted references, whether it reuses an adapter or creates a new one.
	 * As with {@link TreeChunk.cursor}, the caller must keep the chunk alive while using the cursor.
	 * @param reuse - Optional exited adapter that the implementation may reset instead of allocating.
	 * The caller relinquishes this adapter's navigation state and must not use it after this call.
	 */
	getLocalCursor(reuse?: ChunkLocalCursor): ChunkLocalCursor;
}

/**
 * A suspended owning field.
 * @remarks
 * Records the suspended {@link ChunkLocalCursor}'s traversal state and the chunk entered from its current field.
 */
interface ChunkCursorFrame {
	/** Suspended adapter in {@link CursorLocationType.Fields} mode at the field containing {@link ChunkCursorFrame.chunks}. */
	readonly cursor: ChunkLocalCursor;
	/** Borrowed chunk array of the suspended field. */
	readonly chunks: readonly TreeChunk[];
	/** Index into {@link ChunkCursorFrame.chunks} of the chunk entered from this field. */
	indexOfChunk: number;
	/** Node index within the suspended field of the selected chunk's first node, not an index into the chunk array. */
	chunkStartIndex: number;
	/** Value of {@link ChunkTraversal.offset} when {@link ChunkCursorFrame.cursor} was suspended. */
	readonly savedOffset: number;
	/** Value of {@link ChunkTraversal.atRoot} when {@link ChunkCursorFrame.cursor} was suspended. */
	readonly savedAtRoot: boolean;
}

/**
 * Editing policy used by {@link ChunkCursor} before entering separately owned child storage.
 * @remarks
 * The owning {@link ChunkLocalCursor} remains active during {@link ChunkNavigationHooks.prepareChunk}.
 * Preparation completes before {@link ChunkNavigationHooks.cursorForChunk} creates the child's adapter.
 */
export interface ChunkNavigationHooks {
	/**
	 * Makes the selected child safe to enter and returns its updated owning-array location.
	 * @remarks
	 * Can replace shared or unsupported storage before the traversal obtains the child's adapter.
	 * @param chunks - Child array exposed by the active owning field.
	 * @param index - Logical node index across that field's chunks.
	 * @param location - Optional result of {@link locateNodeInChunks}, already resolved by sibling navigation.
	 */
	prepareChunk(
		chunks: readonly TreeChunk[],
		index: number,
		location?: ReturnType<typeof locateNodeInChunks>,
	): ReturnType<typeof locateNodeInChunks>;
	/** Creates a {@link ChunkLocalCursor} at the root field of the child prepared by {@link ChunkNavigationHooks.prepareChunk}. */
	cursorForChunk(chunk: TreeChunk): ChunkLocalCursor;
	/** Releases editing scopes when a chunk is exited or navigation is freed. */
	releaseChunk?(cursor: ChunkLocalCursor): void;
}

/**
 * Composes {@link ChunkLocalCursor} navigation into traversal over the complete tree.
 *
 * @remarks
 * Uses one active adapter and a stack of {@link ChunkCursorFrame}s for suspended fields.
 * The traversal state owns no counted references to chunks.
 * {@link ChunkSequenceCursor} boundaries contribute offsets, but not nodes, to tree paths.
 * Editors compose a cursor with {@link ChunkNavigationHooks} rather than inheriting navigation.
 */
export abstract class ChunkTraversal
	extends SynchronousCursor
	implements Omit<ChunkedCursor, "fork">
{
	/** Suspended fields from root to leaf, including {@link ChunkSequenceCursor} boundaries that add no tree depth. */
	protected readonly parentStack: ChunkCursorFrame[] = [];
	/** Offset of the active chunk's root nodes in their logical field, including all enclosing sequences. */
	protected offset = 0;
	/** Whether the active chunk's root field is also the traversal's root field. */
	protected atRoot = true;
	/**
	 * Active {@link ChunkLocalCursor}; undefined after {@link ChunkTraversal.clearTraversal}.
	 * @remarks
	 * Its root field and paths are relative to the active chunk, not the traversal's original root.
	 * Inline ancestors remain in this adapter's state; separately stored ancestors are retained in {@link ChunkTraversal.parentStack}.
	 */
	private current: ChunkLocalCursor | undefined;
	/** Active adapter as a {@link ChunkInlineCursor}, if it supports node navigation. */
	private currentInline: ChunkInlineCursor | undefined;

	/**
	 * Starts traversal at the root field exposed by a {@link ChunkLocalCursor}.
	 * @param local - Adapter positioned at its chunk's root field. The traversal takes control of its navigation state.
	 * @param navigationHooks - Optional {@link ChunkNavigationHooks} for editing. Omit for read-only navigation.
	 */
	public constructor(
		local: ChunkLocalCursor,
		private readonly navigationHooks?: ChunkNavigationHooks,
	) {
		super();
		this.local = local;
	}

	/** Active adapter, rejecting access after navigation state has been released. */
	protected get local(): ChunkLocalCursor {
		return this.current ?? fail("Cursor has been freed");
	}
	protected set local(cursor: ChunkLocalCursor) {
		this.current = cursor;
		this.currentInline = "enterNode" in cursor ? (cursor as ChunkInlineCursor) : undefined;
	}

	/** Active {@link ChunkInlineCursor}; requires an adapter that supports node navigation. */
	private get inline(): ChunkInlineCursor {
		return this.currentInline ?? this.failInline();
	}

	/**
	 * Whether the active adapter can expose fields backed by separate child chunks.
	 * @remarks
	 * Such adapters must use {@link ChunkTraversal} to inspect the current field before entering a node,
	 * rather than taking an inline-only fast path.
	 */
	get #localCursorExposesChunkFields(): boolean {
		// Check for getFieldChunks, not its result: an adapter can expose child chunks in some fields but store others inline.
		return this.local.getFieldChunks !== undefined;
	}

	/** Reports why the active adapter cannot provide {@link ChunkInlineCursor} navigation. */
	private failInline(): never {
		// Keep invalid-state handling out of the frequently inlined accessor.
		if (this.current === undefined) {
			fail("Cursor has been freed");
		}
		return fail("Expected an inline-node adapter");
	}

	/** Discards all adapters and boundary frames. */
	protected clearTraversal(): void {
		if (this.navigationHooks !== undefined && this.current !== undefined) {
			while (this.parentStack.length > 0) {
				this.restoreParent();
			}
			this.navigationHooks.releaseChunk?.(this.local);
		}
		this.current = undefined;
		this.currentInline = undefined;
		this.parentStack.length = 0;
	}

	/**
	 * Obtains a {@link ChunkLocalCursor} at a {@link TreeChunk}'s root field.
	 * @remarks
	 * Supports both {@link CompositeChunk.getLocalCursor} and {@link TreeChunk.cursor}.
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
		// Complete format-local cursors can also implement the local contract.
		// Their forks must retain the root-length metadata, just like other local adapters.
		if ("rootLength" in cursor && typeof cursor.rootLength === "number") {
			return cursor as ChunkedCursor & ChunkLocalCursor;
		}
		return new CompleteChunkCursorAdapter(cursor, chunk.topLevelLength);
	}

	/** Replaces navigation state with the supplied adapter positioned at its root field. */
	protected reset(local: ChunkLocalCursor): void {
		this.parentStack.length = 0;
		this.local = local;
		this.offset = 0;
		this.atRoot = true;
	}

	/**
	 * Copies navigation state so the target traverses the same storage independently.
	 * @param target - Traversal with no suspended frames in {@link ChunkTraversal.parentStack}.
	 */
	protected copyTo(target: ChunkTraversal): void {
		assert(this.navigationHooks === undefined, "Editing navigation must not be forked");
		target.local = this.local.fork();
		// Read navigation does not mutate the child arrays. Copy mutable frame positions and adapter state,
		// but keep references to the same content arrays rather than copying the stored tree.
		for (const frame of this.parentStack) {
			target.parentStack.push({ ...frame, cursor: frame.cursor.fork() });
		}
		target.offset = this.offset;
		target.atRoot = this.atRoot;
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
		const inline = this.currentInline;
		if (!this.#localCursorExposesChunkFields && inline?.firstNode !== undefined) {
			return inline.firstNode();
		}
		if (this.getFieldLength() === 0) {
			return false;
		}
		this.enterNode(0);
		return true;
	}

	/**
	 * Creates a {@link ChunkLocalCursor} at the selected child chunk's root field.
	 * Editing calls this after {@link ChunkNavigationHooks.prepareChunk} resolves ownership.
	 * Editing hooks obtain the child's editing adapter instead of reusing a read adapter.
	 * @param chunk - Selected child whose storage is borrowed.
	 * @param reuse - Exited adapter offered for reuse under {@link CompositeChunk.getLocalCursor}'s contract.
	 */
	protected cursorForChunk(chunk: TreeChunk, reuse?: ChunkLocalCursor): ChunkLocalCursor {
		return this.navigationHooks === undefined
			? ChunkTraversal.localCursor(chunk, reuse)
			: this.navigationHooks.cursorForChunk(chunk);
	}

	public enterNode(index: number): void {
		if (this.#localCursorExposesChunkFields) {
			this.enterNodeAt(index);
		} else {
			// Entirely inline storage already validates and navigates its own fields.
			this.inline.enterNode(index);
		}
	}

	/**
	 * Enters a node, crossing separately stored child boundaries until reaching inline content.
	 * @param index - Node index in the active field, across all of its chunks.
	 * @param location - Optional location already resolved in that field's child array.
	 * @param reuse - Exited adapter that is no longer retained by a boundary frame and may be reset for a sibling.
	 * @param reuseFrame - Popped {@link ChunkCursorFrame} for the same owning field, available for reuse at the first crossed boundary.
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
			// A sibling seek already retains this field's owning array.
			const chunks = reusableFrame?.chunks ?? this.local.getFieldChunks?.();
			if (chunks === undefined) {
				this.inline.enterNode(localIndex);
				return;
			}
			const { chunk, indexOfChunk, indexWithinChunk } =
				this.navigationHooks === undefined
					? (selectedLocation ?? locateNodeInChunks(chunks, localIndex))
					: this.navigationHooks.prepareChunk(chunks, localIndex, selectedLocation);
			selectedLocation = undefined;
			const chunkStartIndex = localIndex - indexWithinChunk;
			const transparent = this.local.atChunkRoot();
			if (reusableFrame === undefined) {
				this.parentStack.push({
					cursor: this.local,
					chunks,
					indexOfChunk,
					chunkStartIndex,
					savedOffset: this.offset,
					savedAtRoot: this.atRoot,
				});
			} else {
				reusableFrame.indexOfChunk = indexOfChunk;
				reusableFrame.chunkStartIndex = chunkStartIndex;
				this.parentStack.push(reusableFrame);
				reusableFrame = undefined;
			}
			this.offset = chunkStartIndex + (transparent ? this.offset : 0);
			this.atRoot = transparent && this.atRoot;
			this.local = this.cursorForChunk(chunk, reuse);
			localIndex = indexWithinChunk;
		}
	}

	/**
	 * Pops a frame and restores its suspended cursor and saved traversal state.
	 * @remarks
	 * Requires a nonempty {@link ChunkTraversal.parentStack}.
	 * @returns The popped {@link ChunkCursorFrame}, identifying the chunk that was exited.
	 */
	protected restoreParent(): ChunkCursorFrame {
		this.navigationHooks?.releaseChunk?.(this.local);
		const frame = this.parentStack.pop() ?? oob();
		this.local = frame.cursor;
		this.offset = frame.savedOffset;
		this.atRoot = frame.savedAtRoot;
		return frame;
	}

	public exitNode(): void {
		const inline = this.inline;
		if (!inline.atChunkRoot() || this.parentStack.length === 0) {
			inline.exitNode();
			return;
		}
		assert(inline.mode === CursorLocationType.Nodes, "Expected a node");
		do {
			this.restoreParent();
		} while (this.local.atChunkRoot() && this.parentStack.length > 0);
	}

	public nextNode(): boolean {
		const inline = this.inline;
		if (inline.nextNode !== undefined) {
			if (!inline.atChunkRoot() || this.parentStack.length === 0) {
				return inline.nextNode();
			}
			// A failed forward step is exactly one past the chunk's last root node.
			return inline.nextNode() || this.seekAcrossChunks(inline.rootLength, inline);
		}
		return this.seekNodes(1);
	}

	public seekNodes(offset: number): boolean {
		const inline = this.inline;
		if (!inline.atChunkRoot()) {
			return inline.seekNodes(offset);
		}
		const index = inline.fieldIndex + offset;
		if (index >= 0 && index < inline.rootLength) {
			return inline.seekNodes(offset);
		}
		// Only the exited adapter can be reused: ancestor adapters remain suspended in the stack.
		inline.exitNode();
		return this.seekAcrossChunks(index, inline);
	}

	/** Continues a seek after the active adapter has exited its root sequence. */
	private seekAcrossChunks(localIndex: number, exited: ChunkInlineCursor): boolean {
		let index = localIndex;
		while (this.parentStack.length > 0) {
			const frame = this.restoreParent();
			const fieldIndex = frame.chunkStartIndex + index;
			const owner =
				index < -1 || index > exited.rootLength ? getChunkSequence(frame.chunks) : undefined;
			if (owner !== undefined) {
				if (fieldIndex >= 0 && fieldIndex < owner.length) {
					this.enterNodeAt(
						fieldIndex,
						locateNodeInChunks(frame.chunks, fieldIndex),
						exited,
						frame,
					);
					return true;
				}
				index = fieldIndex;
				if (!this.local.atChunkRoot()) {
					break;
				}
				continue;
			}
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
						exited,
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
	 * Computes a {@link PathRootPrefix} for paths reported by the active {@link ChunkLocalCursor}.
	 * @remarks
	 * Includes the suspended fields in {@link ChunkTraversal.parentStack} and any caller-supplied prefix.
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
					frame.chunkStartIndex +
					(frame.cursor.atChunkRoot() ? (result?.indexOffset ?? 0) : 0),
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
 * A {@link ChunkedCursor} that uses {@link ChunkTraversal} to navigate across chunk boundaries.
 * @remarks
 * Read-only {@link ChunkCursor.fork | forks} copy navigation state without adding counted references.
 * Cursors configured with {@link ChunkNavigationHooks} cannot fork, because a fork could bypass editing ownership guarantees.
 */
export class ChunkCursor extends ChunkTraversal implements ChunkedCursor {
	/** Borrows the active {@link ChunkLocalCursor} for an editor's format-specific operations. */
	public get localAdapter(): ChunkLocalCursor {
		return this.local;
	}

	/**
	 * Tests whether the selected field belongs directly to the editor's original root node.
	 * @remarks
	 * Requires fields mode and an editor rooted at a single node whose children are stored in separate chunks.
	 * Uses the suspended-boundary state without exposing {@link ChunkCursorFrame}s to the editor.
	 */
	public isRootField(key: FieldKey): boolean {
		return this.parentStack.length === 0 && this.local.getFieldKey() === key;
	}

	/**
	 * Restores the field owning the active chunk before an editor replaces that chunk.
	 * @remarks
	 * Requires a suspended owning field; delegates to {@link ChunkTraversal.restoreParent}.
	 * @returns The exited chunk's starting node index in the restored field, not its physical chunk-array index.
	 */
	public restoreOwningField(): number {
		assert(this.parentStack.length > 0, "Root chunk must support field edits");
		return this.restoreParent().chunkStartIndex;
	}

	/**
	 * Releases borrowed adapters and frames through {@link ChunkTraversal.clearTraversal}.
	 * @remarks
	 * Does not change content reference counts.
	 */
	public releaseNavigation(): void {
		this.clearTraversal();
	}

	/**
	 * Creates a read cursor at a chunk's root field.
	 * @remarks
	 * Borrows the chunk without adding a counted reference.
	 * The caller must keep the chunk alive while using the cursor.
	 */
	public static fromChunk(chunk: TreeChunk): ChunkCursor {
		return new ChunkCursor(ChunkTraversal.localCursor(chunk));
	}

	/**
	 * Creates a read cursor at a field backed by a borrowed {@link TreeChunk} array.
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
 * A {@link ChunkLocalCursor} for a field whose nodes are all stored in child {@link TreeChunk}s.
 * @remarks
 * Remains in {@link CursorLocationType.Fields} mode.
 * {@link ChunkTraversal} enters the chunks returned by {@link ChunkSequenceCursor.getFieldChunks}.
 */
export class ChunkSequenceCursor implements ChunkLocalCursor {
	public readonly mode = CursorLocationType.Fields;
	/**
	 * Creates an adapter that exposes the supplied chunk sequence as its root field.
	 * @param chunks - Borrowed field contents. The caller must keep these chunks alive while using the adapter.
	 * @param key - Root field key reported by the adapter and its paths.
	 * @param rootLength - Sum of {@link TreeChunk.topLevelLength} over `chunks`.
	 * Supply an already known length to avoid scanning the array.
	 */
	public constructor(
		/** Borrowed field contents; the adapter owns no counted references. */
		private readonly chunks: readonly TreeChunk[],
		/** Field key used for the adapter's root field and its paths. */
		private readonly key: FieldKey = dummyRoot,
		public readonly rootLength: number = getFieldLength(chunks),
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
		return new ChunkSequenceCursor(this.chunks, this.key, this.rootLength);
	}
	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return { parent: prefix?.parent, field: prefix?.rootFieldOverride ?? this.key };
	}
}

/**
 * Adapts a {@link ChunkedCursor} to {@link ChunkInlineCursor} by retaining its root-field length.
 * @remarks
 * Used by {@link ChunkTraversal.localCursor} when the complete cursor does not implement {@link ChunkLocalCursor}.
 */
class CompleteChunkCursorAdapter implements ChunkInlineCursor {
	public constructor(
		private readonly cursor: ChunkedCursor,
		public readonly rootLength: number,
	) {}

	public get mode(): CursorLocationType {
		return this.cursor.mode;
	}
	public get value(): Value {
		return this.cursor.value;
	}
	public get type(): TreeType {
		return this.cursor.type;
	}
	public get [cursorChunk](): TreeChunk | undefined {
		return this.cursor[cursorChunk];
	}
	public get fieldIndex(): number {
		return this.cursor.fieldIndex;
	}
	public get chunkStart(): number {
		return this.cursor.chunkStart;
	}
	public get chunkLength(): number {
		return this.cursor.chunkLength;
	}
	public atChunkRoot(): boolean {
		return this.cursor.atChunkRoot();
	}
	public getFieldKey(): FieldKey {
		return this.cursor.getFieldKey();
	}
	public getFieldLength(): number {
		return this.cursor.getFieldLength();
	}
	public enterNode(index: number): void {
		this.cursor.enterNode(index);
	}
	public firstNode(): boolean {
		return this.cursor.firstNode();
	}
	public nextNode(): boolean {
		return this.cursor.nextNode();
	}
	public seekNodes(offset: number): boolean {
		return this.cursor.seekNodes(offset);
	}
	public exitNode(): void {
		this.cursor.exitNode();
	}
	public enterField(key: FieldKey): void {
		this.cursor.enterField(key);
	}
	public exitField(): void {
		this.cursor.exitField();
	}
	public firstField(): boolean {
		return this.cursor.firstField();
	}
	public nextField(): boolean {
		return this.cursor.nextField();
	}
	public getPath(prefix?: PathRootPrefix): UpPath | undefined {
		return this.cursor.getPath(prefix);
	}
	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return this.cursor.getFieldPath(prefix);
	}
	public fork(): CompleteChunkCursorAdapter {
		return new CompleteChunkCursorAdapter(this.cursor.fork(), this.rootLength);
	}
}
