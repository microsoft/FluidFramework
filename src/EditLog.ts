/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, assertArrayOfOne, assertNotUndefined, compareIterables, fail } from './Common';
import { Edit } from './PersistedTypes';
import { EditId } from './Identifiers';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IsoBuffer } from '@fluidframework/common-utils';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
 * @public
 * @sealed
 */
export interface OrderedEditSet {
	/**
	 * @returns the length of this `OrderedEditSet`
	 */
	length: number;

	/**
	 * @returns the index of the edit with the given editId within this `OrderedEditSet`.
	 */
	indexOf(editId: EditId): number;

	/**
	 * @returns the id of the edit at the given index within this 'OrderedEditSet'.
	 */
	idOf(index: number): EditId;

	/**
	 * @returns the edit at the given index within this `OrderedEditSet`.
	 */
	getAtIndex(index: number): Promise<Edit>;

	/**
	 * @returns the edit at the given index. Must have been added to the log during the current session.
	 */
	getAtIndexSynchronous(index: number): Edit;

	/**
	 * @returns the Edit associated with the EditId or undefined if there is no such edit in the set.
	 */
	tryGetEdit(editId: EditId): Promise<Edit | undefined>;

	/**
	 * @returns the list of edits that do not have associated blob handles.
	 */
	getEditLogSummary(): EditLogSummary;

	[Symbol.iterator](): IterableIterator<EditId>;
}

/**
 * Information used to populate an edit log.
 * @internal
 */
export interface EditLogSummary {
	/**
	 * A list of either handles for a chunk of edits or a group of edits that can be chunked.
	 */
	readonly editChunks: readonly (IFluidHandle<ArrayBufferLike> | Edit[])[];

	/**
	 * A list of edits IDs for all sequenced edits.
	 */
	readonly editIds: readonly EditId[];
}

interface SequencedOrderedEditId {
	readonly isLocal: false;
	readonly index: number;
}

interface LocalOrderedEditId {
	readonly isLocal: true;
	readonly localSequence: number;
}

interface editChunk {
	handle?: IFluidHandle<ArrayBufferLike>;
	edits?: Edit[];
}

type OrderedEditId = SequencedOrderedEditId | LocalOrderedEditId;

/**
 * The number of edits associated with each blob.
 * @internal
 */
export const editsPerChunk = 100;

/**
 * The number of blobs to be loaded in memory at any time.
 * TODO:#49901: Change cache size once the virtualized history summary format is being written.
 * 		 This is so the summarizer doesn't have to reload every edit to generate summaries.
 * */
const loadedChunkCacheSize = Number.POSITIVE_INFINITY;

/**
 * The edit history log for SharedTree.
 * Contains only completed edits (no in-progress edits).
 * Ordered first by locality (acked or local), then by time of insertion.
 * May not contain more than one edit with the same ID.
 * @internal @sealed
 */
export class EditLog implements OrderedEditSet {
	private localEditSequence = 0;
	private version = 0;

	private readonly editIds: EditId[];
	private readonly localEditIds: EditId[] = [];

	private readonly editChunks: editChunk[];
	private readonly localEdits: Edit[] = [];

	private loadedChunkMruCache: number[] = [];
	private readonly maximumEvictedIndex: number;

	private allEditIds: Map<EditId, OrderedEditId> = new Map();

	/**
	 * Construct an `EditLog` using the given options.
	 */
	public constructor(options?: EditLogSummary) {
		const editLogSummary = options || { editIds: [], editChunks: [] };
		const { editChunks, editIds } = editLogSummary;

		this.editChunks = editChunks.map((chunk) => {
			if (Array.isArray(chunk)) {
				return { edits: chunk };
			}

			return { handle: chunk };
		});

		this.editIds = editIds.slice();
		this.maximumEvictedIndex = (this.editChunks.length - 1) * editsPerChunk - 1;

		this.editIds.forEach((id, index) => this.allEditIds.set(id, { isLocal: false, index }));
	}

	/**
	 * Get a value which can be compared with === to determine if a log has not changed.
	 */
	public versionIdentifier(): unknown {
		return this.version;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.length}
	 */
	public get length(): number {
		return this.numberOfSequencedEdits + this.numberOfLocalEdits;
	}

	/**
	 * The number of sequenced (acked) edits in the log.
	 */
	public get numberOfSequencedEdits(): number {
		return this.editIds.length;
	}

	/**
	 * The number of local (unacked) edits in the log.
	 */
	public get numberOfLocalEdits(): number {
		return this.localEdits.length;
	}

	public getEditIds(): readonly EditId[] {
		return this.editIds;
	}

