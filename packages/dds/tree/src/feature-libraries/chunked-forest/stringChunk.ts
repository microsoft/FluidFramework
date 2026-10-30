/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChunkedCursor, TreeChunk, TreeNodeSchemaIdentifier } from "../../core/index.js";
import { ReferenceCountedBase, StringPiece, StringSequence } from "../../util/index.js";
import { cursorForStringSequence } from "../stringSequenceCursor.js";

export { stringBufferSize } from "../../util/index.js";

/**
 * A forest chunk adapting shared string storage to primitive tree leaves.
 */
export class StringChunk extends ReferenceCountedBase implements TreeChunk {
	private readonly sequence: StringSequence;

	public constructor(
		public readonly type: TreeNodeSchemaIdentifier,
		public readonly piece: StringPiece,
	) {
		super();
		this.sequence = new StringSequence([piece]);
	}

	public static fromString(type: TreeNodeSchemaIdentifier, text: string): StringChunk[] {
		return StringPiece.fromString(text).map((piece) => new StringChunk(type, piece));
	}

	public get topLevelLength(): number {
		return this.piece.length;
	}

	public get text(): string {
		return this.piece.text;
	}

	/** Returns an owned piece; it shares the immutable backing buffer. */
	public slice(start: number, end: number): StringChunk {
		return new StringChunk(this.type, this.piece.slice(start, end));
	}

	/** Returns a new owned piece without consuming either input reference. */
	public tryAppend(other: StringChunk): StringChunk | undefined {
		if (this.type !== other.type) {
			return undefined;
		}
		const piece = this.piece.tryAppend(other.piece);
		return piece === undefined ? undefined : new StringChunk(this.type, piece);
	}

	public cursor(): ChunkedCursor {
		return cursorForStringSequence(this.type, this.sequence, this);
	}

	protected onUnreferenced(): void {}
}
