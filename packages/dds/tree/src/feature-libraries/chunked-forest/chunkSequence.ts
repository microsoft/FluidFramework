/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, oob } from "@fluidframework/core-utils/internal";

import type { ChunkedCursor, FieldKey, TreeChunk } from "../../core/index.js";
import {
	ReferenceCountedBase,
	assertNonNegativeSafeInteger,
	replaceArrayRange,
} from "../../util/index.js";

const ownershipKey = Symbol("chunk ownership");
const sequences = new WeakMap<readonly TreeChunk[], ChunkSequence | ChunkSequenceEditor>();

/**
 * A mutable chunk whose editing authority follows its owning references.
 */
export abstract class MutableChunk extends ReferenceCountedBase implements TreeChunk {
	private externalReferences = 1;
	private editor: ChunkEdit | undefined;

	public abstract readonly topLevelLength: number;
	public abstract cursor(): ChunkedCursor;
	public abstract clone(): MutableChunk;
	public abstract hasStableTopLevelLength(): boolean;

	public override referenceAdded(count = 1): void {
		assert(this.editor === undefined, "Cannot share a chunk during an edit");
		assert(!this.isUnreferenced(), "Cannot retain a released chunk");
		super.referenceAdded(count);
		this.externalReferences += count;
	}

	public override referenceRemoved(count = 1): void {
		assert(this.editor === undefined, "Cannot release a chunk during an edit");
		assert(count <= this.externalReferences, "Cannot release a reference owned by a sequence");
		this.externalReferences -= count;
		super.referenceRemoved(count);
	}

	public assertExternalOwnership(): void {
		assert(this.externalReferences > 0, "Contained chunks must be edited through their owner");
		assert(this.editor === undefined, "Cannot transfer a chunk during an edit");
	}

	/**
	 * Borrows an editor from an exclusive external reference.
	 * Contained chunks must instead be edited through their owning sequence.
	 */
	public acquireEditor(preserveLength = this.hasStableTopLevelLength()): ChunkEdit {
		this.assertExternalOwnership();
		return this.openEditor(ownershipKey, undefined, undefined, preserveLength);
	}

	public changeOwnership(key: typeof ownershipKey, delta: number): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		assert(this.editor === undefined, "Cannot transfer a chunk during an edit");
		assert(this.externalReferences + delta >= 0, "Cannot transfer an already owned reference");
		this.externalReferences += delta;
	}

	public openEditor(
		key: typeof ownershipKey,
		parent?: ChunkSequenceEditor,
		index?: number,
		preserveLength = this.hasStableTopLevelLength(),
	): ChunkEdit {
		assert(key === ownershipKey, "Invalid ownership authority");
		assert(
			!this.isUnreferenced() && !this.isShared(),
			"Cannot edit a released or shared chunk",
		);
		assert(this.editor === undefined, "Chunk already has an editor");
		this.editor = new ChunkEdit(ownershipKey, this, preserveLength, parent, index);
		return this.editor;
	}

	public closeEditor(key: typeof ownershipKey, editor: ChunkEdit): void {
		assert(key === ownershipKey && this.editor === editor, "Invalid chunk editor");
		this.editor = undefined;
	}

	protected assertReadable(): void {
		assert(
			this.editor === undefined || this.editor.preserveLength,
			"Cannot read a chunk during a length-changing edit",
		);
		this.editor?.assertReadable();
	}

	protected assertCloneable(): void {
		assert(this.editor === undefined, "Cannot clone a chunk during an edit");
	}

	/** Copies a child array and takes ownership of its references without allocating an index. */
	protected adoptChildren(chunks: readonly TreeChunk[]): TreeChunk[] {
		const children = [...chunks];
		for (const child of children) {
			adopt(child);
		}
		return children;
	}

	/** Releases the references in an owned child array. */
	protected disposeChildren(chunks: TreeChunk[]): void {
		assertChunksReadable(chunks);
		for (const child of chunks) {
			release(child);
			child.referenceRemoved();
		}
		chunks.length = 0;
	}
}

