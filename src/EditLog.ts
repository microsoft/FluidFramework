/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from '@taylorsw04/sorted-btree';
import { IsoBuffer } from '@fluidframework/common-utils';
import { assert, assertNotUndefined, compareArrays, fail } from './Common';
import { Edit, EditWithoutId } from './generic';
import { EditId } from './Identifiers';
import { compareFiniteNumbers } from './SnapshotUtilities';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
 * Edits are virtualized, however, edits added during the current session are guaranteed to be available
 * synchronously.
 * @public
 * @sealed
 */
export interface OrderedEditSet<TChange> {
	/**
	 * @returns the length of this `OrderedEditSet`
	 */
	length: number;

	/**
	 * @returns the edit IDs of all edits in the log.
	 */
	editIds: EditId[];

	/**
	 * @returns the index of the edit with the given editId within this `OrderedEditSet`.
	 */
	getIndexOfId(editId: EditId): number;

	/**
	 * @returns the id of the edit at the given index within this 'OrderedEditSet'.
	 */
	getIdAtIndex(index: number): EditId;

	/**
	 * @returns the index of the edit with the given editId within this `OrderedEditSet`, or `undefined` if no such edit exists.
	 */
	tryGetIndexOfId(editId: EditId): number | undefined;

	/**
	 * @returns the edit at the given index within this `OrderedEditSet`.
	 */
	getEditAtIndex(index: number): Promise<Edit<TChange>>;

	/**
	 * @returns the edit at the given index. Must have been added to the log during the current session.
	 */
	getEditInSessionAtIndex(index: number): Edit<TChange>;

	/**
	 * @returns the Edit associated with the EditId or undefined if there is no such edit in the set.
	 */
	tryGetEdit(editId: EditId): Promise<Edit<TChange> | undefined>;

	/**
	 * @param useHandles - By default, false. If true, returns handles instead of edit chunks where possible.
	 * 					   TODO:#49901: This parameter is used for testing and should be removed once format version 0.1.0 is written.
	 * @returns the summary of this `OrderedEditSet` that can be used to reconstruct the edit set.
	 * @internal
	 */
	getEditLogSummary(useHandles?: boolean): EditLogSummary<TChange>;
}

/**
 * Information used to populate an edit log.
 * @internal
 */
export interface EditLogSummary<TChange> {
	/**
	 * A of list of serialized chunks and their corresponding keys.
	 * Start revision is the index of the first edit in the chunk in relation to the edit log.
	 */
	readonly editChunks: readonly { startRevision: number; chunk: EditChunkOrHandle<TChange> }[];

	/**
	 * A list of edits IDs for all sequenced edits.
	 */
	readonly editIds: readonly EditId[];
}

/**
 * EditHandles are used to load edit chunks stored outside of the EditLog.
 * Can be satisfied by IFluidHandle<ArrayBufferLike>.
 * @internal
 */
export interface EditHandle {
	get: () => Promise<ArrayBufferLike>;
}

interface SequencedOrderedEditId {
	readonly isLocal: false;
	readonly index: number;
}

interface LocalOrderedEditId {
	readonly isLocal: true;
	readonly localSequence: number;
}

interface EditChunk<TChange> {
	handle?: EditHandle;
	edits?: EditWithoutId<TChange>[];
}

/**
 * Either a chunk of edits or a handle that can be used to load that chunk.
 * @internal
 */
export type EditChunkOrHandle<TChange> = EditHandle | EditWithoutId<TChange>[];

type OrderedEditId = SequencedOrderedEditId | LocalOrderedEditId;

/**
 * Returns an object that separates an Edit into two fields, id and editWithoutId.
 */
export function separateEditAndId<TChange>(edit: Edit<TChange>): { id: EditId; editWithoutId: EditWithoutId<TChange> } {
	const editWithoutId = { ...edit, id: undefined };
	delete editWithoutId.id;
	return { id: edit.id, editWithoutId };
}

function joinEditAndId<TChange>(id: EditId, edit: EditWithoutId<TChange>): Edit<TChange> {
	return { id, ...edit };
}

/**
 * The number of edits associated with each blob.
 */
export const editsPerChunk = 100;

/**
 * The number of blobs to be loaded in memory at any time.
 * TODO:#49901: Change cache size once the virtualized history summary format is being written.
 * 		 This is so the summarizer doesn't have to reload every edit to generate summaries.
 * */
