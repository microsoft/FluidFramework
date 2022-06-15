/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import BTree from 'sorted-btree';
import { TypedEventEmitter } from '@fluidframework/common-utils';
import type { IEvent, ITelemetryLogger } from '@fluidframework/common-definitions';
import { assert, assertNotUndefined, compareArrays, compareFiniteNumbers, fail } from './Common';
import type { EditId } from './Identifiers';
import type { StringInterner } from './StringInterner';
import { Edit, EditLogSummary, editsPerChunk, EditWithoutId, FluidEditHandle } from './persisted-types';
import { SharedTreeDiagnosticEvent } from './EventTypes';
import type { ChangeCompressor } from './ChangeCompression';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
 * Edits are virtualized, however, edits added during the current session are guaranteed to be available
 * synchronously.
 * @public
 * @sealed
 */
export interface OrderedEditSet<TChange = unknown> {
	/**
	 * The length of this `OrderedEditSet`.
	 */
	readonly length: number;

	/**
	 * The edit IDs of all edits in the log.
	 */
	readonly editIds: readonly EditId[];

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
}

/**
 * Server-provided metadata for edits that have been sequenced.
 */
export interface EditSequencingInfo {
	/**
	 * The server-assigned sequence number of the op.
	 */
	readonly sequenceNumber: number;
	/**
	 * Last known sequenced edit at the time this op was issued.
	 */
	readonly referenceSequenceNumber: number;
}

/**
 * Server-provided metadata for edits that have been sequenced.
 */
export interface MessageSequencingInfo extends EditSequencingInfo {
	/**
	 * Last sequenced edit that all clients are guaranteed to be aware of.
	 * If not specified, then some clients have not seen any edits yet.
	 */
	readonly minimumSequenceNumber?: number;
}

/**
 * Metadata for a sequenced edit.
 */
export interface SequencedOrderedEditId {
	readonly isLocal: false;
	readonly index: number;
	/**
	 * Information about the edit's relationship to other sequenced edits.
	 * Undefined iff the edit was loaded from a summary.
	 */
	readonly sequenceInfo?: EditSequencingInfo;
}

/**
 * Metadata for a local edit.
 */
export interface LocalOrderedEditId {
	readonly isLocal: true;
	readonly localSequence: number;
}

/**
 * Metadata for an edit.
 */
export type OrderedEditId = SequencedOrderedEditId | LocalOrderedEditId;

/**
 * Compressor+interner pair used for encoding an {@link EditLog} into a summary.
 * @internal
 */
export interface EditLogEncoder {
	compressor: ChangeCompressor;
	interner: StringInterner;
}

/**
 * A sequence of edits that may or may not need to be downloaded into the EditLog from an external service
 */
export interface EditChunk<TChange> {
	handle?: EditHandle<TChange>;
	edits?: EditWithoutId<TChange>[];
}

/**
 * EditHandles are used to load edit chunks stored outside of the EditLog.
 * This is typically implemented by a wrapper around an IFluidHandle<ArrayBufferLike>.
 * @public
 */
export interface EditHandle<TChange> {
	readonly get: () => Promise<EditWithoutId<TChange>[]>;
	readonly baseHandle: FluidEditHandle;
}

/**
 * Returns an object that separates an Edit into two fields, id and editWithoutId.
 */
export function separateEditAndId<TChange>(edit: Edit<TChange>): {
	id: EditId;
	editWithoutId: EditWithoutId<TChange>;
} {
	const editWithoutId = { ...edit, id: undefined };
	delete editWithoutId.id;
	return { id: edit.id, editWithoutId };
}

function joinEditAndId<TChange>(id: EditId, edit: EditWithoutId<TChange>): Edit<TChange> {
	return { id, ...edit };
}

/**
 * @param summary - The edit log summary to parse.
 * @returns the number of handles saved to the provided edit log summary.
 */
export function getNumberOfHandlesFromEditLogSummary(summary: EditLogSummary<unknown, unknown>): number {
	const { editChunks } = summary;

	let numberOfHandles = 0;
	editChunks.forEach(({ chunk }) => {
		if (!Array.isArray(chunk)) {
			numberOfHandles++;
		}
	});

	return numberOfHandles;
}

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
 * Events which may be emitted by `EditLog`.
 * @public
 */
export interface IEditLogEvents extends IEvent {
	(event: 'unexpectedHistoryChunk', listener: () => void);
}

/**
 * The edit history log for SharedTree.
 * Contains only completed edits (no in-progress edits).
 * Ordered first by locality (acked or local), then by time of insertion.
 * May not contain more than one edit with the same ID.
 * @sealed
 */
