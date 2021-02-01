/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from 'sorted-btree';
import { ISerializedHandle } from '@fluidframework/core-interfaces';
import { IsoBuffer } from '@fluidframework/common-utils';
import { assert, assertNotUndefined, compareArrays, fail } from './Common';
import { Edit, EditWithoutId } from './PersistedTypes';
import { EditId } from './Identifiers';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
 * Edits are virtualized, however, edits added during the current session are guaranteed to be available
 * synchronously.
 * @public
 * @sealed
 */
export interface OrderedEditSet {
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
	 * @returns the edit at the given index within this `OrderedEditSet`.
	 */
	getEditAtIndex(index: number): Promise<Edit>;

	/**
	 * @returns the edit at the given index. Must have been added to the log during the current session.
	 */
	getEditInSessionAtIndex(index: number): Edit;

	/**
	 * @returns the Edit associated with the EditId or undefined if there is no such edit in the set.
	 */
	tryGetEdit(editId: EditId): Promise<Edit | undefined>;

	/**
	 * @returns the list of edits that do not have associated blob handles.
	 * @internal
	 */
	getEditLogSummary(virtualized?: boolean): EditLogSummary;
}

/**
 * Information used to populate an edit log.
 * @internal
 */
export interface EditLogSummary {
	/**
	 * A of list of serialized chunks and their corresponding keys.
	 * Keys are the index of the first edit in the chunk in relation to the edit log.
	 */
	readonly editChunks: readonly { key: number; chunk: SerializedChunk }[];

	/**
	 * A list of edits IDs for all sequenced edits.
	 */
	readonly editIds: readonly EditId[];
}

/**
 * EditHandles are used to load edit chunks stored outside of the EditLog.
 * Can be satisfied by IFluidHandle<ArrayBufferLike>.
 */
export interface EditHandle {
	get: () => Promise<ArrayBufferLike>;
}

/**
 * Helpers used to serialize and deserialize fields on EditLogSummary.
 */
interface SerializationHelpers {
	/** JSON serializes a handle that corresponds to an uploaded edit chunk. */
	serializeHandle: (handle: EditHandle) => ISerializedHandle;

	/** Deserializes a JSON serialized handle into a fluid handle that can be used to retrieve uploaded blobs.  */
	deserializeHandle: (serializedHandle: ISerializedHandle) => EditHandle;
}

interface SequencedOrderedEditId {
	readonly isLocal: false;
	readonly index: number;
}

interface LocalOrderedEditId {
	readonly isLocal: true;
	readonly localSequence: number;
}

interface EditChunk {
	handle?: EditHandle;
	edits?: EditWithoutId[];
}

/**
 * Either a chunk of edits or a serialized handle that can be used to load that chunk.
 */
type SerializedChunk = ISerializedHandle | EditWithoutId[];

type OrderedEditId = SequencedOrderedEditId | LocalOrderedEditId;

/**
 * Returns an object that separates an Edit into two fields, id and editWithoutId.
 */
export function separateEditAndId(edit: Edit): { id: EditId; editWithoutId: EditWithoutId } {
	const editWithoutId = { ...edit, id: undefined };
	delete editWithoutId.id;
	return { id: edit.id, editWithoutId };
}