const loadedChunkCacheSize = Number.POSITIVE_INFINITY;

/**
 * Event fired when an edit is added to an `EditLog`.
 * @param edit - The edit that was added to the log
 * @param isLocal - true iff this edit was generated locally
 */
export type EditAddedHandler<TChange> = (edit: Edit<TChange>, isLocal: boolean, wasLocal: boolean) => void;

/**
 * The edit history log for SharedTree.
 * Contains only completed edits (no in-progress edits).
 * Ordered first by locality (acked or local), then by time of insertion.
 * May not contain more than one edit with the same ID.
 * @sealed
 */
export class EditLog<TChange> implements OrderedEditSet<TChange> {
	private localEditSequence = 0;

	private readonly sequencedEditIds: EditId[];
	private readonly editChunks: BTree<number, EditChunk<TChange>>;
	private readonly localEdits: Edit<TChange>[] = [];

	private readonly loadedChunkCache: number[] = [];
	private readonly maximumEvictableIndex: number;

	private readonly allEditIds: Map<EditId, OrderedEditId> = new Map();
	private readonly editAddedHandlers: EditAddedHandler<TChange>[] = [];

	/**
	 * Construct an `EditLog` using the given options.
	 * @param summary - An edit log summary used to populate the edit log.
	 */
	public constructor(summary: EditLogSummary<TChange> = { editIds: [], editChunks: [] }) {
		const { editChunks, editIds } = summary;

		this.editChunks = new BTree<number, EditChunk<TChange>>(undefined, compareFiniteNumbers);

		editChunks.forEach((editChunkOrHandle) => {
			const { startRevision, chunk } = editChunkOrHandle;

			if (Array.isArray(chunk)) {
				this.editChunks.set(startRevision, { edits: chunk });
			} else {
				this.editChunks.set(startRevision, {
					handle: chunk,
				});
			}
		});

		this.sequencedEditIds = editIds.slice();
		this.maximumEvictableIndex = this.numberOfSequencedEdits - 1;

		this.sequencedEditIds.forEach((id, index) => {
			const encounteredEditId = this.allEditIds.get(id);
			assert(encounteredEditId === undefined, 'Duplicate acked edit.');
			this.allEditIds.set(id, { isLocal: false, index });
		});
	}

	/**
	 * Registers a handler for when an edit is added to this `EditLog`.
	 */
	public registerEditAddedHandler(handler: EditAddedHandler<TChange>): void {
		this.editAddedHandlers.push(handler);
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
		return this.sequencedEditIds.length;
	}

	/**
	 * The number of local (unacked) edits in the log.
	 */
	public get numberOfLocalEdits(): number {
		return this.localEdits.length;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.editIds}
	 */
	public get editIds(): EditId[] {
		return this.sequencedEditIds.concat(this.localEdits.map(({ id }) => id));
	}

	/**
	 * @returns true iff the edit is contained in this 'EditLog' and it is a local edit (not sequenced).
	 */
	public isLocalEdit(editId: EditId): boolean {
		const entry = this.allEditIds.get(editId);
		return entry !== undefined && entry.isLocal;
	}

