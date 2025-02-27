/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	type FieldKey,
	type FieldUpPath,
	type PathRootPrefix,
	type TreeNodeSchemaIdentifier,
	type TreeType,
	type TreeValue,
	type UpPath,
	type Value,
	type ChunkedCursor,
	type TreeChunk,
	cursorChunk,
	dummyRoot,
} from "../../core/index.js";
import { ReferenceCountedBase, fail } from "../../util/index.js";
import { SynchronousCursor, prefixPath } from "../treeCursorUtils.js";

/**
 * General purpose one node chunk.
 */
export class BasicChunk extends ReferenceCountedBase implements TreeChunk {
	public readonly topLevelLength: number = 1;

	/**
	 * Create a tree chunk with ref count 1.
	 *
	 * Caller must have already accounted for references via `fields` to the children in the fields map (via `referenceAdded`).
	 */
	public constructor(
		public type: TreeNodeSchemaIdentifier,
		/**
		 * Fields of this node.
		 * @remarks
		 * This object has exclusive deep ownership of this map (which might mutate it in the future).
		 * Any code editing this map must update child reference counts.
		 *
		 * Like with {@link MapTree}, fields with no nodes must be removed from the map.
		 */
		public fields: Map<FieldKey, TreeChunk[]>,
		/**
		 * The value on this node, if any.
		 */
		public value?: TreeValue,
	) {
		super();
	}

	public clone(): BasicChunk {
		const fields = new Map<FieldKey, TreeChunk[]>();
		for (const [k, v] of this.fields) {
			const field = v.map((child) => {
				child.referenceAdded();
				return child;
			});
			fields.set(k, field);
		}
		return new BasicChunk(this.type, fields, this.value);
	}

	public cursor(): ChunkedCursor {
		return new BasicChunkCursor([this], [], [], [], [], [dummyRoot], 0, 0, 0, undefined);
	}

	protected onUnreferenced(): void {
		for (const v of this.fields.values()) {
			for (const child of v) {
				child.referenceRemoved();
			}
		}
	}
}

export type SiblingsOrKey = readonly TreeChunk[] | readonly FieldKey[];

/**
 * Cursor over basic chunks.
 *
 * @remarks This implementation is similar to StackCursor, however it is distinct because:
 * 1. The children are chunks, which might have a top level length that greater than 1.
 * 2. It needs to be able to delegate to cursors of other chunk formats it does not natively understand (See TODO below).
 *
 * TODO:
 * This cursor currently only handles child chunks which are BasicChunks:
 * BasicChunks should be an optimized fast path, and arbitrary chunk formats,
 * like UniformChunk, should be supported by delegating to their cursor implementations.
 */
export class BasicChunkCursor extends SynchronousCursor implements ChunkedCursor {
	/**
	 * Starts at root field which might be a detached sequence.
	 *
	 * @param root - sequence of BasicChunk which make up the contents of the root sequence.
	 * Since this cursor starts in `Fields` mode at the root, the siblings array when in fields mode is just the field keys,
	 * this is needed to get the actual root nodes when entering nodes of the root field.
	 * @param siblingStack - Stack of collections of siblings along the path through the tree:
	 * does not include current level (which is stored in `siblings`).
	 * Even levels in the stack (starting from 0) are keys and odd levels are sequences of nodes.
	 * @param indexStack - Stack of indices into the corresponding levels in `siblingStack`.
	 * @param indexOfChunkStack - Index of chunk in array of chunks. Only for Node levels.
	 * @param indexWithinChunkStack - Index within chunk selected by indexOfChunkStack. Only for Node levels.
	 * @param siblings - Siblings at the current level (not included in `siblingStack`).
	 * @param index - Index into `siblings`.
	 * @param indexOfChunk - Index of chunk in array of chunks. Only for Nodes mode.
	 * @param indexWithinChunk - Index within chunk selected by indexOfChunkStack. Only for Nodes mode.
	 * @param nestedCursor - When the outer cursor (this `BasicChunkCursor` cursor)
	 * navigates into a chunk it does not natively understand (currently anything other than `BasicChunk`s)
	 * it creates the `nestedCursor` over that chunk, and delegates all operations to it.
	 */
	public constructor(
		protected root: readonly TreeChunk[],
		protected readonly siblingStack: SiblingsOrKey[],
		protected readonly indexStack: number[],
		protected readonly indexOfChunkStack: number[],
		// TODO: Currently only BasicChunks are supported, and the currently always have a top level length of 1.
		// That makes this stack unneeded. When BasicChunkCursor is more feature complete, this stack should be reevaluated, and removed if possible.
		protected readonly indexWithinChunkStack: number[],
		protected siblings: SiblingsOrKey,
		protected index: number,
		protected indexOfChunk: number,
		protected indexWithinChunk: number,
		protected nestedCursor: ChunkedCursor | undefined,
	) {
		super();
	}

