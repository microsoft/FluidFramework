/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	cursorChunk,
	dummyRoot,
	type FieldKey,
	type FieldUpPath,
	type PathRootPrefix,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
	type TreeType,
	type TreeValue,
	type UpPath,
	type Value,
} from "../../core/index.js";
import { prefixFieldPath, prefixPath } from "../treeCursorUtils.js";

import {
	ChunkCursor,
	type CompositeChunk,
	type ChunkLocalCursor,
	type ChunkInlineCursor,
} from "./chunkCursor.js";
import { type ChunkEditCursor, type EditableChunk, getFieldLength } from "./chunkEditing.js";
import {
	type ChunkEdit,
	ChunkSequence,
	type ChunkSequenceEditor,
	MutableChunk,
} from "./chunkSequence.js";

/**
 * General purpose one node chunk.
 */
export class BasicChunk extends MutableChunk implements EditableChunk, CompositeChunk {
	public readonly topLevelLength: number = 1;
	private readonly fieldSequences = new Map<FieldKey, ChunkSequence>();
	private readonly fieldViews = new Map<FieldKey, readonly TreeChunk[]>();

	public override hasStableTopLevelLength(): boolean {
		return true;
	}

	public supportsRootEdits(): boolean {
		return false;
	}

	public get fields(): ReadonlyMap<FieldKey, readonly TreeChunk[]> {
		this.assertReadable();
		return this.fieldViews;
	}

	/**
	 * Create a tree chunk with ref count 1.
	 * Caller must have already accounted for references via `fields` to the children in the fields map (via `referenceAdded`).
	 */
	public constructor(
		public readonly type: TreeNodeSchemaIdentifier,
		/**
		 * Fields of this node.
		 * @remarks
		 * Containers are copied and their child references transferred to field owners.
		 * Editing requires authority obtained through the owning path.
		 * Fields with no nodes must be removed from the map.
		 */
		fields: ReadonlyMap<FieldKey, readonly TreeChunk[]>,
		/** The value on this node, if any. */
		public readonly value?: TreeValue,
	) {
		super();
		for (const [key, chunks] of fields) {
			const sequence = new ChunkSequence(chunks, this);
			this.fieldSequences.set(key, sequence);
			this.fieldViews.set(key, sequence.chunks);
		}
	}

	public acquireField(editor: ChunkEdit, key: FieldKey): ChunkSequenceEditor {
		editor.assertFor(this);
		let sequence = this.fieldSequences.get(key);
		if (sequence === undefined) {
			sequence = new ChunkSequence([], this);
			this.fieldSequences.set(key, sequence);
		}
		return sequence.acquireEditor(
			editor,
			() => {
				if (sequence.chunks.length === 0) {
					this.fieldSequences.delete(key);
					this.fieldViews.delete(key);
					sequence.dispose();
				}
			},
			(chunks) => {
				if (chunks.length === 0) {
					this.fieldViews.delete(key);
				} else {
					this.fieldViews.set(key, chunks);
				}
			},
		);
	}

	public takeField(editor: ChunkEdit, key: FieldKey): TreeChunk[] {
		const field = this.acquireField(editor, key);
		try {
			return field.splice(0, field.chunks.length);
		} finally {
			field.close();
		}
	}

	public createField(editor: ChunkEdit, key: FieldKey, chunks: readonly TreeChunk[]): void {
		editor.assertFor(this);
		assert(!this.fieldSequences.has(key), "Field already exists");
		const field = this.acquireField(editor, key);
		try {
			field.splice(0, 0, chunks);
		} finally {
			field.close();
		}
	}

	public clone(): BasicChunk {
		this.assertCloneable();
		const fields = new Map<FieldKey, TreeChunk[]>();
		for (const [key, children] of this.fields) {
			const field = children.map((child) => {
				child.referenceAdded();
				return child;
			});
			fields.set(key, field);
		}
		return new BasicChunk(this.type, fields, this.value);
	}

	public cursor(): ChunkCursor {
		this.assertReadable();
		return ChunkCursor.fromChunk(this);
	}

	public getLocalCursor(reuse?: ChunkLocalCursor): BasicChunkLocalCursor {
		this.assertReadable();
		if (reuse instanceof BasicChunkLocalCursor) {
			reuse.reset(this);
			return reuse;
		}
		return new BasicChunkLocalCursor(this);
	}

	public getEditCursor(edit?: ChunkEdit): BasicChunkLocalCursor {
		assert(!this.isShared(), "Editing requires exclusive chunk ownership");
		const scope = edit ?? this.acquireEditor();
		scope.assertFor(this);
		return new BasicChunkLocalCursor(this, scope);
	}

	protected onUnreferenced(): void {
		for (const sequence of this.fieldSequences.values()) {
			sequence.dispose();
		}
	}
}

/**
 * A {@link ChunkInlineCursor} for the single node stored in a {@link BasicChunk}.
 * @remarks
 * Navigates the node and its field keys.
 * {@link ChunkCursor} enters the child chunks exposed by {@link BasicChunkLocalCursor.getFieldChunks}.
 */
export class BasicChunkLocalCursor implements ChunkInlineCursor, ChunkEditCursor {
	public get rootLength(): number {
		return this.chunk.topLevelLength;
	}

	/** Local position: 0 is the synthetic root field, 1 is the chunk's node, and 2 is a field owned by that node. */
	private depth = 0;
	/** Field enumeration snapshot, or the single key selected by {@link BasicChunkLocalCursor.enterField}; empty outside the node's fields. */
	private keys: readonly FieldKey[] = [];
	/** Index of the selected field in {@link BasicChunkLocalCursor.keys}, valid only at depth 2. */
	private keyIndex = 0;
	private fieldEditor: ChunkSequenceEditor | undefined;