/**
 * Read barrier shared by editors along an owning path.
 */
class MutationState {
	public mutations = 0;

	public assertReadable(): void {
		assert(this.mutations === 0, "Cannot read during a sequence mutation");
	}
}

/**
 * Synchronous editing authority for one chunk, revoked on close.
 */
export class ChunkEdit {
	private active = true;
	private childScopes = 0;
	private fields: FieldKey[] | undefined;
	private structureChanged = false;
	private readonly previousLength: number;
	public readonly mutationState: MutationState;

	public constructor(
		key: typeof ownershipKey,
		public readonly chunk: MutableChunk,
		public readonly preserveLength: boolean,
		private readonly parent?: ChunkSequenceEditor,
		private readonly index?: number,
	) {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.previousLength = chunk.topLevelLength;
		this.mutationState = parent?.mutationState ?? new MutationState();
		parent?.openChild(ownershipKey, this);
	}

	public assertFor(chunk: MutableChunk): void {
		assert(this.active && this.chunk === chunk, "Invalid or expired chunk editor");
		assert(!chunk.isShared(), "Cannot edit a shared chunk");
	}

	public assertReadable(): void {
		this.assertFor(this.chunk);
		this.mutationState.assertReadable();
	}

	/** Hides partially written storage from readers of the owning path. */
	public mutate<T>(callback: () => T): T {
		this.assertReadable();
		this.mutationState.mutations++;
		try {
			return callback();
		} finally {
			this.mutationState.mutations--;
		}
	}

	public changeChildScopes(key: typeof ownershipKey, delta: number): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.assertFor(this.chunk);
		this.childScopes += delta;
	}

	public markStructureChanged(key: typeof ownershipKey): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.assertFor(this.chunk);
		this.structureChanged = true;
	}

	/**
	 * Borrows an unindexed field owned by this chunk.
	 * The caller supplies the owned array, not an external reference to its children.
	 */
	public acquireField(
		key: FieldKey,
		chunks: TreeChunk[],
		onChange: (chunks: readonly TreeChunk[]) => void,
	): ChunkSequenceEditor {
		this.assertReadable();
		const fields = (this.fields ??= []);
		assert(!fields.includes(key), "Field already has an editor");
		assert(!sequences.has(chunks), "Field array already has an owner or editor");
		const editor = new ChunkSequenceEditor(
			ownershipKey,
			undefined,
			chunks,
			this,
			() => {
				fields.splice(fields.indexOf(key), 1);
			},
			onChange,
		);
		fields.push(key);
		sequences.set(chunks, editor);
		return editor;
	}

	public close(commit = true): void {
		this.assertFor(this.chunk);
		assert(this.childScopes === 0, "Close child editors before their parent");
		assert(
			!this.preserveLength || this.chunk.topLevelLength === this.previousLength,
			"Length-preserving edits must not resize a chunk",
		);
		this.active = false;
		this.chunk.closeEditor(ownershipKey, this);
		if (this.parent !== undefined) {
			this.parent.closeChild(
				ownershipKey,
				this.index ?? oob(),
				this.chunk,
				this.previousLength,
				this.preserveLength,
				commit,
				this.structureChanged,
			);
		}
	}
}

/**
 * Owns chunk references and eagerly maintained cumulative end offsets.
 * Input arrays are copied; their owning references are transferred.
 */
export class ChunkSequence {
	/** Keep the owning back-reference out of structural comparisons and deep freezes of chunks. */
	readonly #owner: MutableChunk | undefined;
	private readonly data: TreeChunk[];
	private totalLength = 0;
	private ends: number[] | undefined;
	private editor: ChunkSequenceEditor | undefined;
	private disposed = false;
	private failed = false;
	#revision = 0;

	public constructor(
		chunks: readonly TreeChunk[],
		owner?: MutableChunk,
		public readonly preserveLength = false,
	) {
		this.#owner = owner;
		this.data = [...chunks];
		for (const chunk of this.data) {
			adopt(chunk);
		}
		this.refresh(ownershipKey, 0);
		sequences.set(this.data, this);
	}