export class EditLog<TChange = unknown> extends TypedEventEmitter<IEditLogEvents> implements OrderedEditSet<TChange> {
	private localEditSequence = 0;
	private _minSequenceNumber = 0;

	private readonly sequencedEditIds: EditId[];
	private readonly editChunks: BTree<number, EditChunk<TChange>>;
	private readonly localEdits: Edit<TChange>[] = [];
	private readonly loadedChunkCache: number[] = [];
	private readonly indexOfFirstEditInSession: number;
	private readonly maximumEvictableIndex: number;

	private readonly allEditIds: Map<EditId, OrderedEditId> = new Map();
	private readonly _editAddedHandlers: Set<EditAddedHandler<TChange>> = new Set();

	private readonly logger?: ITelemetryLogger;

	/**
	 * The number of edits associated with each blob.
	 */
	public readonly editsPerChunk: number;

	/**
	 * @returns The index of the earliest edit available through `getEditInSessionAtIndex`.
	 */
	public get earliestAvailableEditIndex(): number {
		return this.maximumEvictableIndex + 1;
	}

	/**
	 * @returns The sequence number of the latest edit known by all nodes.
	 */
	public get minSequenceNumber(): number {
		return this._minSequenceNumber;
	}

	/**
	 * Construct an `EditLog` using the given options.
	 * @param summary - An edit log summary used to populate the edit log.
	 * @param logger - An optional logger to record telemetry/errors
	 */
	public constructor(
		summary: EditLogSummary<TChange, EditHandle<TChange>> = { editIds: [], editChunks: [] },
		logger?: ITelemetryLogger,
		editAddedHandlers: readonly EditAddedHandler<TChange>[] = [],
		indexOfFirstEditInSession = summary.editIds.length
	) {
		super();
		const { editChunks, editIds } = summary;
		this.logger = logger;
		this.editsPerChunk = editsPerChunk;

		for (const handler of editAddedHandlers) {
			this.registerEditAddedHandler(handler);
		}

		this.editChunks = new BTree<number, EditChunk<TChange>>(undefined, compareFiniteNumbers);

		editChunks.forEach((editChunkOrHandle) => {
			const { startRevision, chunk } = editChunkOrHandle;

			if (isEditHandle(chunk)) {
				this.editChunks.set(startRevision, { handle: chunk });
			} else {
				this.editChunks.set(startRevision, { edits: chunk as EditWithoutId<TChange>[] });
			}
		});

		this.sequencedEditIds = editIds.slice();

		this.indexOfFirstEditInSession = indexOfFirstEditInSession;
		this.maximumEvictableIndex = this.indexOfFirstEditInSession - 1;

		this.sequencedEditIds.forEach((id, index) => {
			const encounteredEditId = this.allEditIds.get(id);
			assert(encounteredEditId === undefined, 'Duplicate acked edit.');
			this.allEditIds.set(id, { isLocal: false, index });
		});
	}

	/**
	 * Registers a handler for when an edit is added to this `EditLog`.
	 * @returns A callback which can be invoked to unregister this handler.
	 */
	public registerEditAddedHandler(handler: EditAddedHandler<TChange>): () => void {
		this._editAddedHandlers.add(handler);
		return () => this._editAddedHandlers.delete(handler);
	}

	/**
	 * @returns the `EditAddedHandler`s registered on this `EditLog`.
	 */
	public get editAddedHandlers(): readonly EditAddedHandler<TChange>[] {
		return Array.from(this._editAddedHandlers);
	}

	/**
	 * {@inheritDoc OrderedEditSet.length}
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
	 * {@inheritDoc OrderedEditSet.editIds}
	 */
	public get editIds(): EditId[] {
		return this.sequencedEditIds.concat(this.localEdits.map(({ id }) => id));
	}

	/**
	 * @returns true iff the edit is contained in this 'EditLog' and it is a local edit (not sequenced).
	 */
	public isLocalEdit(editId: EditId): boolean {
		const entry = this.allEditIds.get(editId);
		return entry?.isLocal ?? false;
	}

	/**
	 * @returns true iff the revision is a sequenced revision (not local).
	 */
	public isSequencedRevision(revision: number): boolean {
		return revision <= this.sequencedEditIds.length;
	}

	/**
	 * {@inheritDoc OrderedEditSet.tryGetIndexOfId}
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
	 * @returns Edit metadata for the edit with the given `editId`.
	 */
	public getOrderedEditId(editId: EditId): OrderedEditId {
		return assertNotUndefined(this.allEditIds.get(editId), 'All edits should exist in this map');
	}

	/**
	 * {@inheritDoc OrderedEditSet.getIndexOfId}
	 */
	public getIndexOfId(editId: EditId): number {
		return this.tryGetIndexOfId(editId) ?? fail('edit not found');
	}