function joinEditAndId(id: EditId, edit: EditWithoutId): Edit {
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
export type EditAddedHandler = (edit: Edit, isLocal: boolean) => void;

/**
 * The edit history log for SharedTree.
 * Contains only completed edits (no in-progress edits).
 * Ordered first by locality (acked or local), then by time of insertion.
 * May not contain more than one edit with the same ID.
 * @sealed
 */
export class EditLog implements OrderedEditSet {
	private localEditSequence = 0;

	private readonly sequencedEditIds: EditId[];
	private readonly editChunks: BTree<number, EditChunk>;
	private readonly localEdits: Edit[] = [];

	private readonly loadedChunkCache: number[] = [];
	private readonly maximumEvictableIndex: number;

	private readonly allEditIds: Map<EditId, OrderedEditId> = new Map();
	private readonly editAddedHandlers: EditAddedHandler[] = [];

	private readonly serializationHelpers?: SerializationHelpers;

	/**
	 * Construct an `EditLog` using the given options.
	 */
	public constructor(options?: EditLogSummary, serializationHelpers?: SerializationHelpers) {
		const editLogSummary = options || { editIds: [], editChunks: [] };
		const { editChunks, editIds } = editLogSummary;

		this.serializationHelpers = serializationHelpers;

		this.editChunks = new BTree<number, EditChunk>();

		editChunks.forEach((serializedChunk) => {
			const { key, chunk } = serializedChunk;

			if (Array.isArray(chunk)) {
				this.editChunks.set(key, { edits: chunk });
			} else {
				this.editChunks.set(key, {
					handle: assertNotUndefined(
						this.serializationHelpers,
						'Edit logs that store handles should have serialization helpers.'
					).deserializeHandle(chunk),
				});
			}
		});

		this.sequencedEditIds = editIds.slice();
		this.maximumEvictableIndex = this.numberOfSequencedEdits - 1;

		this.sequencedEditIds.forEach((id, index) => this.allEditIds.set(id, { isLocal: false, index }));
	}

	/**
	 * Registers a handler for when an edit is added to this `EditLog`.
	 */
	public registerEditAddedHandler(handler: EditAddedHandler): void {
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
	 * Returns all edit IDs in the log (sequenced and local).
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
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.indexOf}
	 */
	public getIndexOfId(editId: EditId): number {
		const orderedEdit = this.allEditIds.get(editId) ?? fail('edit not found');

		if (orderedEdit.isLocal) {
			const firstLocal = assertNotUndefined(this.allEditIds.get(this.localEdits[0].id));
			assert(firstLocal.isLocal);
			return this.numberOfSequencedEdits + orderedEdit.localSequence - firstLocal.localSequence;
		}
		return orderedEdit.index;
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
	public async getEditAtIndex(index: number): Promise<Edit> {
		if (index < this.numberOfSequencedEdits) {
			const [key, editChunk] = assertNotUndefined(this.editChunks.nextLowerPair(index + 1));
			const { handle, edits } = editChunk;

			if (edits === undefined) {
				assert(handle !== undefined, 'An edit chunk should include at least a handle or edits.');
				const edits = JSON.parse(IsoBuffer.from(await handle.get()).toString()).edits as EditWithoutId[];

				// Make sure the loaded edit chunk is the correct size. If a higher key is set, the length is the difference of both.
				// Otherwise, it means that there are no sequenced edits in memory so the length is the difference of the number of
				// sequenced edits and the key.
				const nextKey = this.editChunks.nextHigherKey(index);
				const expectedEditLength = (nextKey === undefined ? this.numberOfSequencedEdits : nextKey) - key;
				assert(edits.length === expectedEditLength, 'The chunk does not contain the correct number of edits.');

				editChunk.edits = edits;

				this.addKeyToCache(key);
				return joinEditAndId(this.getIdAtIndex(index), edits[index - key]);
			}

			return joinEditAndId(this.getIdAtIndex(index), edits[index - key]);
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.getAtIndexSynchronous}
	 */
	public getEditInSessionAtIndex(index: number): Edit {
		assert(
			index > this.maximumEvictableIndex,
			'Edit to retrieve must have been added to the log during the current session.'
		);

		if (index < this.numberOfSequencedEdits) {
			const [key, editChunk] = assertNotUndefined(this.editChunks.nextLowerPair(index + 1));
			const { edits } = editChunk;

			return joinEditAndId(
				this.getIdAtIndex(index),
				assertNotUndefined(edits, 'Edits should not have been evicted.')[index - key]
			);
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc @intentional/shared-tree#OrderedEditSet.tryGetEdit}
	 */
	public async tryGetEdit(editId: EditId): Promise<Edit | undefined> {
		try {
			const index = this.getIndexOfId(editId);
			return await this.getEditAtIndex(index);
		} catch {
			return undefined;
		}
	}

	/**
	 * Assigns provided handles to edit chunks based on chunk index specified.
	 */
	public processEditChunkHandle(chunkHandle: EditHandle, chunkKey: number): void {
		const chunk = assertNotUndefined(
			this.editChunks.get(chunkKey),
			'A chunk handle op should not be received before the edit ops it corresponds to.'
		);
		assertNotUndefined(
			chunk.edits,
			'A chunk handle op should not be received before the edit ops it corresponds to.'
		);
		chunk.handle = chunkHandle;
		this.addKeyToCache(chunkKey);
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
	public addSequencedEdit(edit: Edit): void {
		const { id, editWithoutId } = separateEditAndId(edit);
		const maxChunkKey = this.editChunks.maxKey();
		if (maxChunkKey === undefined) {
			this.editChunks.set(0, { edits: [editWithoutId] });
		} else {
			// Add to the last edit chunk if it has room, otherwise create a new chunk.
			// If the chunk is undefined, this means a handle corresponding to a full chunk was received through a summary
			// and so a new chunk should be created.
			const { edits: lastEditChunk } = assertNotUndefined(this.editChunks.get(maxChunkKey));
			if (lastEditChunk !== undefined && lastEditChunk.length < editsPerChunk) {
				lastEditChunk.push(editWithoutId);
			} else {
				this.editChunks.set(this.numberOfSequencedEdits, { edits: [editWithoutId] });
			}
		}

		// Remove the edit from local edits if it exists.
		const encounteredEditId = this.allEditIds.get(id);
		if (encounteredEditId !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(encounteredEditId.isLocal, 'Duplicate acked edit.');
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			const oldLocalEditId = assertNotUndefined(this.localEdits.shift(), 'Local edit should exist').id;
			assert(oldLocalEditId === id, 'Causal ordering should be upheld');
		}

		this.sequencedEditIds.push(id);
		const sequencedEditId: SequencedOrderedEditId = { index: this.numberOfSequencedEdits - 1, isLocal: false };
		this.allEditIds.set(id, sequencedEditId);
		this.emitAdd(edit, false);
	}

	/**
	 * Adds a non-sequenced (local) edit to the edit log.
	 * Duplicate edits are ignored.
	 */
	public addLocalEdit(edit: Edit): void {
		this.localEdits.push(edit);
		const localEditId: LocalOrderedEditId = { localSequence: this.localEditSequence++, isLocal: true };
		this.allEditIds.set(edit.id, localEditId);
		this.emitAdd(edit, true);
	}

	private emitAdd(editAdded: Edit, isLocal: boolean): void {
		for (const handler of this.editAddedHandlers) {
			handler(editAdded, isLocal);
		}
	}

	/**
	 * @returns true iff this `EditLog` and `other` are equivalent, regardless of locality.
	 */
	public equals(other: EditLog): boolean {
		// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
		// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
		return compareArrays(this.editIds, other.editIds);
	}

	/**
	 * Returns information about the edit log.
	 */
	public getEditLogSummary(virtualized?: boolean): EditLogSummary {
		if (virtualized) {
			return {
				editChunks: this.editChunks.toArray().map(([key, { handle, edits }]) => {
					if (handle !== undefined) {
						return {
							key,
							chunk: assertNotUndefined(
								this.serializationHelpers,
								'Edit logs that store handles should include serialization helpers.'
							).serializeHandle(handle),
						};
					}
					return { key, chunk: assertNotUndefined(edits) };
				}),
				editIds: this.sequencedEditIds,
			};
		}

		// TODO:#49901: When writing format version 0.1.0, change to prefer sending the handle when not undefined.
		// For now, no chunks are evicted so edits are sent as is to be aggregated during summary write.
		return {
			editChunks: this.editChunks.toArray().map(([key, { edits }]) => {
				return { key, chunk: assertNotUndefined(edits) };
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
					'Chunk key added to cache should exist in the edit log.'
				);
				chunkToEvict.edits = undefined;
			}
		}
	}
}