	public get chunks(): readonly TreeChunk[] {
		this.assertReadable();
		return this.data;
	}

	public get length(): number {
		this.assertReadable();
		return this.totalLength;
	}

	public get index(): readonly number[] | undefined {
		this.assertReadable();
		return this.ends;
	}

	/**
	 * Locates a top-level node within this sequence.
	 * @param index - Non-negative safe integer less than {@link ChunkSequence.length}.
	 * @returns The containing chunk, its index in this sequence, and the node's index among that chunk's top-level nodes.
	 */
	public locateNode(index: number): {
		chunk: TreeChunk;
		indexOfChunk: number;
		indexWithinChunk: number;
	} {
		this.assertReadable();
		assertNonNegativeSafeInteger(index);
		const ends = this.ends;
		if (ends === undefined) {
			const first = this.data[0] ?? oob();
			assert(index < this.totalLength, "missing edited node");
			return { chunk: first, indexOfChunk: 0, indexWithinChunk: index };
		}
		const indexOfChunk = findChunkIndex(ends, index);
		const chunk = this.data[indexOfChunk] ?? fail("missing edited node");
		return {
			chunk,
			indexOfChunk,
			indexWithinChunk: index - (indexOfChunk === 0 ? 0 : (ends[indexOfChunk - 1] ?? oob())),
		};
	}

	/** Changes when this sequence or a descendant is structurally edited. */
	public get revision(): number {
		this.assertReadable();
		return this.#revision;
	}

	public markStructureChanged(key: typeof ownershipKey): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.#revision++;
	}

	public acquireEditor(
		parent?: ChunkEdit,
		onClose?: () => void,
		onChange?: (chunks: readonly TreeChunk[]) => void,
	): ChunkSequenceEditor {
		this.assertReadable();
		assert(this.editor === undefined, "Sequence already has an editor");
		if (this.#owner === undefined) {
			assert(parent === undefined, "Unexpected parent editor");
		} else {
			assert(parent !== undefined, "Contained sequences require their owner's editor");
			parent.assertFor(this.#owner);
		}
		this.editor = new ChunkSequenceEditor(
			ownershipKey,
			this,
			this.data,
			parent,
			onClose,
			onChange,
		);
		return this.editor;
	}

	public edit<T>(callback: (editor: ChunkSequenceEditor) => T, parent?: ChunkEdit): T {
		const editor = this.acquireEditor(parent);
		try {
			return callback(editor);
		} finally {
			editor.close();
		}
	}

	public dispose(): void {
		this.assertReadable();
		assert(this.editor === undefined, "Cannot dispose a sequence during an edit");
		this.disposed = true;
		for (const chunk of this.data) {
			release(chunk);
			chunk.referenceRemoved();
		}
		this.data.length = 0;
		sequences.delete(this.data);
		this.ends = undefined;
		this.totalLength = 0;
	}

	public closeEditor(key: typeof ownershipKey, editor: ChunkSequenceEditor): void {
		assert(key === ownershipKey && this.editor === editor, "Invalid sequence editor");
		this.editor = undefined;
	}

	public markFailed(key: typeof ownershipKey): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.failed = true;
	}

	/**
	 * Updates the affected suffix before the mutation becomes readable.
	 * Empty and singleton sequences need no index allocation.
	 */
	public refresh(key: typeof ownershipKey, start: number): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		if (this.data.length < 2) {
			this.ends = undefined;
			this.totalLength = this.data[0]?.topLevelLength ?? 0;
			return;
		}
		const suffixStart = this.ends === undefined ? 0 : start;
		this.ends ??= [];
		let total = suffixStart === 0 ? 0 : (this.ends[suffixStart - 1] ?? oob());
		this.ends.length = this.data.length;
		for (let i = suffixStart; i < this.data.length; i++) {
			total += (this.data[i] ?? oob()).topLevelLength;
			this.ends[i] = total;
		}
		this.totalLength = total;
	}

	public assertReadable(): void {
		assert(!this.disposed, "Sequence ownership has been released");
		assert(!this.failed, "Sequence edit failed");
		this.editor?.assertReadable();
	}
}

