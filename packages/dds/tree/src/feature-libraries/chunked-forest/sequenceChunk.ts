/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import { dummyRoot, type ChunkedCursor, type TreeChunk } from "../../core/index.js";

import { ChunkCursor, ChunkSequenceCursor, type CompositeChunk } from "./chunkCursor.js";
import type { EditableChunk, ChunkEditCursor } from "./chunkEditing.js";
import {
	type ChunkEdit,
	ChunkSequence,
	type ChunkSequenceEditor,
	MutableChunk,
} from "./chunkSequence.js";

/**
 * A {@link CompositeChunk} representing the concatenation of its child {@link TreeChunk}s.
 * @remarks
 * {@link SequenceChunk.getLocalCursor} exposes the children through a {@link ChunkSequenceCursor}.
 * The sequence adds no nodes or fields to the tree.
 * @privateRemarks
 * Cursor integration tests are in chunkCursor.spec.ts, alongside shared traversal and mixed-format boundary cases.
 * Editing integration and root-length preservation are covered in chunkEditTraversal.spec.ts.
 */
export class SequenceChunk extends MutableChunk implements CompositeChunk, EditableChunk {
	public readonly topLevelLength: number;
	private readonly children: ChunkSequence;

	public override hasStableTopLevelLength(): boolean {
		return true;
	}

	public supportsRootEdits(): boolean {
		return true;
	}

	public get subChunks(): readonly TreeChunk[] {
		return this.children.chunks;
	}

	/**
	 * Creates a {@link SequenceChunk} with reference count 1.
	 * @remarks
	 * Edits to {@link SequenceChunk.subChunks} must update child reference counts and preserve {@link SequenceChunk.topLevelLength}.
	 * Changing the total number of top-level nodes requires replacing the sequence in its owning parent.
	 * @param subChunks - Child references transferred to this chunk; the array is copied.
	 * The caller must have accounted for one reference to each child via `referenceAdded`.
	 */
	public constructor(subChunks: readonly TreeChunk[]) {
		super();
		this.children = new ChunkSequence(subChunks, this, true);
		this.topLevelLength = this.children.length;
	}

	public clone(): SequenceChunk {
		this.assertCloneable();
		const subChunks = this.subChunks.map((child) => {
			child.referenceAdded();
			return child;
		});
		return new SequenceChunk(subChunks);
	}

	public cursor(): ChunkedCursor {
		this.assertReadable();
		return ChunkCursor.fromChunk(this);
	}

	public getLocalCursor(): ChunkSequenceCursor {
		this.assertReadable();
		return new ChunkSequenceCursor(this.subChunks, dummyRoot, this.topLevelLength);
	}

	public getEditCursor(edit?: ChunkEdit): ChunkEditCursor {
		assert(!this.isShared(), "Editing requires exclusive chunk ownership");
		const scope = edit ?? this.acquireEditor();
		scope.assertFor(this);
		return new SequenceEditCursor(this, this.children.acquireEditor(scope), scope);
	}

	/** Consumes an external reference and returns independently owned child references. */
	public takeChildren(): TreeChunk[] {
		this.assertExternalOwnership();
		const children = this.subChunks.map((child) => {
			child.referenceAdded();
			return child;
		});
		this.referenceRemoved();
		return children;
	}

	protected onUnreferenced(): void {
		this.children.dispose();
	}
}

/**
 * A {@link ChunkEditCursor} exposing an exclusive {@link SequenceChunk}'s child array.
 * @remarks
 * Its field owner requires edits to preserve {@link SequenceChunk.topLevelLength}.
 */
class SequenceEditCursor extends ChunkSequenceCursor implements ChunkEditCursor {
	/**
	 * Starts at an exclusive sequence's root field.
	 * @remarks
	 * Retains {@link SequenceChunk.topLevelLength} as the adapter's fixed root length during editing.
	 */
	public constructor(
		/** Borrowed exclusive sequence supplying {@link SequenceChunk.topLevelLength}. */
		chunk: SequenceChunk,
		private readonly fieldEditor: ChunkSequenceEditor,
		private readonly edit: ChunkEdit,
	) {
		super(chunk.subChunks, dummyRoot, chunk.topLevelLength);
	}
	public override getFieldChunks(): readonly TreeChunk[] {
		return this.fieldEditor.chunks;
	}
	public getFieldEditor(): ChunkSequenceEditor {
		this.fieldEditor.assertActive();
		return this.fieldEditor;
	}
	public release(commit = true): void {
		this.fieldEditor.close();
		this.edit.close(commit);
	}
	public override fork(): ChunkSequenceCursor {
		return fail("Editing navigation must not be forked");
	}
}
