/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BTree } from '@tylerbu/sorted-btree-es6';
import { TypedEventEmitter } from '@fluid-internal/client-utils';
import { assert, compareArrays } from '@fluidframework/core-utils';
import type { IEvent } from '@fluidframework/core-interfaces';
import { ITelemetryLoggerExt } from '@fluidframework/telemetry-utils';
import { fail } from './Common.js';
import type { EditId } from './Identifiers.js';
import type { StringInterner } from './StringInterner.js';
import { Edit, EditLogSummary, EditWithoutId, FluidEditHandle } from './persisted-types/index.js';
import type { ChangeCompressor } from './ChangeCompression.js';

/**
 * An ordered set of Edits associated with a SharedTree.
 * Supports fast lookup of edits by ID and enforces idempotence.
 * @sealed
 * @alpha
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
 * @internal
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
 * Event fired before edits are evicted from the edit log. It takes in a count of the number of edits to evict
 * starting from the oldest in memory edit. To get the edit itself, call {@link EditLog.getEditAtIndex}.
 * The edit index corresponds to the count + {@link EditLog.earliestAvailableEditIndex}.
 */
export type EditEvictionHandler = (editsToEvict: number) => void;

/**
 * Events which may be emitted by {@link EditLog}
 * @alpha
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
 * @alpha
 */
export class EditLog<TChange = unknown> extends TypedEventEmitter<IEditLogEvents> implements OrderedEditSet<TChange> {
	private localEditSequence = 0;

	private readonly sequenceNumberToIndex?: BTree<number, number>;
	private _minSequenceNumber = 0;

	private readonly sequencedEdits: Edit<TChange>[] = [];
	private readonly localEdits: Edit<TChange>[] = [];

	private readonly allEditIds = new Map<EditId, OrderedEditId>();
	private _earliestAvailableEditIndex = 0;
	private readonly _editAddedHandlers = new Set<EditAddedHandler<TChange>>();
	private readonly _editEvictionHandlers = new Set<EditEvictionHandler>();