/**
 * Controls transfers and child edits for a sequence.
 * Removed references belong to the caller; inserted references are consumed.
 */
export class ChunkSequenceEditor {
	private active = true;
	private childScopes = 0;
	private unstableChildren = 0;
	private changedFrom: number | undefined;
	private mutating = false;
	private failed = false;
	private edits = 0;
	public readonly mutationState: MutationState;

	public constructor(
		key: typeof ownershipKey,
		private readonly sequence: ChunkSequence | undefined,
		private readonly data: TreeChunk[],
		private readonly parent?: ChunkEdit,
		private readonly onClose?: () => void,
		private readonly onChange?: (chunks: readonly TreeChunk[]) => void,
	) {
		assert(key === ownershipKey, "Invalid ownership authority");
		parent?.changeChildScopes(ownershipKey, 1);
		this.mutationState = parent?.mutationState ?? new MutationState();
	}

	public assertActive(): void {
		assert(this.active && !this.failed, "Invalid or expired sequence editor");
		assert(!this.mutating, "Cannot access a sequence during a mutation");
	}

	public assertReadable(): void {
		this.assertActive();
		this.mutationState.assertReadable();
		assert(this.unstableChildren === 0, "Cannot read during a variable-length child edit");
	}

	public get chunks(): readonly TreeChunk[] {
		this.assertReadable();
		return this.data;
	}

	/** Number of structural edits published through this scope or its descendants. */
	public get revision(): number {
		this.assertReadable();
		return this.edits;
	}

	private markStructureChanged(): void {
		this.edits++;
		this.sequence?.markStructureChanged(ownershipKey);
		this.parent?.markStructureChanged(ownershipKey);
	}

	public splice(
		start: number,
		deleteCount: number,
		inserted: readonly TreeChunk[] = [],
	): TreeChunk[] {
		let removed: TreeChunk[] = [];
		this.transformRange(start, start + deleteCount, (chunks) => {
			removed = chunks;
			return inserted;
		});
		return removed;
	}

	/**
	 * Transfers a range to a synchronous transformation and adopts its result.
	 * A failed transformation poisons the sequence rather than exposing partial state.
	 */
	public transformRange(
		start: number,
		end: number,
		transform: (chunks: TreeChunk[]) => readonly TreeChunk[],
	): void {
		this.assertReadable();
		assert(this.childScopes === 0, "Cannot transfer chunks with active child editors");
		assert(
			Number.isSafeInteger(start) &&
				Number.isSafeInteger(end) &&
				start >= 0 &&
				end >= start &&
				end <= this.data.length,
			"Invalid chunk range",
		);
		const input = this.data.slice(start, end);
		const previousLength =
			(this.sequence?.preserveLength ?? false)
				? input.reduce((length, chunk) => length + chunk.topLevelLength, 0)
				: undefined;
		this.mutating = true;
		this.mutationState.mutations++;
		let completed = false;
		try {
			for (const chunk of input) {
				release(chunk);
			}
			const output = transform(input);
			assert(
				previousLength === undefined ||
					output.reduce((length, chunk) => length + chunk.topLevelLength, 0) ===
						previousLength,
				"Sequence edits must preserve length",
			);
			for (const chunk of output) {
				adopt(chunk);
			}
			replaceArrayRange(this.data, start, end, output);
			this.sequence?.refresh(ownershipKey, start);
			this.markStructureChanged();
			this.onChange?.(this.data);
			completed = true;
		} finally {
			this.mutating = false;
			this.mutationState.mutations--;
			if (!completed) {
				this.failed = true;
				this.sequence?.markFailed(ownershipKey);
			}
		}
	}

