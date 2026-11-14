/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ChunkedCursor, TreeChunk } from "../../core/index.js";
import { ReferenceCountedBase } from "../../util/index.js";

import { ChunkCursor, ChunkSequenceCursor, type CompositeChunk } from "./chunkCursor.js";
import { type EditableChunk, type ChunkEditCursor, getFieldLength } from "./chunkEditing.js";

/**
 * General purpose multi-node sequence chunk.
 * @privateRemarks
 * Cursor integration tests are in chunkCursor.spec.ts, alongside shared traversal and mixed-format boundary cases.
 * Editing integration and root-length preservation are covered in chunkEditTraversal.spec.ts.
 */
export class SequenceChunk
	extends ReferenceCountedBase
	implements CompositeChunk, EditableChunk
{
	public readonly topLevelLength: number;

	/**
	 * Create a tree chunk with ref count 1.
	 *
	 * @param subChunks - Child array whose ownership is transferred to this chunk.
	 * The caller must have accounted for one reference to each child via `referenceAdded`.
	 * Edits must update child reference counts and preserve the total number of top-level nodes.
	 * Changes to that number require replacing the sequence in its owning parent.
	 */
	public constructor(public readonly subChunks: TreeChunk[]) {
		super();
		this.topLevelLength = getFieldLength(subChunks);
	}

	public clone(): SequenceChunk {
		const subChunks = this.subChunks.map((child) => {
			child.referenceAdded();
			return child;
		});
		return new SequenceChunk(subChunks);
	}

	public cursor(): ChunkedCursor {
		return ChunkCursor.fromChunk(this);
	}

	public getLocalCursor(): ChunkSequenceCursor {
		return new ChunkSequenceCursor(this.subChunks);
	}

	public getEditCursor(): ChunkEditCursor {
		assert(!this.isShared(), "Editing requires exclusive chunk ownership");
		return new SequenceEditCursor(this);
	}

	protected onUnreferenced(): void {
		for (const child of this.subChunks) {
			child.referenceRemoved();
		}
	}
}

/** Local editing of an exclusive sequence's child array. */
class SequenceEditCursor extends ChunkSequenceCursor implements ChunkEditCursor {
	/** Starts at an exclusive sequence's root field, retaining its fixed top-level node count during edits. */
	public constructor(
		/** Exclusive sequence borrowed without adding references; supplies the fixed top-level node count. */
		private readonly chunk: SequenceChunk,
	) {
		super(chunk.subChunks);
	}
	public override getFieldChunks(): TreeChunk[] {
		return this.chunk.subChunks;
	}
	public override fork(): SequenceEditCursor {
		return new SequenceEditCursor(this.chunk);
	}
	public setFieldChunks(chunks: TreeChunk[]): void {
		assert(!this.chunk.isShared(), "Editing requires exclusive chunk ownership");
		assert(chunks === this.chunk.subChunks, "Expected the sequence's own child array");
		assert(
			getFieldLength(chunks) === this.chunk.topLevelLength,
			"Sequence edits must preserve length",
		);
	}
}
