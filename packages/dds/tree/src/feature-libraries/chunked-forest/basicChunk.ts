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
import { ReferenceCountedBase } from "../../util/index.js";
import { prefixFieldPath, prefixPath } from "../treeCursorUtils.js";

import {
	ChunkCursor,
	type CompositeChunk,
	type ChunkLocalCursor,
	type ChunkInlineCursor,
} from "./chunkCursor.js";
import { type ChunkEditCursor, type EditableChunk, getFieldLength } from "./chunkEditing.js";

/**
 * General purpose one node chunk.
 */
export class BasicChunk extends ReferenceCountedBase implements EditableChunk, CompositeChunk {
	public readonly topLevelLength: number = 1;

	/**
	 * Create a tree chunk with ref count 1.
	 * Caller must have already accounted for references via `fields` to the children in the fields map (via `referenceAdded`).
	 */
	public constructor(
		public type: TreeNodeSchemaIdentifier,
		/**
		 * Fields of this node.
		 * @remarks
		 * This object has exclusive deep ownership of this map (which might mutate it in the future).
		 * Any code editing this map must update child reference counts.
		 * Like with MapTree, fields with no nodes must be removed from the map.
		 */
		public fields: Map<FieldKey, TreeChunk[]>,
		/** The value on this node, if any. */
		public value?: TreeValue,
	) {
		super();
	}

	public clone(): BasicChunk {
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
		return ChunkCursor.fromChunk(this);
	}

	public getLocalCursor(reuse?: ChunkLocalCursor): BasicChunkLocalCursor {
		if (reuse instanceof BasicChunkLocalCursor) {
			reuse.reset(this);
			return reuse;
		}
		return new BasicChunkLocalCursor(this);
	}

	public getEditCursor(): BasicChunkLocalCursor {
		assert(!this.isShared(), "Editing requires exclusive chunk ownership");
		return this.getLocalCursor();
	}

	protected onUnreferenced(): void {
		for (const children of this.fields.values()) {
			for (const child of children) {
				child.referenceRemoved();
			}
		}
	}
}

/**
 * Local navigation over one node and its field keys; child nodes belong to separate chunks.
 */
export class BasicChunkLocalCursor implements ChunkInlineCursor, ChunkEditCursor {
	/** Local position: 0 is the synthetic root field, 1 is the chunk's node, and 2 is a field owned by that node. */
	private depth = 0;
	/** Field enumeration snapshot, or the single key selected by enterField; empty outside owned-field mode. */
	private keys: readonly FieldKey[] = [];
	/** Position of the selected field in keys, valid only at depth 2. */
	private keyIndex = 0;

	/**
	 * Starts at the synthetic field containing the supplied node.
	 * Reading borrows its storage; edits additionally require the caller to keep the chunk exclusively owned.
	 */
	public constructor(
		/** Borrowed node storage, replaced only when the exited adapter is reused. */
		private chunk: BasicChunk,
	) {}

	/** Reuses a local adapter after its previous chunk has been exited. */
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
	/**
	 * Returns the borrowed BasicChunk while the adapter is positioned on its node.
	 */
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

	public getFieldChunks(): TreeChunk[] | undefined {
		assert(this.mode === CursorLocationType.Fields, "Expected a field");
		return this.depth === 0 ? undefined : (this.chunk.fields.get(this.getFieldKey()) ?? []);
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
		if (++this.keyIndex < this.keys.length) {
			return true;
		}
		this.exitField();
		return false;
	}

	public exitField(): void {
		assert(this.depth === 2, "Expected an owned field");
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
		const cursor = new BasicChunkLocalCursor(this.chunk);
		cursor.depth = this.depth;
		// Navigation replaces key arrays rather than modifying them, so forks can share the enumeration snapshot.
		cursor.keys = this.keys;
		cursor.keyIndex = this.keyIndex;
		return cursor;
	}

	public setFieldChunks(chunks: TreeChunk[]): void {
		assert(this.depth === 2, "Expected a field owned by the node");
		assert(!this.chunk.isShared(), "Editing requires exclusive chunk ownership");
		if (chunks.length === 0) {
			this.chunk.fields.delete(this.getFieldKey());
		} else {
			this.chunk.fields.set(this.getFieldKey(), chunks);
		}
	}
}
