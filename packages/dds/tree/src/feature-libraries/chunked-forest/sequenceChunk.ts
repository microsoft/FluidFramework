/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChunkedCursor, TreeChunk } from "../../core/index.js";
import { ReferenceCountedBase } from "../../util/index.js";

import { ChunkCursor, ChunkSequenceCursor, type CompositeChunk } from "./chunkCursor.js";
import { getFieldLength } from "./chunkEditing.js";

/**
 * General purpose multi-node sequence chunk.
 * @privateRemarks
 * Cursor integration tests are in chunkCursor.spec.ts, alongside shared traversal and mixed-format boundary cases.
 */
export class SequenceChunk extends ReferenceCountedBase implements CompositeChunk {
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

	protected onUnreferenced(): void {
		for (const child of this.subChunks) {
			child.referenceRemoved();
		}
	}
}