	/**
	 * {@inheritDoc OrderedEditSet.getIdAtIndex}
	 */
	public getIdAtIndex(index: number): EditId {
		if (this.numberOfSequencedEdits <= index) {
			return this.localEdits[index - this.numberOfSequencedEdits].id;
		}

		return this.sequencedEditIds[index];
	}

	/**
	 * {@inheritDoc OrderedEditSet.getEditAtIndex}
	 */
	public async getEditAtIndex(index: number): Promise<Edit<TChange>> {
		if (index < this.numberOfSequencedEdits) {
			const [startRevision, editChunk] = assertNotUndefined(this.editChunks.getPairOrNextLower(index));
			const { handle, edits } = editChunk;

			if (edits === undefined) {
				assert(handle !== undefined, 'An edit chunk should include at least a handle or edits.');
				const edits = await handle.get();

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
	 * {@inheritDoc OrderedEditSet.getEditInSessionAtIndex}
	 */
	public getEditInSessionAtIndex(index: number): Edit<TChange> {
		assert(
			index > this.maximumEvictableIndex,
			'Edit to retrieve must have been added to the log during the current session.'
		);

		if (index < this.numberOfSequencedEdits) {
			const [startRevision, editChunk] = assertNotUndefined(this.editChunks.getPairOrNextLower(index));
			const { edits } = editChunk;

			return joinEditAndId(
				this.getIdAtIndex(index),
				assertNotUndefined(edits, 'Edits should not have been evicted.')[index - startRevision]
			);
		}

		assert(index - this.numberOfSequencedEdits < this.localEdits.length, 'Edit to retrieve must be in the log.');
		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc OrderedEditSet.tryGetEdit}
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
	public *getEditChunksReadyForUpload(): Iterable<[number, readonly EditWithoutId<TChange>[]]> {
		const maxStartRevision = this.editChunks.maxKey();

		if (maxStartRevision === undefined) {
			return;
		}

		for (const [startRevision, chunk] of this.editChunks.entries(undefined, [])) {
			if (chunk.handle === undefined) {
				const edits = assertNotUndefined(chunk.edits);

				// If there is no handle, the chunk should either not be the last chunk or should be full if it is.
				if (maxStartRevision !== startRevision || edits.length >= this.editsPerChunk) {
					yield [startRevision, edits];
				}
			}
		}
	}

	/**
	 * Assigns provided handles to edit chunks based on chunk index specified.
	 */
	public processEditChunkHandle(chunkHandle: EditHandle<TChange>, startRevision: number): void {
		const chunk = this.editChunks.get(startRevision);
		if (chunk !== undefined) {
			assertNotUndefined(
				chunk.edits,
				'A chunk handle op should not be received before the edit ops it corresponds to.'
			);
			chunk.handle = chunkHandle;
			this.addKeyToCache(startRevision);
		} else {
			this.logger?.sendErrorEvent({ eventName: 'UnexpectedHistoryChunk' });
			this.emit(SharedTreeDiagnosticEvent.UnexpectedHistoryChunk);
		}
	}

	/**
	 * Sequences all local edits.
	 */
	public sequenceLocalEdits(): void {
		this.localEdits.slice().forEach((edit) => this.addSequencedEditInternal(edit));
	}

	/**
	 * Adds a sequenced (non-local) edit to the edit log.
	 * If the id of the supplied edit matches a local edit already present in the log, the local edit will be replaced.
	 *
	 */
	public addSequencedEdit(edit: Edit<TChange>, message: MessageSequencingInfo): void {
		this.addSequencedEditInternal(edit, message, message.minimumSequenceNumber);
	}

	/**
	 * Returns all local edits from this EditLog
	 * This is useful for op format upgrades, which might warrant re-submission of these ops using the new format.
	 * See the breaking change documentation for more information.
	 */
	public *getLocalEdits(): Iterable<Edit<TChange>> {
		for (const edit of this.localEdits) {
			yield edit;
		}
	}

	/**
	 * Adds a sequenced (non-local) edit to the edit log.
	 * If the id of the supplied edit matches a local edit already present in the log, the local edit will be replaced.
	 */
	private addSequencedEditInternal(
		edit: Edit<TChange>,
		info?: EditSequencingInfo,
		minSequenceNumber: number = 0
	): void {
		const { id, editWithoutId } = separateEditAndId(edit);

		assert(
			minSequenceNumber >= this.minSequenceNumber,
			'Sequenced edits should carry a monotonically increasing min number'
		);
		// The new minSequenceNumber indicates that no future edit will require information from edits with a smaller or equal seq number
		// for its resolution.
		this._minSequenceNumber = minSequenceNumber;
		// TODO:#57176: Increment maximumEvictableIndex to reflect the fact we can now evict edits with a sequenceNumber lower or equal to
		// it. Note that this will change the meaning of our 'InSession' APIs so we should make sure to rename them at the same time.
		// The code might look like this:
		// while (this.maximumEvictableIndex + 1 < this.indexOfFirstEditInSession) {
		// 	const nextEdit = this.getEditInSessionAtIndex(this.maximumEvictableIndex + 1);
		// 	const nextEditInfo = this.getOrderedEditId(nextEdit.id) as SequencedOrderedEditId;
		// 	if (
		// 		nextEditInfo.sequenceInfo !== undefined &&
		// 		nextEditInfo.sequenceInfo.sequenceNumber > minSequenceNumber
		// 	) {
		// 		break;
		// 	}
		// 	++this.maximumEvictableIndex;
		// }

		// Remove the edit from local edits if it exists.
		const encounteredEditId = this.allEditIds.get(id);
		if (encounteredEditId !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(encounteredEditId.isLocal, 'Duplicate acked edit.');
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			const oldLocalEditId = assertNotUndefined(this.localEdits.shift(), 'Local edit should exist').id;
			assert(oldLocalEditId === id, 'Causal ordering should be upheld');
		}

		// The starting revision for a newly created chunk.
		const startRevision = this.numberOfSequencedEdits;
		// The initial edits for a newly created chunk.
		const edits: EditWithoutId<TChange>[] = [editWithoutId];

		const lastPair = this.editChunks.nextLowerPair(undefined);
		if (lastPair === undefined) {
			this.editChunks.set(startRevision, { edits });
		} else {
			// Add to the last edit chunk if it has room and hasn't already been uploaded, otherwise create a new chunk.
			// If the chunk has a corresponding handle, create a new chunk.
			const { edits: lastEditChunk, handle } = lastPair[1];
			if (handle === undefined && lastEditChunk !== undefined && lastEditChunk.length < this.editsPerChunk) {
				lastEditChunk.push(editWithoutId);
			} else {
				assert(
					handle !== undefined || lastEditChunk !== undefined,
					'An edit chunk must have either a handle or a list of edits.'
				);
				this.editChunks.set(startRevision, { edits });
			}
		}

		this.sequencedEditIds.push(id);
		const sequencedEditId: SequencedOrderedEditId = {
			index: this.numberOfSequencedEdits - 1,
			isLocal: false,
			sequenceInfo: info,
		};
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
		for (const handler of this._editAddedHandlers) {
			handler(editAdded, isLocal, wasLocal);
		}
	}

	/**
	 * @returns true iff this `EditLog` and `other` are equivalent, regardless of locality.
	 */
	public equals<TOtherChangeTypesInternal>(other: EditLog<TOtherChangeTypesInternal>): boolean {
		// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
		// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
		return compareArrays(this.editIds, other.editIds);
	}

	/**
	 * @returns the summary of this `OrderedEditSet` that can be used to reconstruct the edit set.
	 * @internal
	 */
	public getEditLogSummary(): EditLogSummary<TChange, FluidEditHandle>;
	/**
	 * @param compressEdit - a function which compresses edits
	 * @returns the summary of this `OrderedEditSet` that can be used to reconstruct the edit set.
	 * @internal
	 */
	public getEditLogSummary<TCompressedChange>(
		compressEdit: (edit: Pick<Edit<TChange>, 'changes'>) => Pick<Edit<TCompressedChange>, 'changes'>
	): EditLogSummary<TCompressedChange, FluidEditHandle>;
	public getEditLogSummary<TCompressedChange>(
		compressEdit?: (edit: Pick<Edit<TChange>, 'changes'>) => Pick<Edit<TCompressedChange>, 'changes'>
	): EditLogSummary<TChange, FluidEditHandle> | EditLogSummary<TCompressedChange, FluidEditHandle> {
		return compressEdit !== undefined
			? {
					editChunks: this.editChunks.toArray().map(([startRevision, { handle, edits }]) => ({
						startRevision,
						chunk:
							handle?.baseHandle ??
							edits?.map((edit) => compressEdit(edit)) ??
							fail('An edit chunk must have either a handle or a list of edits.'),
					})),
					editIds: this.sequencedEditIds,
			  }
			: {
					editChunks: this.editChunks.toArray().map(([startRevision, { handle, edits }]) => ({
						startRevision,
						chunk:
							handle?.baseHandle ??
							edits ??
							fail('An edit chunk must have either a handle or a list of edits.'),
					})),
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

function isEditHandle<TChange>(
	chunk: EditHandle<TChange> | readonly EditWithoutId<unknown>[]
): chunk is EditHandle<TChange> {
	return !Array.isArray(chunk);
}