	/**
	 * @returns true iff the revision is a local revision (not sequenced).
	 */
	public isSequencedRevision(revision: number): boolean {
		return revision <= this.sequencedEditIds.length;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.tryGetIndexOfId}
	 */
	public tryGetIndexOfId(editId: EditId): number | undefined {
		const orderedEdit = this.allEditIds.get(editId);
		if (orderedEdit === undefined) {
			return undefined;
		}

		if (orderedEdit.isLocal) {
			const firstLocal = assertNotUndefined(this.allEditIds.get(this.localEdits[0].id));
			assert(firstLocal.isLocal);
			return this.numberOfSequencedEdits + orderedEdit.localSequence - firstLocal.localSequence;
		}
		return orderedEdit.index;
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getIndexOfId}
	 */
	public getIndexOfId(editId: EditId): number {
		return this.tryGetIndexOfId(editId) ?? fail('edit not found');
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.idOf}
	 */
	public getIdAtIndex(index: number): EditId {
		if (this.numberOfSequencedEdits <= index) {
			return this.localEdits[index - this.numberOfSequencedEdits].id;
		}

		return this.sequencedEditIds[index];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getAtIndex}
	 */
	public async getEditAtIndex(index: number): Promise<Edit<TChange>> {
		if (index < this.numberOfSequencedEdits) {
			const [startRevision, editChunk] = assertNotUndefined(this.editChunks.nextLowerPair(index + 1));
			const { handle, edits } = editChunk;

			if (edits === undefined) {
				assert(handle !== undefined, 'An edit chunk should include at least a handle or edits.');
				const edits = JSON.parse(IsoBuffer.from(await handle.get()).toString())
					.edits as EditWithoutId<TChange>[];

				// Make sure the loaded edit chunk is the correct size. If a higher starting revison is set, the length is the difference of both.
				// Otherwise, it means that there are no sequenced edits in memory so the length is the difference of the number of
				// sequenced edits and the starting revision.
				const nextKey = this.editChunks.nextHigherKey(index);
				const expectedEditLength =
					(nextKey === undefined ? this.numberOfSequencedEdits : nextKey) - startRevision;
				assert(edits.length === expectedEditLength, 'The chunk does not contain the correct number of edits.');

				editChunk.edits = edits;

				this.addKeyToCache(startRevision);
				return joinEditAndId(this.getIdAtIndex(index), edits[index - startRevision]);
			}

			return joinEditAndId(this.getIdAtIndex(index), edits[index - startRevision]);
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getAtIndexSynchronous}
	 */
	public getEditInSessionAtIndex(index: number): Edit<TChange> {
		assert(
			index > this.maximumEvictableIndex,
			'Edit to retrieve must have been added to the log during the current session.'
		);

		if (index < this.numberOfSequencedEdits) {
			const [startRevision, editChunk] = assertNotUndefined(this.editChunks.nextLowerPair(index + 1));
			const { edits } = editChunk;

			return joinEditAndId(
				this.getIdAtIndex(index),
				assertNotUndefined(edits, 'Edits should not have been evicted.')[index - startRevision]
			);
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.tryGetEdit}
	 */
	public async tryGetEdit(editId: EditId): Promise<Edit<TChange> | undefined> {
		try {
			const index = this.getIndexOfId(editId);
			return await this.getEditAtIndex(index);
		} catch {
			return undefined;
		}
	}

	/**
	 * @returns The edits of edit chunks that do not have associated edit handles, does not include the last edit chunk if it is not full.
	 */
	public *getEditChunksReadyForUpload(): Iterable<[number, EditWithoutId<TChange>[]]> {
		const maxStartRevision = this.editChunks.maxKey();

		if (maxStartRevision === undefined) {
			return;
		}

		for (const [startRevision, chunk] of this.editChunks.entries(undefined, [])) {
			if (chunk.handle === undefined) {
				const edits = assertNotUndefined(chunk.edits);

				// If there is no handle, the chunk should either not be the last chunk or should be full if it is.
				if (maxStartRevision !== startRevision || edits.length >= editsPerChunk) {
					yield [startRevision, edits];
				}
			}
		}
	}

	/**
	 * Assigns provided handles to edit chunks based on chunk index specified.
	 */
	public processEditChunkHandle(chunkHandle: EditHandle, startRevision: number): void {
		const chunk = assertNotUndefined(
			this.editChunks.get(startRevision),
			'A chunk handle op should not be received before the edit ops it corresponds to.'
		);
		assertNotUndefined(
			chunk.edits,
			'A chunk handle op should not be received before the edit ops it corresponds to.'
		);
		chunk.handle = chunkHandle;
		this.addKeyToCache(startRevision);
	}

	/**
	 * Sequences all local edits.
	 */
	public sequenceLocalEdits(): void {
		this.localEdits.slice().forEach((edit) => this.addSequencedEdit(edit));
	}

	/**
	 * Adds a sequenced (non-local) edit to the edit log.
	 * If the id of the supplied edit matches a local edit already present in the log, the local edit will be replaced.
	 */
	public addSequencedEdit(edit: Edit<TChange>): void {
		const { id, editWithoutId } = separateEditAndId(edit);

		// Remove the edit from local edits if it exists.
		const encounteredEditId = this.allEditIds.get(id);
		if (encounteredEditId !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(encounteredEditId.isLocal, 'Duplicate acked edit.');
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			const oldLocalEditId = assertNotUndefined(this.localEdits.shift(), 'Local edit should exist').id;
			assert(oldLocalEditId === id, 'Causal ordering should be upheld');
		}

		// The starting revision of the target edit chunk to be returned.
		const startRevision = this.numberOfSequencedEdits;
		// The edits of the target edit chunk to be returned.
		const edits: EditWithoutId<TChange>[] = [editWithoutId];

		const lastPair = this.editChunks.nextLowerPair(undefined);
		if (lastPair === undefined) {
			this.editChunks.set(startRevision, { edits });
		} else {
			// Add to the last edit chunk if it has room, otherwise create a new chunk.
			// If the chunk is undefined, this means a handle corresponding to a full chunk was received through a summary
			// and so a new chunk should be created.
			const { edits: lastEditChunk } = lastPair[1];
			if (lastEditChunk !== undefined && lastEditChunk.length < editsPerChunk) {
				lastEditChunk.push(editWithoutId);
			} else {
				this.editChunks.set(startRevision, { edits });
			}
		}

		this.sequencedEditIds.push(id);
		const sequencedEditId: SequencedOrderedEditId = { index: this.numberOfSequencedEdits - 1, isLocal: false };
		this.allEditIds.set(id, sequencedEditId);
		this.emitAdd(edit, false, encounteredEditId !== undefined);
	}

	/**
	 * @returns The last edit chunk i.e. the chunk which the most recent sequenced edits have been placed into, as well as its starting revision.
	 * Returns undefined iff there are no sequenced edits.
	 * When defined, this chunk is guaranteed to contain at least one edit
	 * (though it may be necessary to load the chunk via its handle to use it)
	 */
	public getLastEditChunk(): [startRevision: number, edits: EditChunk<TChange>] | undefined {
		return this.editChunks.nextLowerPair(undefined);
	}

	/**
	 * Adds a non-sequenced (local) edit to the edit log.
	 * Duplicate edits are ignored.
	 */
	public addLocalEdit(edit: Edit<TChange>): void {
		this.localEdits.push(edit);
		const localEditId: LocalOrderedEditId = { localSequence: this.localEditSequence++, isLocal: true };
		this.allEditIds.set(edit.id, localEditId);
		this.emitAdd(edit, true, false);
	}

	private emitAdd(editAdded: Edit<TChange>, isLocal: boolean, wasLocal: boolean): void {
		for (const handler of this.editAddedHandlers) {
			handler(editAdded, isLocal, wasLocal);
		}
	}

	/**
	 * @returns true iff this `EditLog` and `other` are equivalent, regardless of locality.
	 */
	public equals<TOtherChangeTypes>(other: EditLog<TOtherChangeTypes>): boolean {
		// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
		// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
		return compareArrays(this.editIds, other.editIds);
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getEditLogSummary}
	 */
	public getEditLogSummary(useHandles = false): EditLogSummary<TChange> {
		if (useHandles) {
			return {
				editChunks: this.editChunks.toArray().map(([startRevision, { handle, edits }]) => {
					return {
						startRevision,
						chunk: handle ?? edits ?? fail('An edit chunk must have either a handle or a list of edits.'),
					};
				}),
				editIds: this.sequencedEditIds,
			};
		}

		// TODO:#49901: When writing format version 0.1.0, change to prefer sending the handle when not undefined.
		// For now, no chunks are evicted so edits are sent as is to be aggregated during summary write.
		return {
			editChunks: this.editChunks.toArray().map(([startRevision, { edits }]) => {
				return { startRevision, chunk: assertNotUndefined(edits) };
			}),
			editIds: this.sequencedEditIds,
		};
	}

	private addKeyToCache(newKey: number): void {
		// Indices are only added to the cache if they are not higher than the maximum evicted index.
		if (newKey <= this.maximumEvictableIndex) {
			// If the new index is already in the cache, remove it first to update its last usage.
			if (newKey in this.loadedChunkCache) {
				this.loadedChunkCache.splice(this.loadedChunkCache.indexOf(newKey), 1);
			}

			this.loadedChunkCache.push(newKey);

			// If the cache is out of space, evict the oldest index in the cache.
			if (this.loadedChunkCache.length > loadedChunkCacheSize) {
				const indexToEvict = assertNotUndefined(this.loadedChunkCache.shift());
				const chunkToEvict = assertNotUndefined(
					this.editChunks.get(indexToEvict),
					'Chunk start revision added to cache should exist in the edit log.'
				);
				chunkToEvict.edits = undefined;
			}
		}
	}
}