	/**
	 * @returns The index of the earliest edit stored in this log.
	 * Edit indices are unique and strictly increasing within the session.
	 */
	public get earliestAvailableEditIndex(): number {
		return this._earliestAvailableEditIndex;
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
	 * @param editAddedHandlers - Optional handlers that are called when edits are added.
	 * @param targetLength - The target number of sequenced edits that the log will try to store in memory.
	 * Depending on eviction frequency and the collaboration window, there can be more edits in memory at a given time.
	 * Edits greater than or equal to the `minSequenceNumber` (aka in the collaboration window) are not evicted.
	 * @param evictionFrequency - The rate at which edits are evicted from memory. This is a factor of the editLogSize.
	 * For example, with the default frequency of inMemoryHistorySize * 2 and a size of 10, the log will evict once it reaches 20 sequenced edits
	 * down to 10 edits, also keeping any that are still in the collaboration window.
	 * @param editEvictionHandlers - Handlers that are called before edits are evicted from memory. This provides a chance for
	 * callers to work with the edits before they are lost.
	 */
	public constructor(
		summary: EditLogSummary<TChange, EditHandle<TChange>> = { editIds: [], editChunks: [] },
		private readonly logger?: ITelemetryLoggerExt,
		editAddedHandlers: readonly EditAddedHandler<TChange>[] = [],
		private readonly targetLength = Infinity,
		private readonly evictionFrequency = targetLength * 2,
		editEvictionHandlers: readonly EditEvictionHandler[] = []
	) {
		super();
		const { editChunks, editIds } = summary;

		for (const handler of editAddedHandlers) {
			this.registerEditAddedHandler(handler);
		}

		if (targetLength !== Infinity) {
			if (targetLength < 0 || evictionFrequency < 0) {
				fail('targetLength and evictionFrequency should not be negative');
			}
			this.sequenceNumberToIndex = new BTree([[0, 0]]);
			for (const handler of editEvictionHandlers) {
				this.registerEditEvictionHandler(handler);
			}
		}

		editChunks.forEach((editChunkOrHandle) => {
			const { startRevision, chunk } = editChunkOrHandle;

			if (Array.isArray(chunk)) {
				for (const [index, edit] of chunk.entries()) {
					const editIndex = startRevision + index;
					const id = editIds[editIndex];
					this.sequencedEdits.push({ id, ...edit });
					const encounteredEditId = this.allEditIds.get(id);
					assert(encounteredEditId === undefined, 0x60a /* Duplicate acked edit. */);
					this.allEditIds.set(id, { isLocal: false, index: editIndex });
				}
			} else {
				// Ignore any edit handles, these edits are now unrecoverable.
				// This should instead download the edit chunk and store them but history is not
				// being used so we're going with the simpler solution.
				this.logger?.sendErrorEvent({ eventName: 'UnexpectedEditHandleInSummary' });
			}
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
	 * Registers a handler that is called before an edit is evicted from this `EditLog`.
	 * @returns A callback which can be invoked to unregister this handler.
	 */
	public registerEditEvictionHandler(handler: EditEvictionHandler): () => void {
		this._editEvictionHandlers.add(handler);
		return () => this._editEvictionHandlers.delete(handler);
	}

	/**
	 * @returns the `EditEvictedHandler`s registered on this `EditLog`.
	 */
	public get editEvictedHandlers(): readonly EditEvictionHandler[] {
		return Array.from(this._editEvictionHandlers);
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
			const firstLocal = this.allEditIds.get(this.localEdits[0].id) ?? fail('edit not found');
			assert(firstLocal.isLocal, 0x60b /* local edit should be local */);
			return (
				this._earliestAvailableEditIndex +
				this.numberOfSequencedEdits +
				orderedEdit.localSequence -
				firstLocal.localSequence
			);
		}
		return orderedEdit.index;
	}

	/**
	 * @returns Edit metadata for the edit with the given `editId`.
	 */
	public getOrderedEditId(editId: EditId): OrderedEditId {
		return this.allEditIds.get(editId) ?? fail('All edits should exist in this map');
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
		if (this._earliestAvailableEditIndex + this.numberOfSequencedEdits <= index) {
			return this.localEdits[index - this.numberOfSequencedEdits].id;
		}

		return this.sequencedEdits[index - this._earliestAvailableEditIndex].id;
	}

	/**
	 * {@inheritDoc OrderedEditSet.tryGetEditAtIndex}
	 */
	public tryGetEditAtIndex(index: number): Edit<TChange> | undefined {
		if (this._earliestAvailableEditIndex + this.numberOfSequencedEdits <= index) {
			return this.localEdits[index - this.numberOfSequencedEdits];
		}

		return this.sequencedEdits[index - this._earliestAvailableEditIndex];
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
			minSequenceNumber >= this._minSequenceNumber,
			0x60c /* Sequenced edits should carry a monotonically increasing min number */
		);
		this._minSequenceNumber = minSequenceNumber;

		const { id } = edit;
		// The index of the sequenced edit to add
		const index = this._earliestAvailableEditIndex + this.numberOfSequencedEdits;

		// Remove the edit from local edits if it exists.
		const encounteredEditId = this.allEditIds.get(id);
		if (encounteredEditId !== undefined) {
			// New edit already exits: it must have been a local edit.
			assert(encounteredEditId.isLocal, 0x60d /* Duplicate acked edit. */);
			// Remove it from localEdits. Due to ordering requirements, it must be first.
			const oldLocalEditId = this.localEdits.shift()?.id ?? fail('Local edit should exist');
			assert(oldLocalEditId === id, 0x60e /* Causal ordering should be upheld */);
		}

		this.sequencedEdits.push(edit);

		const sequencedEditId: SequencedOrderedEditId = {
			index,
			isLocal: false,
			sequenceInfo: info,
		};
		this.allEditIds.set(id, sequencedEditId);
		if (info !== undefined) {
			this.sequenceNumberToIndex?.set(info.sequenceNumber, index);
		}
		this.emitAdd(edit, false, encounteredEditId !== undefined);

		// Check if any edits need to be evicted due to this addition
		if (this.sequenceNumberToIndex !== undefined && this.numberOfSequencedEdits >= this.evictionFrequency) {
			this.evictEdits();
		}
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

	private evictEdits(): void {
		assert(
			this.sequenceNumberToIndex !== undefined,
			0x60f /* Edits should never be evicted if the target length is set to infinity */
		);

		const minSequenceIndex =
			this.sequenceNumberToIndex.getPairOrNextHigher(this._minSequenceNumber)?.[1] ??
			fail('No index associated with that sequence number.');
		// Exclude any edits in the collab window from being evicted
		const numberOfEvictableEdits = minSequenceIndex - this.earliestAvailableEditIndex;

		if (numberOfEvictableEdits > 0) {
			// Evict either all but the target log size or the number of evictable edits, whichever is smaller
			const numberOfDesiredEditsToEvict = this.numberOfSequencedEdits - this.targetLength;
			const numberOfEditsToEvict = Math.min(numberOfEvictableEdits, numberOfDesiredEditsToEvict);
			for (const handler of this._editEvictionHandlers) {
				handler(numberOfEditsToEvict);
			}

			// Remove the edits and move up the earliest available index
			const removedEdits = this.sequencedEdits.splice(0, numberOfEditsToEvict);
			this._earliestAvailableEditIndex += numberOfEditsToEvict;

			// On eviction, we need to remove the IDs of edits that have been evicted
			removedEdits.forEach((edit) => this.allEditIds.delete(edit.id));

			// The minSequenceNumber is strictly increasing so we can clear sequence numbers before it
			this.sequenceNumberToIndex.deleteRange(0, this._minSequenceNumber, false);
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
	 */
	public getEditLogSummary(): EditLogSummary<TChange, FluidEditHandle>;

	/**
	 * @param compressEdit - a function which compresses edits
	 * @returns the summary of this `OrderedEditSet` that can be used to reconstruct the edit set.
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
	 * @deprecated Edit virtualization is no longer supported. Don't use the asynchronous APIs. Instead, use {@link OrderedEditSet.tryGetEditFromId}.
	 */
	public async tryGetEdit(editId: EditId): Promise<Edit<TChange> | undefined> {
		const index = this.tryGetIndexOfId(editId);
		return index !== undefined ? this.tryGetEditAtIndex(index) : undefined;
	}

	/**
	 * @deprecated Edit virtualization is no longer supported. Don't use the asynchronous APIs. Instead, use {@link OrderedEditSet.tryGetEditFromId}.
	 */
	public async getEditAtIndex(index: number): Promise<Edit<TChange>> {
		return this.tryGetEditAtIndex(index) ?? fail('Edit not found');
	}

	/**
	 * @deprecated Edit virtualization is no longer supported. Instead, use {@link OrderedEditSet.tryGetEditFromId}.
	 */
	public getEditInSessionAtIndex(index: number): Edit<TChange> {
		return this.tryGetEditAtIndex(index) ?? fail('Edit not found');
	}
}
