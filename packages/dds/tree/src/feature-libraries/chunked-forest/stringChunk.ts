/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	cursorChunk,
	dummyRoot,
	type ChunkedCursor,
	type FieldKey,
	type FieldUpPath,
	type PathRootPrefix,
	type TreeChunk,
	type TreeNodeSchemaIdentifier,
	type UpPath,
} from "../../core/index.js";
import { ReferenceCountedBase } from "../../util/index.js";
import { SynchronousCursor, prefixFieldPath, prefixPath } from "../treeCursorUtils.js";
import { BasicChunk } from "./basicChunk.js";

/** A tree snapshot whose string fields are already packed. */
export class StringTreeChunk extends BasicChunk {}

const checkpointStride = 64;
export const stringBufferSize = 4096;
const coalesceSize = 256;

/** Immutable text and sparse code-point offsets shared by pieces. */
class StringBuffer {
	public readonly length: number;
	private readonly checkpoints: readonly number[] | undefined;

	public constructor(public readonly text: string) {
		const checkpoints: number[] = [];
		let count = 0;
		for (let offset = 0; offset < text.length; count++) {
			if (count % checkpointStride === 0) {
				checkpoints.push(offset);
			}
			offset += characterWidth(text, offset);
		}
		this.length = count;
		this.checkpoints = count === text.length ? undefined : checkpoints;
	}

	public offset(index: number): number {
		assert(index >= 0 && index <= this.length, "Character offset out of bounds");
		if (this.checkpoints === undefined || index === this.length) {
			return index === this.length ? this.text.length : index;
		}
		const checkpoint = Math.floor(index / checkpointStride);
		let offset = this.checkpoints[checkpoint] ?? oob();
		for (let i = checkpoint * checkpointStride; i < index; i++) {
			offset += characterWidth(this.text, offset);
		}
		return offset;
	}
}

function characterWidth(text: string, offset: number): number {
	return (text.codePointAt(offset) ?? oob()) > 0xffff ? 2 : 1;
}

/** A piece exposing code points as separate string leaves, without storing per-leaf values. */
export class StringChunk extends ReferenceCountedBase implements TreeChunk {
	private constructor(
		public readonly type: TreeNodeSchemaIdentifier,
		private readonly buffer: StringBuffer,
		private readonly start: number,
		public readonly topLevelLength: number,
	) {
		super();
	}

	public static fromString(type: TreeNodeSchemaIdentifier, text: string): StringChunk[] {
		const chunks: StringChunk[] = [];
		for (let start = 0; start < text.length; ) {
			let end = Math.min(start + stringBufferSize, text.length);
			// Do not split a surrogate pair at a backing-buffer boundary.
			if (end < text.length && characterWidth(text, end - 1) === 2) {
				end--;
			}
			const buffer = new StringBuffer(text.slice(start, end));
			chunks.push(new StringChunk(type, buffer, 0, buffer.length));
			start = end;
		}
		return chunks;
	}

	public offset(index: number): number {
		return this.buffer.offset(this.start + index);
	}

	public get text(): string {
		return this.buffer.text.slice(this.offset(0), this.offset(this.topLevelLength));
	}

	public characterAtOffset(offset: number): string {
		return this.buffer.text.slice(offset, offset + this.widthAtOffset(offset));
	}

	public widthAtOffset(offset: number): number {
		return characterWidth(this.buffer.text, offset);
	}

	/** Returns an owned piece; it shares the immutable backing buffer. */
	public slice(start: number, end: number): StringChunk {
		assert(
			Number.isInteger(start) &&
				Number.isInteger(end) &&
				start >= 0 &&
				start < end &&
				end <= this.topLevelLength,
			"Invalid string piece range",
		);
		return new StringChunk(this.type, this.buffer, this.start + start, end - start);
	}

	/** Returns a new owned piece without consuming either input reference. */
	public tryAppend(other: StringChunk): StringChunk | undefined {
		if (this.type !== other.type) {
			return undefined;
		}
		if (this.buffer === other.buffer && this.start + this.topLevelLength === other.start) {
			return new StringChunk(
				this.type,
				this.buffer,
				this.start,
				this.topLevelLength + other.topLevelLength,
			);
		}
		const leftLength = this.offset(this.topLevelLength) - this.offset(0);
		const rightLength = other.offset(other.topLevelLength) - other.offset(0);
		if (leftLength + rightLength > coalesceSize) {
			return undefined;
		}
		const text = this.text + other.text;
		const buffer = new StringBuffer(text);
		// Separately inserted surrogate halves must remain separate logical leaves.
		if (buffer.length !== this.topLevelLength + other.topLevelLength) {
			return undefined;
		}
		return new StringChunk(this.type, buffer, 0, buffer.length);
	}

	public cursor(): ChunkedCursor {
		return new StringCursor(this);
	}

	protected onUnreferenced(): void {}
}

class StringCursor extends SynchronousCursor implements ChunkedCursor {
	public mode = CursorLocationType.Fields;
	private index = 0;
	private offset = 0;
	private field: FieldKey = dummyRoot;
	private inEmptyField = false;

	public constructor(private readonly chunk: StringChunk) {
		super();
	}

	public get [cursorChunk](): TreeChunk | undefined {
		return this.atChunkRoot() ? this.chunk : undefined;
	}

	public atChunkRoot(): boolean {
		return !this.inEmptyField;
	}

	public fork(): StringCursor {
		const fork = new StringCursor(this.chunk);
		fork.mode = this.mode;
		fork.index = this.index;
		fork.offset = this.offset;
		fork.field = this.field;
		fork.inEmptyField = this.inEmptyField;
		return fork;
	}

	public get fieldIndex(): number {
		this.assertNode();
		return this.index;
	}

	public readonly chunkStart = 0;

	public get chunkLength(): number {
		this.assertNode();
		return this.chunk.topLevelLength;
	}

	public get type(): TreeNodeSchemaIdentifier {
		this.assertNode();
		return this.chunk.type;
	}

	public get value(): string {
		this.assertNode();
		return this.chunk.characterAtOffset(this.offset);
	}

	public getFieldKey(): FieldKey {
		assert(this.mode === CursorLocationType.Fields, "Expected field cursor");
		return this.field;
	}

	public getFieldLength(): number {
		assert(this.mode === CursorLocationType.Fields, "Expected field cursor");
		return this.inEmptyField ? 0 : this.chunk.topLevelLength;
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
		this.offset = this.chunk.offset(index);
		this.mode = CursorLocationType.Nodes;
	}

	public seekNodes(offset: number): boolean {
		this.assertNode();
		const index = this.index + offset;
		if (index < 0 || index >= this.chunk.topLevelLength) {
			this.exitNode();
			return false;
		}
		assert(Number.isInteger(offset), "Expected integer cursor offset");
		this.offset =
			offset === 1
				? this.offset + this.chunk.widthAtOffset(this.offset)
				: this.chunk.offset(index);
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
}
