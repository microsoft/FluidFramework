/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from '@fluidframework/common-utils';
import type { IEvent, ITelemetryLogger } from '@fluidframework/common-definitions';
import { assert, assertNotUndefined, compareArrays, fail } from './Common';
import type { EditId } from './Identifiers';
import type { StringInterner } from './StringInterner';
import { Edit, EditLogSummary, EditWithoutId, FluidEditHandle } from './persisted-types';
import type { ChangeCompressor } from './ChangeCompression';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
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
	tryGetEditAtIndex(index: number): Edit<TChange> | undefined;

	/**
	 * @returns the edit with the given identifier within this `OrderedEditSet`.
	 */
	tryGetEditFromId(editId: EditId): Edit<TChange> | undefined;

	/**
	 * @returns the Edit associated with the EditId or undefined if there is no such edit in the set.
	 * @deprecated Edit virtualization is no longer supported. Don't use the asynchronous APIs. Instead, use {@link OrderedEditSet.tryGetEditFromId}.
	 */
	tryGetEdit(editId: EditId): Promise<Edit<TChange> | undefined>;

	/**
	 * @returns the edit at the given index within this `OrderedEditSet`.
	 * @deprecated Edit virtualization is no longer supported. Don't use the asynchronous APIs.
	 */
	getEditAtIndex(index: number): Promise<Edit<TChange>>;

	/**
	 * @returns the edit at the given index. Must have been added to the log during the current session.
	 * @deprecated this will be removed in favor of {@link OrderedEditSet.tryGetEditAtIndex}
	 */
	getEditInSessionAtIndex(index: number): Edit<TChange>;
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
 * @deprecated Edit virtualization is no longer supported.
 */
export interface EditChunk<TChange> {
	handle?: EditHandle<TChange>;
	edits?: EditWithoutId<TChange>[];
}
/**
 * EditHandles are used to load edit chunks stored outside of the EditLog.
 * This is typically implemented by a wrapper around an IFluidHandle<ArrayBufferLike>.
 * @deprecated Edit virtualization is no longer supported.
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

/**
 * @param summary - The edit log summary to parse.
 * @returns the number of handles saved to the provided edit log summary.
 * @deprecated Edit virtualization is no longer supported.
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

	private readonly sequencedEdits: Edit<TChange>[] = [];
	private readonly localEdits: Edit<TChange>[] = [];
	private readonly indexOfFirstEditInMemory: number;

	private readonly allEditIds: Map<EditId, OrderedEditId> = new Map();
	private readonly _editAddedHandlers: Set<EditAddedHandler<TChange>> = new Set();

	/**
	 * @returns The index of the earliest edit stored in this log.
	 */
	public get earliestAvailableEditIndex(): number {
		return this.indexOfFirstEditInMemory;
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
		private readonly logger?: ITelemetryLogger,
		editAddedHandlers: readonly EditAddedHandler<TChange>[] = [],
		indexOfFirstEditInSession = summary.editIds.length
	) {
		super();
		const { editChunks, editIds } = summary;

		for (const handler of editAddedHandlers) {
			this.registerEditAddedHandler(handler);
		}

		editChunks.forEach((editChunkOrHandle) => {
			const { startRevision, chunk } = editChunkOrHandle;

			if (Array.isArray(chunk)) {
				for (const [index, edit] of chunk.entries()) {
					const editIndex = startRevision + index;
					const id = editIds[editIndex];
					this.sequencedEdits.push({ id, ...edit });
					const encounteredEditId = this.allEditIds.get(id);
					assert(encounteredEditId === undefined, 'Duplicate acked edit.');
					this.allEditIds.set(id, { isLocal: false, index: editIndex });
				}
			} else {
				// Ignore any edit handles, these edits are now unrecoverable.
				// This should instead download the edit chunk and store them but history is not
				// being used so we're going with the simpler solution.
				this.logger?.sendErrorEvent({ eventName: 'UnexpectedEditHandleInSummary' });
			}
		});

		this.indexOfFirstEditInMemory = indexOfFirstEditInSession;
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
		return this.sequencedEdits.length;
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
		return this.sequencedEdits.map(({ id }) => id).concat(this.localEdits.map(({ id }) => id));
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
		return revision <= this.sequencedEdits.length;
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

		return this.sequencedEdits[index].id;
	}

	/**
	 * {@inheritDoc OrderedEditSet.tryGetEditAtIndex}
	 */
	public tryGetEditAtIndex(index: number): Edit<TChange> | undefined {
		if (index < this.numberOfSequencedEdits) {
			return this.sequencedEdits[index];
		}

		return this.localEdits[index - this.numberOfSequencedEdits];
	}

	/**
	 * {@inheritDoc OrderedEditSet.tryGetEditFromId}
	 */
	public tryGetEditFromId(editId: EditId): Edit<TChange> | undefined {
		const index = this.tryGetIndexOfId(editId);
		return index !== undefined ? this.tryGetEditAtIndex(index) : undefined;
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

		const { id } = edit;

		// Remove the edit from local edits if it exists.
		const encounteredEditId = this.allEditIds.get(id);
		if (encounteredEditId !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(encounteredEditId.isLocal, 'Duplicate acked edit.');
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			const oldLocalEditId = assertNotUndefined(this.localEdits.shift(), 'Local edit should exist').id;
			assert(oldLocalEditId === id, 'Causal ordering should be upheld');
		}

		this.sequencedEdits.push(edit);

		const sequencedEditId: SequencedOrderedEditId = {
			index: this.numberOfSequencedEdits - 1,
			isLocal: false,
			sequenceInfo: info,
		};
		this.allEditIds.set(id, sequencedEditId);
		this.emitAdd(edit, false, encounteredEditId !== undefined);
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
		const editIds = this.sequencedEdits.map(({ id }) => id);
		return compressEdit !== undefined
			? {
					editChunks:
						this.sequencedEdits.length === 0
							? []
							: [
									{
										// Store all edits within a single "chunk"
										startRevision: 0,
										chunk: this.sequencedEdits.map((edit) => compressEdit(edit)),
									},
							  ],
					editIds,
			  }
			: {
					editChunks:
						this.sequencedEdits.length === 0
							? []
							: [
									{
										// Store all edits within a single "chunk"
										startRevision: 0,
										chunk: this.sequencedEdits.map(({ changes }) => ({ changes })),
									},
							  ],
					editIds,
			  };
	}

	// APIS DEPRECATED DUE TO HISTORY'S PEACEFUL DEATH
	/**
	 * {@inheritDoc OrderedEditSet.tryGetEdit}
	 */
	public async tryGetEdit(editId: EditId): Promise<Edit<TChange> | undefined> {
		const index = this.tryGetIndexOfId(editId);
		return index !== undefined ? this.tryGetEditAtIndex(index) : undefined;
	}

	/**
	 * {@inheritDoc OrderedEditSet.getEditAtIndex}
	 */
	public async getEditAtIndex(index: number): Promise<Edit<TChange>> {
		return this.tryGetEditAtIndex(index) ?? fail('Edit not found');
	}

	/**
	 * {@inheritDoc OrderedEditSet.getEditInSessionAtIndex}
	 */
	public getEditInSessionAtIndex(index: number): Edit<TChange> {
		return this.tryGetEditAtIndex(index) ?? fail('Edit not found');
	}
}