	/**
	 * Acquires a child, copying shared storage through its owner.
	 * Speculative stable edits publish a copied child only when closed with `commit` set to true.
	 */
	public acquireChild(
		index: number,
		preserveLength?: boolean,
		speculative = false,
	): ChunkEdit {
		this.assertReadable();
		assert(this.childScopes === 0, "Sequence already has a child editor");
		const chunk = this.data[index] ?? oob();
		assert(chunk instanceof MutableChunk, "Chunk does not support controlled mutation");
		const sequencePreservesLength = this.sequence?.preserveLength ?? false;
		const stable =
			preserveLength ?? (sequencePreservesLength || chunk.hasStableTopLevelLength());
		assert(
			!sequencePreservesLength || stable,
			"Fixed-length sequences require stable child edits",
		);
		assert(!speculative || stable, "Speculative child edits must preserve length");
		let exclusive = chunk;
		if (chunk.isShared()) {
			const copy = chunk.clone();
			assert(copy.topLevelLength === chunk.topLevelLength, "Clone must preserve length");
			adopt(copy);
			if (!speculative) {
				release(chunk);
				this.data[index] = copy;
				chunk.referenceRemoved();
			}
			exclusive = copy;
		}
		return exclusive.openEditor(ownershipKey, this, index, stable);
	}

	public editChild<T>(index: number, callback: (editor: ChunkEdit) => T): T {
		const editor = this.acquireChild(index);
		try {
			return callback(editor);
		} finally {
			editor.close();
		}
	}

	public openChild(key: typeof ownershipKey, edit: ChunkEdit): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.assertActive();
		this.childScopes++;
		if (!edit.preserveLength) {
			this.unstableChildren++;
		}
	}

	public closeChild(
		key: typeof ownershipKey,
		index: number,
		chunk: MutableChunk,
		previousLength: number,
		preserveLength: boolean,
		commit: boolean,
		structureChanged: boolean,
	): void {
		assert(key === ownershipKey, "Invalid ownership authority");
		this.assertActive();
		this.childScopes--;
		if (this.data[index] !== chunk) {
			if (commit) {
				const previous = this.data[index] ?? oob();
				release(previous);
				this.data[index] = chunk;
				previous.referenceRemoved();
			} else {
				release(chunk);
				chunk.referenceRemoved();
			}
		}
		if (!preserveLength) {
			this.unstableChildren--;
		}
		if (commit && structureChanged) {
			this.markStructureChanged();
		}
		if (this.sequence !== undefined && chunk.topLevelLength !== previousLength) {
			this.changedFrom = Math.min(this.changedFrom ?? index, index);
		}
		if (this.unstableChildren === 0 && this.changedFrom !== undefined) {
			this.sequence?.refresh(ownershipKey, this.changedFrom);
			this.changedFrom = undefined;
		}
	}

	public close(): void {
		assert(this.active && !this.mutating, "Invalid sequence editor close");
		assert(this.childScopes === 0, "Close child editors before their parent");
		this.active = false;
		this.sequence?.closeEditor(ownershipKey, this);
		if (this.sequence === undefined && !this.failed) {
			sequences.delete(this.data);
		}
		this.parent?.changeChildScopes(ownershipKey, -1);
		if (!this.failed) {
			this.onClose?.();
		}
	}
}

function adopt(chunk: TreeChunk): void {
	if (chunk instanceof MutableChunk) {
		chunk.changeOwnership(ownershipKey, -1);
	}
}

function release(chunk: TreeChunk): void {
	if (chunk instanceof MutableChunk) {
		chunk.changeOwnership(ownershipKey, 1);
	}
}

/**
 * Rejects reads while an edit is incomplete or after an edit has failed.
 */
export function assertChunksReadable(chunks: readonly TreeChunk[]): void {
	sequences.get(chunks)?.assertReadable();
}

/**
 * Resolves an indexed owner and checks any active unindexed field editor.
 */
export function getChunkSequence(chunks: readonly TreeChunk[]): ChunkSequence | undefined {
	const owner = sequences.get(chunks);
	if (owner instanceof ChunkSequenceEditor) {
		owner.assertReadable();
		return undefined;
	}
	return owner;
}

/**
 * Finds the first exclusive end greater than the requested node position.
 */
function findChunkIndex(ends: readonly number[], index: number): number {
	let low = 0;
	let high = ends.length;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (index < (ends[mid] ?? oob())) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	return low;
}