	public get [cursorChunk](): TreeChunk | undefined {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor[cursorChunk];
		}
		assert(this.mode === CursorLocationType.Nodes, 0x57a /* must be in nodes mode */);
		return (this.siblings as TreeChunk[])[this.indexOfChunk];
	}

	public atChunkRoot(): boolean {
		return (
			this.siblingStack.length < 2 &&
			(this.nestedCursor === undefined || this.nestedCursor.atChunkRoot())
		);
	}

	public fork(): BasicChunkCursor {
		// Siblings arrays are not modified during navigation and do not need be be copied.
		// This allows this copy to be shallow, and `this.siblings` below to not be copied as all.
		return new BasicChunkCursor(
			this.root,
			[...this.siblingStack],
			[...this.indexStack],
			[...this.indexOfChunkStack],
			[...this.indexWithinChunkStack],
			this.siblings,
			this.index,
			this.indexOfChunk,
			this.indexWithinChunk,
			this.nestedCursor?.fork(),
		);
	}

	public get mode(): CursorLocationType {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.mode;
		}
		// Compute the number of nodes deep the current depth is.
		// We want the floor of the result, which can computed using a bitwise shift assuming the depth is less than 2^31, which seems safe.
		// eslint-disable-next-line no-bitwise
		const halfHeight = (this.siblingStack.length + 1) >> 1;
		assert(
			this.indexOfChunkStack.length === halfHeight,
			0x51c /* unexpected indexOfChunkStack */,
		);
		assert(
			this.indexWithinChunkStack.length === halfHeight,
			0x51d /* unexpected indexWithinChunkStack */,
		);
		return this.siblingStack.length % 2 === 0
			? CursorLocationType.Fields
			: CursorLocationType.Nodes;
	}

	public getFieldKey(): FieldKey {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.getFieldKey();
		}
		assert(this.mode === CursorLocationType.Fields, 0x51e /* must be in fields mode */);
		return this.siblings[this.index] as FieldKey;
	}

	private getStackedFieldKey(height: number): FieldKey {
		assert(height % 2 === 0, 0x51f /* must field height */);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.siblingStack[height]![this.indexStack[height]!] as FieldKey;
	}

	private getStackedNodeIndex(height: number): number {
		assert(height % 2 === 1, 0x520 /* must be node height */);
		assert(height >= 0, 0x521 /* must not be above root */);
		return this.indexStack[height] ?? oob();
	}

	private getStackedNode(height: number): BasicChunk {
		const index = this.getStackedNodeIndex(height);
		return (this.siblingStack[height] as readonly TreeChunk[])[index] as BasicChunk;
	}

	public getFieldLength(): number {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.getFieldLength();
		}
		assert(this.mode === CursorLocationType.Fields, 0x522 /* must be in fields mode */);
		let total = 0;
		// TODO: optimize?
		for (const chunk of this.getField()) {
			total += chunk.topLevelLength;
		}
		return total;
	}

	public enterNode(index: number): void {
		if (this.nestedCursor !== undefined) {
			this.nestedCursor.enterNode(index);
			return;
		}
		const found = this.firstNode() && this.seekNodes(index);
		assert(found, 0x523 /* child must exist at index */);
	}

	public getPath(prefix?: PathRootPrefix): UpPath {
		if (this.nestedCursor !== undefined) {
			return (
				this.nestedCursor.getPath(this.nestedPathPrefix(prefix)) ??
				fail(0xaee /* nested cursors should not be root */)
			);
		}
		assert(this.mode === CursorLocationType.Nodes, 0x524 /* must be in nodes mode */);
		const path = this.getOffsetPath(0, prefix);
		assert(path !== undefined, 0x55c /* field root cursor should never have undefined path */);
		return path;
	}

	private nestedPathPrefix(prefix?: PathRootPrefix): PathRootPrefix {
		// This uses index offset for actual node, when it should use offset for start of chunk.
		// To compensate, subtract this.indexWithinChunk below.
		const rootPath: UpPath =
			this.getOffsetPath(0, prefix) ?? fail(0xaef /* nested cursors should not be root */);
		return {
			indexOffset: rootPath.parentIndex - this.indexWithinChunk,
			rootFieldOverride: rootPath.parentField,
			parent: rootPath.parent,
		};
	}

	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.getFieldPath(this.nestedPathPrefix(prefix));
		}
		assert(this.mode === CursorLocationType.Fields, 0x525 /* must be in fields mode */);
		return {
			field:
				this.indexStack.length === 1
					? (prefix?.rootFieldOverride ?? this.getFieldKey())
					: this.getFieldKey(),
			parent: this.getOffsetPath(1, prefix),
		};
	}

	private getOffsetPath(
		offset: number,
		prefix: PathRootPrefix | undefined,
	): UpPath | undefined {
		// It is more efficient to handle prefix directly in here rather than delegating to PrefixedPath.

		const length = this.indexStack.length - offset;
		if (length === -1) {
			return prefix?.parent; // At root
		}

		assert(length > 0, 0x526 /* invalid offset to above root */);
		assert(length % 2 === 1, 0x527 /* offset path must point to node not field */);

		// Perf Note:
		// This is O(depth) in tree.
		// If many different anchors are created, this could be optimized to amortize the costs.
		// For example, the cursor could cache UpPaths from the anchorSet when creating an anchor,
		// then reuse them as a starting point when making another.
		// Could cache this at one depth, and remember the depth.
		// When navigating up, adjust cached anchor if present.

		let path: UpPath | undefined;
		function updatePath(newPath: UpPath): void {
			path = path === undefined ? prefixPath(prefix, newPath) : newPath;
		}

		// Skip top level, since root node in path is "undefined" and does not have a parent or index.
		for (let height = 1; height < length; height += 2) {
			const key = this.getStackedFieldKey(height - 1);
			updatePath({
				parent: path,
				parentIndex: this.getStackedNodeIndex(height),
				parentField: key,
			});
		}

		updatePath({
			parent: path,
			parentIndex: offset === 0 ? this.index : this.getStackedNodeIndex(length),
			parentField: this.getStackedFieldKey(length - 1),
		});
		return path;
	}

	public enterField(key: FieldKey): void {
		if (this.nestedCursor !== undefined) {
			this.nestedCursor.enterField(key);
			return;
		}
		assert(this.mode === CursorLocationType.Nodes, 0x528 /* must be in nodes mode */);
		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);

		// For fields, siblings are only used for key lookup and
		// nextField and which has arbitrary iteration order,
		// so making a array of just key here works.
		// This adds an allocation, so it's optimizing code simplicity and for the other use case (enumeration)
		// at the cost of an allocation here.
		this.index = 0;
		this.siblings = [key];
	}

	public nextField(): boolean {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.nextField();
		}
		this.index += 1;
		if (this.index === (this.siblings as []).length) {
			this.exitField();
			return false;
		}
		return true;
	}

	public firstField(): boolean {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.firstField();
		}
		const fields = this.getNode().fields;
		if (fields.size === 0) {
			return false;
		}

		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);
		this.index = 0;
		this.siblings = [...fields.keys()]; // TODO: avoid this copy
		return true;
	}

	public seekNodes(offset: number): boolean {
		if (this.nestedCursor !== undefined) {
			const atRoot = this.nestedCursor.atChunkRoot();
			const stillIn = this.nestedCursor.seekNodes(offset);
			if (!atRoot) {
				return stillIn;
			}
			if (!stillIn) {
				this.nestedCursor = undefined;
			}
		}
		assert(
			this.mode === CursorLocationType.Nodes,
			0x529 /* can only seekNodes when in Nodes */,
		);
		assert(this.indexOfChunk < this.siblings.length, 0x52a /* out of bounds indexOfChunk */);

		this.indexWithinChunk += offset;
		if (offset >= 0) {
			const chunks = (this.siblings as TreeChunk[]) ?? oob();
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			while (this.indexWithinChunk >= chunks[this.indexOfChunk]!.topLevelLength) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.indexWithinChunk -= chunks[this.indexOfChunk]!.topLevelLength;
				this.indexOfChunk++;
				if (this.indexOfChunk === chunks.length) {
					this.exitNode();
					return false;
				}
				assert(
					this.indexOfChunk < this.siblings.length,
					0x52b /* out of bounds indexOfChunk */,
				);
			}
		} else {
			const chunks = this.siblings as TreeChunk[];
			while (this.indexWithinChunk < 0) {
				if (this.indexOfChunk === 0) {
					this.exitNode();
					return false;
				}
				this.indexOfChunk--;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.indexWithinChunk += chunks[this.indexOfChunk]!.topLevelLength;
			}
		}

		this.index += offset;
		this.initNestedCursor();
		return true;
	}

	public firstNode(): boolean {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.firstNode();
		}
		const siblings = this.getField();
		if (siblings.length === 0) {
			return false;
		}
		this.siblingStack.push(this.siblings);
		this.indexStack.push(this.index);
		this.indexOfChunkStack.push(this.indexOfChunk);
		this.indexWithinChunkStack.push(this.indexWithinChunk);
		this.index = 0;
		this.siblings = siblings;
		this.indexOfChunk = 0;
		this.indexWithinChunk = 0;
		this.initNestedCursor();
		return true;
	}

	public nextNode(): boolean {
		if (this.nestedCursor !== undefined) {
			const atRoot = this.nestedCursor.atChunkRoot();
			const stillIn = this.nestedCursor.nextNode();
			if (!atRoot) {
				return stillIn;
			}
			if (!stillIn) {
				this.nestedCursor = undefined;
			}
		}
		assert(
			this.mode === CursorLocationType.Nodes,
			0x52c /* can only nextNode when in Nodes */,
		);
		this.indexWithinChunk++;
		if (
			this.indexWithinChunk ===
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			(this.siblings as TreeChunk[])[this.indexOfChunk]!.topLevelLength
		) {
			this.indexOfChunk++;
			if (this.indexOfChunk === (this.siblings as TreeChunk[]).length) {
				this.exitNode();
				return false;
			}
			this.indexWithinChunk = 0;
			this.initNestedCursor();
		}
		this.index++;
		return true;
	}

	private initNestedCursor(): void {
		assert(
			this.mode === CursorLocationType.Nodes,
			0x55d /* can only initNestedCursor when in Nodes */,
		);
		const chunk = (this.siblings as TreeChunk[])[this.indexOfChunk] ?? oob();
		this.nestedCursor = !(chunk instanceof BasicChunk) ? chunk.cursor() : undefined;
		this.nestedCursor?.enterNode(this.indexWithinChunk);
	}

	public exitField(): void {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.exitField();
		}
		assert(
			this.mode === CursorLocationType.Fields,
			0x52d /* can only navigate up from field when in field */,
		);
		this.siblings =
			this.siblingStack.pop() ?? fail(0xaf0 /* Unexpected siblingStack.length */);
		this.index = this.indexStack.pop() ?? fail(0xaf1 /* Unexpected indexStack.length */);
	}

	public exitNode(): void {
		if (this.nestedCursor !== undefined) {
			if (!this.nestedCursor.atChunkRoot()) {
				return this.nestedCursor.exitNode();
			}
			this.nestedCursor = undefined;
		}
		assert(
			this.mode === CursorLocationType.Nodes,
			0x52e /* can only navigate up from node when in node */,
		);
		this.siblings =
			this.siblingStack.pop() ?? fail(0xaf2 /* Unexpected siblingStack.length */);
		this.index = this.indexStack.pop() ?? fail(0xaf3 /* Unexpected indexStack.length */);
		this.indexOfChunk =
			this.indexOfChunkStack.pop() ?? fail(0xaf4 /* Unexpected indexOfChunkStack.length */);
		this.indexWithinChunk =
			this.indexWithinChunkStack.pop() ??
			fail(0xaf5 /* Unexpected indexWithinChunkStack.length */);
	}

	private getNode(): BasicChunk {
		assert(this.mode === CursorLocationType.Nodes, 0x52f /* can only get node when in node */);
		return (this.siblings as TreeChunk[])[this.index] as BasicChunk;
	}

	private getField(): readonly TreeChunk[] {
		if (this.siblingStack.length === 0) {
			return this.root;
		}
		assert(
			this.mode === CursorLocationType.Fields,
			0x530 /* can only get field when in fields */,
		);
		const parent = this.getStackedNode(this.indexStack.length - 1);
		const key: FieldKey = this.getFieldKey();
		const field = parent.fields.get(key) ?? [];
		return field;
	}

	public get value(): Value {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.value;
		}
		return this.getNode().value;
	}

	public get type(): TreeType {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.type;
		}
		return this.getNode().type;
	}

	public get fieldIndex(): number {
		assert(
			this.mode === CursorLocationType.Nodes,
			0x531 /* can only node's index when in node */,
		);
		if (this.nestedCursor !== undefined) {
			if (this.nestedCursor.atChunkRoot()) {
				// TODO: this.index
				return this.nestedCursor.fieldIndex + this.nestedOffset();
			}
			return this.nestedCursor.fieldIndex;
		}
		return this.index;
	}

	/**
	 * Within the field that `nestedCursor` is nested in:
	 * returns the index within that field of the first node that is part of the chunk nestedCursor traverses.
	 */
	private nestedOffset(): number {
		assert(this.nestedCursor !== undefined, 0x55e /* nested offset requires nested cursor */);
		assert(
			!this.nestedCursor.atChunkRoot() ||
				this.indexWithinChunk === this.nestedCursor.fieldIndex,
			0x55f /* indexes should match if at root */,
		);
		return this.index - this.indexWithinChunk;
	}

	public get chunkStart(): number {
		if (this.nestedCursor !== undefined) {
			if (this.nestedCursor.atChunkRoot()) {
				return this.nestedCursor.chunkStart + this.nestedOffset();
			}
			return this.nestedCursor.chunkStart;
		}
		return this.fieldIndex;
	}

	public get chunkLength(): number {
		if (this.nestedCursor !== undefined) {
			return this.nestedCursor.chunkLength;
		}
		return 1;
	}
}
