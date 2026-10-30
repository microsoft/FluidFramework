/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	CursorLocationType,
	cursorChunk,
	cursorLeafSequence,
	dummyRoot,
	type ChunkedCursor,
	type FieldKey,
	type FieldUpPath,
	type LeafSequence,
	type PathRootPrefix,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	type UpPath,
} from "../core/index.js";
import type { MinimalMapTreeNodeView } from "./mapTreeCursor.js";
import {
	type CursorWithNode,
	SynchronousCursor,
	prefixFieldPath,
	prefixPath,
} from "./treeCursorUtils.js";

/**
 * A field cursor over immutable primitive leaves, materializing node objects only on request.
 */
export class LeafSequenceCursor<TNode>
	extends SynchronousCursor
	implements CursorWithNode<TNode>, ChunkedCursor
{
	public mode = CursorLocationType.Fields;
	private index = 0;
	private field: FieldKey = dummyRoot;
	private inEmptyField = false;
	private iterator: Iterator<TreeValue> | undefined;
	private current: TreeValue | undefined;

	public constructor(
		private readonly sequence: LeafSequence,
		private readonly nodeAt: (index: number) => TNode,
		private readonly chunk?: TreeChunk,
	) {
		super();
	}

	public get [cursorLeafSequence](): LeafSequence | undefined {
		return this.inEmptyField ? undefined : this.sequence;
	}

	public get [cursorChunk](): TreeChunk | undefined {
		return this.inEmptyField ? undefined : this.chunk;
	}

	public atChunkRoot(): boolean {
		return !this.inEmptyField;
	}

	public fork(): LeafSequenceCursor<TNode> {
		const fork = new LeafSequenceCursor(this.sequence, this.nodeAt, this.chunk);
		if (this.mode === CursorLocationType.Nodes || this.inEmptyField) {
			fork.enterNode(this.index);
			if (this.inEmptyField) {
				fork.enterField(this.field);
			}
		}
		return fork;
	}

	public getNode(): TNode {
		this.assertNode();
		return this.nodeAt(this.index);
	}

	public get fieldIndex(): number {
		this.assertNode();
		return this.index;
	}

	public readonly chunkStart = 0;

	public get chunkLength(): number {
		this.assertNode();
		return this.sequence.length;
	}

	public get type(): TreeNodeSchemaIdentifier {
		this.assertNode();
		return this.sequence.type;
	}

	public get value(): TreeValue {
		this.assertNode();
		if (this.current === undefined) {
			this.current = this.sequence.at(this.index);
		}
		return this.current;
	}

	public getFieldKey(): FieldKey {
		assert(this.mode === CursorLocationType.Fields, "Expected field cursor");
		return this.field;
	}

	public getFieldLength(): number {
		assert(this.mode === CursorLocationType.Fields, "Expected field cursor");
		return this.inEmptyField ? 0 : this.sequence.length;
	}

	public firstNode(): boolean {
		if (this.getFieldLength() === 0) {
			return false;
		}
		this.enterNode(0);
		return true;
	}

	public enterNode(index: number): void {
		assert(
			Number.isInteger(index) && index >= 0 && index < this.getFieldLength(),
			"Node index out of bounds",
		);
		this.index = index;
		this.iterator = undefined;
		this.current = undefined;
		this.mode = CursorLocationType.Nodes;
	}

	public seekNodes(offset: number): boolean {
		this.assertNode();
		const index = this.index + offset;
		if (index < 0 || index >= this.sequence.length) {
			this.exitNode();
			return false;
		}
		assert(Number.isInteger(offset), "Expected integer cursor offset");
		if (offset === 1) {
			this.iterator ??= this.sequence.values(index);
			this.advance();
		} else if (offset !== 0) {
			this.iterator = undefined;
			this.current = undefined;
		}
		this.index = index;
		return true;
	}

	public nextNode(): boolean {
		return this.seekNodes(1);
	}

	public exitNode(): void {
		this.assertNode();
		this.mode = CursorLocationType.Fields;
		this.field = dummyRoot;
		this.iterator = undefined;
		this.current = undefined;
	}

	public firstField(): boolean {
		this.assertNode();
		return false;
	}

	public enterField(key: FieldKey): void {
		this.assertNode();
		this.mode = CursorLocationType.Fields;
		this.inEmptyField = true;
		this.field = key;
	}

	public nextField(): boolean {
		this.exitField();
		return false;
	}

	public exitField(): void {
		assert(
			this.mode === CursorLocationType.Fields && this.inEmptyField,
			"Cannot exit the root field",
		);
		this.inEmptyField = false;
		this.mode = CursorLocationType.Nodes;
	}

	public getPath(prefix?: PathRootPrefix): UpPath | undefined {
		this.assertNode();
		return prefixPath(prefix, this.path());
	}

	public getFieldPath(prefix?: PathRootPrefix): FieldUpPath {
		return prefixFieldPath(prefix, {
			parent: this.inEmptyField ? this.path() : undefined,
			field: this.getFieldKey(),
		});
	}

	private path(): UpPath {
		return { parent: undefined, parentField: dummyRoot, parentIndex: this.index };
	}

	private assertNode(): void {
		assert(this.mode === CursorLocationType.Nodes, "Expected node cursor");
	}

	private advance(): void {
		assert(this.iterator !== undefined, "Expected leaf iterator");
		const next = this.iterator.next();
		assert(next.done !== true, "Leaf iterator must match the sequence length");
		this.current = next.value;
	}
}

/**
 * Creates a primitive field cursor without allocating per-leaf nodes.
 */
export function cursorForLeafSequence(
	sequence: LeafSequence,
	chunk?: TreeChunk,
): LeafSequenceCursor<MinimalMapTreeNodeView> {
	return new LeafSequenceCursor(
		sequence,
		(index) => ({ type: sequence.type, value: sequence.at(index), fields: new Map() }),
		chunk,
	);
}