	/**
	 * @returns true iff the edit is contained in this 'EditLog' and it is a local edit (not sequenced).
	 */
	public isLocalEdit(editId: EditId): boolean {
		const entry = this.allEditIds.get(editId);
		return entry !== undefined && entry.isLocal;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.indexOf}
	 */
	public indexOf(editId: EditId): number {
		const orderedEdit = this.allEditIds.get(editId) ?? fail('edit not found');

		if (orderedEdit.isLocal) {
			const firstLocal = assertNotUndefined(this.allEditIds.get(this.localEditIds[0]));
			assert(firstLocal.isLocal);
			return this.numberOfSequencedEdits + orderedEdit.localSequence - firstLocal.localSequence;
		}
		return orderedEdit.index;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.idOf}
	 */
	public idOf(index: number): EditId {
		if (this.numberOfSequencedEdits <= index) {
			return this.localEditIds[index - this.numberOfSequencedEdits];
		}

		return this.editIds[index];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getAtIndex}
	 */
	public async getAtIndex(index: number): Promise<Edit> {
		if (index < this.numberOfSequencedEdits) {
			const editChunkIndex = Math.floor(index / editsPerChunk);

			const editChunk = this.editChunks[editChunkIndex];
			const { handle, edits } = editChunk;

			if (edits === undefined) {
				assert(handle !== undefined, 'An edit chunk should include at least a handle or edits.');
				const edits = JSON.parse(IsoBuffer.from(await handle.get()).toString()).edits;
				assert(edits.length === editsPerChunk, 'The chunk does not contain the correct number of edits.');
				editChunk.edits = edits;

				this.addIndexToCache(editChunkIndex);

				return edits[index % editsPerChunk];
			}

			return edits[index % editsPerChunk];
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getAtIndexSynchronous}
	 */
	public getAtIndexSynchronous(index: number): Edit {
		assert(
			index > this.maximumEvictedIndex,
			'Edit to retrieve must have been added to the log during the current session.'
		);

		if (index < this.numberOfSequencedEdits) {
			const editChunkIndex = Math.floor(index / editsPerChunk);
			const { edits } = this.editChunks[editChunkIndex];

			return assertNotUndefined(edits, 'Edits should not have been evicted.')[index % editsPerChunk];
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.tryGetEdit}
	 */
	public async tryGetEdit(editId: EditId): Promise<Edit | undefined> {
		try {
			const index = this.indexOf(editId);
			return await this.getAtIndex(index);
		} catch {
			return undefined;
		}
	}

	public processEditChunkHandle(chunkHandle: IFluidHandle<ArrayBufferLike>, chunkIndex: number): void {
		assert(
			chunkIndex < this.editChunks.length,
			'A chunk handle op should not be received before the edit ops it corresponds to.'
		);
		this.editChunks[chunkIndex].handle = chunkHandle;
		this.addIndexToCache(chunkIndex);
	}

	/**
	 * Sequences all local edits.
	 */
	public sequenceLocalEdits(): void {
		assert(this.localEdits.length === this.localEditIds.length, 'Local edits and edit IDs must match up.');
		this.localEdits.slice().forEach((edit) => this.addSequencedEdit(this.localEditIds[0], edit));
	}

	/**
	 * Adds a sequenced (non-local) edit to the edit log.
	 * If the id of the supplied edit matches a local edit already present in the log, the local edit will be replaced.
	 */
	public addSequencedEdit(id: EditId, edit: Edit): void {
		this.version++;

		if (this.editChunks.length === 0) {
			this.editChunks.push({ edits: [edit] });
		} else {
			// Add to the last edit chunk if it has room, otherwise create a new chunk.
			const { edits: lastEditChunk } = this.editChunks[this.editChunks.length - 1];
			if (lastEditChunk !== undefined && lastEditChunk.length < editsPerChunk) {
				lastEditChunk.push(edit);
			} else {
				this.editChunks.push({ edits: [edit] });
			}
		}

		// Remove the edit from local edits if it exists.
		const encounteredEditId = this.allEditIds.get(id);
		if (encounteredEditId !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(encounteredEditId.isLocal, 'Duplicate acked edit.');
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			assertArrayOfOne(this.localEdits.splice(0, 1));
			const oldLocalEditId = assertArrayOfOne(this.localEditIds.splice(0, 1));
			assert(oldLocalEditId === id, 'Causal ordering should be upheld');
		}

		this.editIds.push(id);
		const sequencedEditId: SequencedOrderedEditId = { index: this.numberOfSequencedEdits - 1, isLocal: false };
		this.allEditIds.set(id, sequencedEditId);
	}

	/**
	 * Adds a non-sequenced (local) edit to the edit log.
	 * Duplicate edits are ignored.
	 */
	public addLocalEdit(id: EditId, edit: Edit): void {
		this.version++;
		this.localEdits.push(edit);
		this.localEditIds.push(id);
		const localEditId: LocalOrderedEditId = { localSequence: this.localEditSequence++, isLocal: true };
		this.allEditIds.set(id, localEditId);
	}

	/**
	 * @returns true iff this `EditLog` and `other` are equivalent, regardless of locality.
	 */
	public equals(other: EditLog): boolean {
		return compareIterables(this, other);
	}

	/**
	 * Returns information about the edit log.
	 */
	public getEditLogSummary(): EditLogSummary {
		// TODO:#49901: When writing format version 0.1.0, change to prefer sending the handle when not undefined.
		// For now, no chunks are evicted so edits are sent as is to be aggregated during summary write.
		return {
			editChunks: this.editChunks.map(({ edits }) => assertNotUndefined(edits)),
			editIds: this.editIds,
		};
	}

	public *[Symbol.iterator](): IterableIterator<EditId> {
		// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
		// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
		yield* this.editIds;
		yield* this.localEditIds;
	}

	private addIndexToCache(newIndex: number): void {
		if (newIndex <= this.maximumEvictedIndex && this.loadedChunkMruCache.length >= loadedChunkCacheSize) {
			const indexToEvict = assertNotUndefined(this.loadedChunkMruCache.shift());
			this.editChunks[indexToEvict].edits = [];
			this.loadedChunkMruCache.push(newIndex);
		}
	}
}