	/**
	 * Starts at the {@link dummyRoot} field containing the supplied {@link BasicChunk}'s node.
	 * @remarks
	 * The caller must keep the chunk alive while using the cursor.
	 * Edits additionally require the caller to keep the chunk exclusively owned.
	 */
	public constructor(
		/** Borrowed node storage, replaced only when the exited adapter is reused. */
		private chunk: BasicChunk,
		private readonly edit?: ChunkEdit,
	) {}

	/**
	 * Reuses this adapter to navigate another {@link BasicChunk}.
	 * @remarks
	 * Requires the adapter to be at its root field, with its previous node exited.
	 * @param chunk - Borrowed storage to navigate. The caller must keep it alive while using the cursor.
	 */
	public reset(chunk: BasicChunk): void {
		assert(this.depth === 0, "Only an exited adapter can be reused");
		this.chunk = chunk;
	}
	public get mode(): CursorLocationType {
		return this.depth === 1 ? CursorLocationType.Nodes : CursorLocationType.Fields;
	}
	public atChunkRoot(): boolean {
		return this.depth < 2;
	}
	public get [cursorChunk](): BasicChunk {
		assert(this.depth === 1, "Expected a node");
		return this.chunk;
	}
	public get value(): Value {
		assert(this.depth === 1, "Expected a node");
		return this.chunk.value;
	}
	public get type(): TreeType {
		assert(this.depth === 1, "Expected a node");
		return this.chunk.type;
	}
	public get fieldIndex(): number {
		assert(this.depth === 1, "Expected a node");
		return 0;
	}
	public get chunkStart(): number {
		return this.fieldIndex;
	}
	public readonly chunkLength = 1;

	public getFieldKey(): FieldKey {
		assert(this.mode === CursorLocationType.Fields, "Expected a field");
		return this.depth === 0 ? dummyRoot : (this.keys[this.keyIndex] ?? oob());
	}

	public getFieldChunks(): readonly TreeChunk[] | undefined {
		assert(this.mode === CursorLocationType.Fields, "Expected a field");
		if (this.edit !== undefined) {
			return this.getFieldEditor()?.chunks;
		}
		return this.depth === 0 ? undefined : (this.chunk.fields.get(this.getFieldKey()) ?? []);
	}

	public getFieldEditor(): ChunkSequenceEditor | undefined {
		assert(this.edit !== undefined, "An editing scope is required");
		this.edit.assertFor(this.chunk);
		assert(this.mode === CursorLocationType.Fields, "Expected a field");
		if (this.depth === 0) {
			return undefined;
		}
		this.fieldEditor ??= this.chunk.acquireField(this.edit, this.getFieldKey());
		return this.fieldEditor;
	}

	private releaseField(): void {
		this.fieldEditor?.close();
		this.fieldEditor = undefined;
	}

	public release(commit = true): void {
		this.releaseField();
		this.edit?.close(commit);
	}

	public getFieldLength(): number {
		return this.depth === 0 ? 1 : getFieldLength(this.getFieldChunks() ?? oob());
	}

	public enterNode(index: number): void {
		assert(this.depth === 0 && index === 0, "Only the root node is stored inline");
		this.depth = 1;
	}

	public seekNodes(offset: number): boolean {
		assert(this.depth === 1, "Expected a node");
		if (offset === 0) {
			return true;
		}
		this.exitNode();
		return false;
	}

	public exitNode(): void {
		assert(this.depth === 1, "Expected a node");
		this.depth = 0;
	}

	public enterField(key: FieldKey): void {
		assert(this.depth === 1, "Expected a node");
		// A one-key array uses the same state as field enumeration, trading an allocation on explicit entry
		// for a single representation shared by enterField, firstField, and nextField.
		this.keys = [key];
		this.keyIndex = 0;
		this.depth = 2;
	}

	public firstField(): boolean {
		assert(this.depth === 1, "Expected a node");
		if (this.chunk.fields.size === 0) {
			return false;
		}
		// TODO: Avoid this key copy if field enumeration and independently forked positions can be preserved.
		this.keys = [...this.chunk.fields.keys()];
		this.keyIndex = 0;
		this.depth = 2;
		return true;
	}

	public nextField(): boolean {
		assert(this.depth === 2, "Expected an owned field");
		this.releaseField();
		if (++this.keyIndex < this.keys.length) {
			return true;
		}
		this.exitField();
		return false;
	}

	public exitField(): void {
		assert(this.depth === 2, "Expected an owned field");
		this.releaseField();
		this.depth = 1;
		this.keys = [];
		this.keyIndex = 0;
	}

	public getPath(prefix?: PathRootPrefix): UpPath {
		assert(this.depth === 1, "Expected a node");
		return (
			prefixPath(prefix, { parent: undefined, parentField: dummyRoot, parentIndex: 0 }) ??
			fail("Expected a node path")
		);
	}

	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		assert(this.mode === CursorLocationType.Fields, "Expected a field");
		return prefixFieldPath(prefix, {
			field: this.getFieldKey(),
			parent:
				this.depth === 0
					? undefined
					: { parent: undefined, parentField: dummyRoot, parentIndex: 0 },
		});
	}

	public fork(): BasicChunkLocalCursor {
		assert(this.edit === undefined, "Editing navigation must not be forked");
		const cursor = new BasicChunkLocalCursor(this.chunk);
		cursor.depth = this.depth;
		// Navigation replaces key arrays rather than modifying them, so forks can share the enumeration snapshot.
		cursor.keys = this.keys;
		cursor.keyIndex = this.keyIndex;
		return cursor;
	}
}
