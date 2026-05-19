/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	Serializable,
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelFactory,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import type { ITree } from "@fluidframework/driver-definitions/internal";
import { FileMode, MessageType, TreeEntry } from "@fluidframework/driver-definitions/internal";
import type {
	ISummaryTreeWithStats,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	ISequencedMessageEnvelope,
} from "@fluidframework/runtime-definitions/internal";
import { convertToSummaryTreeWithStats } from "@fluidframework/runtime-utils/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import { SharedObject } from "@fluidframework/shared-object-base/internal";
import { v4 as uuid } from "uuid";

import type {
	ISharedArrayEvents,
	ISharedArray,
	ISharedArrayRevertible,
	SerializableTypeForSharedArray,
	SharedArrayEntry,
	SnapshotFormat,
	SharedArrayEntryCore,
} from "./interfaces.js";
import { SharedArrayFactory } from "./sharedArrayFactory.js";
import type {
	ISharedArrayOperation,
	IDeleteOperation,
	IMoveOperation,
	IToggleMoveOperation,
	IToggleOperation,
} from "./sharedArrayOperations.js";
import { OperationType } from "./sharedArrayOperations.js";
import { SharedArrayRevertible } from "./sharedArrayRevertible.js";

const snapshotFileName = "header";

/**
 * Per-op pending state used by the squash-on-resubmit path. The same object is the
 * `localOpMetadata` passed to `submitLocalMessage`, which lets us splice an entry out
 * of {@link SharedArrayClass.pendingOps} when a later staged op subsumes it.
 *
 * - `entryId` is the op's primary entry (source for moves/toggleMoves).
 * - `targetEntryId` is the destination for moves/toggleMoves; undefined otherwise.
 */
interface SharedArrayPendingOp<T> {
	readonly op: ISharedArrayOperation<T>;
	readonly type: OperationType;
	readonly entryId: string;
	readonly targetEntryId?: string;
}

/**
 * Represents a shared array that allows communication between distributed clients.
 *
 * @internal
 */
export class SharedArrayClass<T extends SerializableTypeForSharedArray>
	extends SharedObject<ISharedArrayEvents>
	implements ISharedArray<T>, ISharedArrayRevertible
{
	/**
	 * Stores the data held by this shared array.
	 */
	private sharedArray: SharedArrayEntry<T>[];

	/**
	 * Stores a map of entryid to entries of the sharedArray. This is meant of search optimizations and
	 * so shouldn't be snapshotted.
	 * Note: This map needs to be updated only when the sharedArray is being deserialized and when new entries are
	 * being added. New entries are added upon insert ops and the second leg of the move op.
	 * As we don't delete the entries once created, deletion or move to another position needs no special
	 * handling for this data structure
	 */
	private readonly idToEntryMap: Map<string, SharedArrayEntry<T>>;

	/**
	 * Set of entry IDs that are marked for deletion by remote clients, but have local pending deletes.
	 * Used to prevent resuscitating entries while rolling back a delete operation.
	 * We should not rollback to life an entry that was deleted by remote clients.
	 */
	private readonly remoteDeleteWithLocalPendingDelete: Set<string> = new Set<string>();

	/**
	 * FIFO of in-flight local ops. The `localOpMetadata` passed to each `submitLocalMessage`
	 * call is the same object stored here, so {@link reSubmitSquashed} can splice an entry
	 * out when a later staged op subsumes it.
	 *
	 * Push on submit / `applyStashedOp`; shift on local ack; splice on squash-drop.
	 */
	private readonly pendingOps: SharedArrayPendingOp<T>[] = [];

	/**
	 * Lazily-computed plan for the current resubmit batch. Identifies the set of
	 * pendingOps to drop together (so insertAfter dependency chains are preserved)
	 * and the insertAfter rewrites needed for non-dropped dependents. Invalidated on
	 * any pendingOps mutation outside the squash path (submit / local-ack).
	 */
	private cachedSquashPlan?: {
		drops: Set<SharedArrayPendingOp<T>>;
		rewrites: Map<SharedArrayPendingOp<T>, string | undefined>;
	};

	/**
	 * Lowest pendingOps index seen so far by {@link reSubmitSquashed} in the current
	 * resubmit batch. Anything below this index is a pre-staging op (already on the wire
	 * before staging began) that must not be considered as a chain root by
	 * {@link computeSquashPlan} — dropping its chain would silently retract an op the
	 * peer has already observed (or will observe via the runtime's pre-staging resubmit).
	 *
	 * Reset whenever pendingOps mutates outside the squash path so the next batch
	 * recomputes from scratch.
	 */
	private stagingBoundaryIdx?: number;

	/**
	 * Entries whose creation op was dropped by a prior squash batch and therefore
	 * never reached peers. Lives across staging cycles: a later cycle that needs to
	 * rewrite an `insertAfterEntryId` must skip these when picking a wire-valid
	 * predecessor, because they remain in {@link sharedArray} as deleted entries
	 * but are not visible to any peer.
	 */
	private readonly wireBlacklist = new Set<string>();

	/**
	 * Create a new shared array
	 *
	 * @param runtime - data store runtime the new shared array belongs to
	 * @param id - optional name of the shared array
	 * @returns newly create shared array (but not attached yet)
	 */
	public static create<T extends SerializableTypeForSharedArray>(
		runtime: IFluidDataStoreRuntime,
		id?: string,
	): SharedArrayClass<T> {
		return runtime.createChannel(id, SharedArrayFactory.Type) as SharedArrayClass<T>;
	}

	/**
	 * Get a factory for SharedArray to register with the data store.
	 *
	 * @returns a factory that creates and load SharedArray
	 */
	public static getFactory<T extends SerializableTypeForSharedArray>(): IChannelFactory {
		return new SharedArrayFactory<T>();
	}

	/**
	 * Constructs a new shared array. If the object is non-local an id and service interfaces will
	 * be provided
	 *
	 * @param id - optional name of the shared array
	 * @param runtime - data store runtime the shared array belongs to
	 * @param attributes - represents the attributes of a channel/DDS.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "loop_sharedArray_" /* telemetryContextPrefix */);
		this.sharedArray = [];
		this.idToEntryMap = new Map<string, SharedArrayEntry<T>>();
	}

	/**
	 * Method that returns the ordered list of the items held in the DDS at this point in time.
	 * Note: This is only a snapshot of the array
	 */
	public get(): readonly T[] {
		return this.sharedArray.filter((item) => !item.isDeleted).map((entry) => entry.value);
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		// Deep copy and unset the local flags. Needed when snapshotting is happening for runtime not attached
		const dataArrayCopy: SharedArrayEntryCore<T>[] = [];
		for (const entry of this.sharedArray) {
			dataArrayCopy.push({
				entryId: entry.entryId,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				value: JSON.parse(serializer.stringify(entry.value, this.handle)),
				isDeleted: entry.isDeleted,
				prevEntryId: entry.prevEntryId,
				nextEntryId: entry.nextEntryId,
			});
		}

		// We are snapshotting current client data so autoacking pending local.
		// Assumption : This should happen only for offline client creating the array. All other scenarios should
		//              get to MSN - where there can be no local pending possible.
		for (const entry of this.sharedArray) {
			this.unsetLocalFlags(entry);
		}
		const contents: SnapshotFormat<SharedArrayEntryCore<T>> = {
			dataArray: dataArrayCopy,
		};
		const tree: ITree = {
			entries: [
				{
					mode: FileMode.File,
					path: snapshotFileName,
					type: TreeEntry[TreeEntry.Blob],
					value: {
						contents: serializer.stringify(contents, this.handle),
						// eslint-disable-next-line unicorn/text-encoding-identifier-case
						encoding: "utf-8",
					},
				},
			],
		};
		const summaryTreeWithStats = convertToSummaryTreeWithStats(tree);

		return summaryTreeWithStats;
	}

	public insertBulkAfter<TWrite>(
		ref: T | undefined,
		values: (Serializable<TWrite> & T)[],
	): void {
		let itemIndex: number = 0;

		if (ref !== undefined) {
			for (itemIndex = this.sharedArray.length - 1; itemIndex > 0; itemIndex -= 1) {
				const item = this.sharedArray[itemIndex];
				if (item && !item.isDeleted && item.value === ref) {
					break;
				}
			}
			// Add one since we're inserting it after this rowId. If rowId is not found, we will get -1, which after
			// adding one, will be 0, which will place the new rows at the right place too
			itemIndex += 1;
		}

		// Insert new elements
		for (const value of values) {
			this.insertCore(itemIndex, value);
			itemIndex += 1;
		}
	}

	public insert<TWrite>(index: number, value: Serializable<TWrite> & T): void {
		if (index < 0) {
			throw new Error("Invalid input: Insertion index provided is less than 0.");
		}
		this.insertCore(this.findInternalInsertionIndex(index), value);
	}

	private insertCore<TWrite>(indexInternal: number, value: Serializable<TWrite> & T): void {
		const insertAfterEntryId =
			indexInternal >= 1 ? this.sharedArray[indexInternal - 1]?.entryId : undefined;
		const newEntryId = this.createAddEntry(indexInternal, value);

		const op = {
			type: OperationType.insertEntry,
			entryId: newEntryId,
			value,
			insertAfterEntryId,
		};

		this.emitValueChangedEvent(op, true /* isLocal */);
		this.emitRevertibleEvent(op);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		this.submitArrayOp(op);
	}

	public delete(index: number): void {
		if (index < 0) {
			throw new Error("Invalid input: Deletion index provided is less than 0.");
		}

		const indexInternal: number = this.findInternalDeletionIndex(index);

		const entry = this.sharedArray[indexInternal];
		assert(entry !== undefined, 0xb90 /* Invalid index */);
		const entryId = entry.entryId;
		this.deleteCore(indexInternal);

		const op: IDeleteOperation = {
			type: OperationType.deleteEntry,
			entryId,
		};
		this.emitValueChangedEvent(op, true /* isLocal */);
		this.emitRevertibleEvent(op);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		this.submitArrayOp(op);
	}

	public rearrangeToFront(values: T[]): void {
		for (let toIndex = 0; toIndex < values.length; toIndex += 1) {
			const value = values[toIndex];
			// Can skip searching first <toIndex> indices, as they contain elements we already moved.
			for (let fromIndex = toIndex; fromIndex < this.sharedArray.length; fromIndex += 1) {
				const item = this.sharedArray[fromIndex];
				assert(item !== undefined, 0xb91 /* Invalid index */);
				if (item.value !== value) {
					continue;
				}
				if (
					!item.isDeleted &&
					// Moving to and from the same index makes no sense, so noOp
					fromIndex !== toIndex &&
					// Moving the same entry from current location to its immediate next makes no sense so noOp
					toIndex !== fromIndex + 1
				) {
					this.moveCore(fromIndex, toIndex);
				}
				break;
			}
		}
	}

	/**
	 * Moves the DDS entry from one index to another
	 *
	 * @param fromIndex - User index of the element to be moved
	 * @param toIndex - User index to which the element should move to
	 */
	public move(fromIndex: number, toIndex: number): void {
		if (fromIndex < 0) {
			throw new Error("Invalid input: fromIndex value provided is less than 0");
		}

		if (toIndex < 0) {
			throw new Error("Invalid input: toIndex value provided is less than 0");
		}

		if (
			// Moving to and from the same index makes no sense, so noOp
			fromIndex === toIndex ||
			// Moving the same entry from current location to its immediate next makes no sense so noOp
			toIndex === fromIndex + 1
		) {
			return;
		}
		const fromIndexInternal: number = this.findInternalDeletionIndex(fromIndex);
		const toIndexInternal: number = this.findInternalInsertionIndex(toIndex);

		this.moveCore(fromIndexInternal, toIndexInternal);
	}

	private moveCore(fromIndexInternal: number, toIndexInternal: number): void {
		const insertAfterEntryId =
			toIndexInternal >= 1 ? this.sharedArray[toIndexInternal - 1]?.entryId : undefined;
		const entryId = this.sharedArray[fromIndexInternal]?.entryId;
		assert(entryId !== undefined, 0xb92 /* Invalid index */);
		const changedToEntryId = this.createMoveEntry(fromIndexInternal, toIndexInternal);

		const op: IMoveOperation = {
			type: OperationType.moveEntry,
			entryId,
			insertAfterEntryId,
			changedToEntryId,
		};
		this.emitValueChangedEvent(op, true /* isLocal */);
		this.emitRevertibleEvent(op);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		this.submitArrayOp(op);
	}

	/**
	 * Method used to do undo/redo operation for the given entry id. This method is
	 * used for undo/redo of only insert and delete operations. Move operation is NOT handled
	 * by this method
	 *
	 * @param entryId - Entry Id for which the the undo/redo operation is to be applied
	 */
	public toggle(entryId: string): void {
		const liveEntry = this.getLiveEntry(entryId);
		if (liveEntry?.isRollback === true) {
			return;
		}
		const isDeleted = !liveEntry.isDeleted;

		// Adding local pending counter
		this.getEntryForId(entryId).isLocalPendingDelete += 1;

		// Toggling the isDeleted flag to undo the last operation for the skip list payload/value
		liveEntry.isDeleted = isDeleted;

		const op: IToggleOperation = {
			type: OperationType.toggle,
			entryId,
			isDeleted,
		};
		this.emitValueChangedEvent(op, true /* isLocal */);
		this.emitRevertibleEvent(op);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		this.submitArrayOp(op);
	}
	/**
	 * Method to do undo/redo of move operation. All entries of the same payload/value are stored
	 * in the same doubly linked skip list. This skip list is updated upon every move by adding the
	 * new location as a new entry in the skip list and update the isDeleted flag to indicate the new
	 * entry is the cuurent live location for the user.
	 *
	 * @param oldEntryId - EntryId of the last live entry
	 * @param newEntryId - EntryId of the to be live entry
	 */
	public toggleMove(oldEntryId: string, newEntryId: string): void {
		const liveEntry = this.getLiveEntry(newEntryId);
		if (liveEntry?.isRollback === true) {
			return;
		}
		if (this.getEntryForId(newEntryId).isDeleted) {
			return;
		}

		// Adding local pending counter
		this.getEntryForId(oldEntryId).isLocalPendingMove += 1;

		this.updateLiveEntry(newEntryId, oldEntryId);

		const op: IToggleMoveOperation = {
			type: OperationType.toggleMove,
			entryId: oldEntryId,
			changedToEntryId: newEntryId,
		};
		this.emitValueChangedEvent(op, true /* isLocal */);
		this.emitRevertibleEvent(op);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		this.submitArrayOp(op);
	}

	public rollback(op: unknown, _localOpMetadata: unknown): void {
		const arrayOp = op as ISharedArrayOperation<T>;
		switch (arrayOp.type) {
			case OperationType.insertEntry: {
				const liveEntry = this.getLiveEntry(arrayOp.entryId);
				liveEntry.isDeleted = true;
				liveEntry.isRollback = true;
				const deleteOp: IDeleteOperation = {
					type: OperationType.deleteEntry,
					entryId: arrayOp.entryId,
				};
				this.emitValueChangedEvent(deleteOp, true /* isLocal */);
				break;
			}
			case OperationType.deleteEntry: {
				if (this.remoteDeleteWithLocalPendingDelete.has(arrayOp.entryId)) {
					// If remote already deleted the entry, we should not resurrect it.
					// Just remove the local pending delete.
					this.remoteDeleteWithLocalPendingDelete.delete(arrayOp.entryId);
				} else {
					const liveEntry = this.getLiveEntry(arrayOp.entryId);
					liveEntry.isDeleted = false;
					liveEntry.isRollback = true;
					const insertOp = {
						type: OperationType.insertEntry,
						entryId: arrayOp.entryId,
						value: liveEntry.value,
					};
					this.emitValueChangedEvent(insertOp, true /* isLocal */);
					const entry = this.getEntryForId(arrayOp.entryId);
					if (entry !== undefined && entry.isLocalPendingDelete > 0) {
						entry.isLocalPendingDelete -= 1;
					}
				}
				break;
			}
			case OperationType.moveEntry: {
				const { entryId: oldEntryId, changedToEntryId: newEntryId } = arrayOp;
				if (this.getEntryForId(newEntryId).isDeleted) {
					return;
				}
				this.getEntryForId(oldEntryId).isRollback = true;
				this.updateLiveEntry(newEntryId, oldEntryId);
				const inputEntry = this.getEntryForId(oldEntryId);
				inputEntry.prevEntryId = undefined;
				inputEntry.nextEntryId = undefined;
				inputEntry.isLocalPendingMove = 0;
				const moveOp: IMoveOperation = {
					type: OperationType.moveEntry,
					entryId: newEntryId,
					changedToEntryId: oldEntryId,
				};
				this.emitValueChangedEvent(moveOp, true /* isLocal */);
				break;
			}
			case OperationType.toggle: {
				const entryId = arrayOp.entryId;
				const liveEntry = this.getLiveEntry(entryId);
				const isDeleted = liveEntry.isDeleted;

				// Toggling the isDeleted flag to undo the last operation for the skip list payload/value
				liveEntry.isDeleted = !isDeleted;
				liveEntry.isLocalPendingDelete -= 1;
				liveEntry.isRollback = true;

				const toggleOp: IToggleOperation = {
					type: OperationType.toggle,
					entryId,
					isDeleted: liveEntry.isDeleted,
				};
				this.emitValueChangedEvent(toggleOp, true /* isLocal */);
				break;
			}
			case OperationType.toggleMove: {
				const { entryId: oldEntryId, changedToEntryId: newEntryId } = arrayOp;
				this.getEntryForId(oldEntryId).isLocalPendingMove -= 1;
				this.getEntryForId(newEntryId).isRollback = true;
				this.updateLiveEntry(oldEntryId, newEntryId);

				const toggleMoveOp: IToggleMoveOperation = {
					type: OperationType.toggleMove,
					entryId: newEntryId,
					changedToEntryId: oldEntryId,
				};
				this.emitValueChangedEvent(toggleMoveOp, true /* isLocal */);
				break;
			}
			default: {
				unreachableCase(arrayOp);
			}
		}
	}

	/**
	 * Load share array from snapshot
	 *
	 * @param storage - the storage to get the snapshot from
	 * @returns promise that resolved when the load is completed
	 */
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const header = await storage.readBlob(snapshotFileName);
		// eslint-disable-next-line unicorn/text-encoding-identifier-case
		const utf8 = new TextDecoder("utf-8").decode(header);
		// Note: IFluidSerializer.parse() doesn't guarantee any typing; the explicit typing here is based on this code's
		// knowledge of what it is deserializing.
		const deserializedSharedArray = this.serializer.parse(utf8) as {
			dataArray: SharedArrayEntry<T>[];
		};
		this.sharedArray = deserializedSharedArray.dataArray;
		// Initializing the idToEntryMap optimizer data set
		for (const entry of this.sharedArray) {
			this.idToEntryMap.set(entry.entryId, entry);
			this.unsetLocalFlags(entry);
		}
	}

	/**
	 * Callback on disconnect
	 */
	protected onDisconnect(): void {}

	/**
	 * Per-op squash. The only op that carries user content is `insertEntry` (its `value`); the
	 * others reference entryIds. So the subsumption walk starts at each staged `insertEntry`
	 * and follows the chain forward through `moveEntry` (which re-homes the entry's value
	 * under a new entryId) until the chain terminates. If the chain's final state is "deleted"
	 * — via `deleteEntry` or `toggle(isDeleted=true)` — the entire chain is dropped (including
	 * the insert that carried the value). If the chain remains live, or if a `toggleMove`
	 * intervenes (which can resurrect an earlier link in unpredictable ways), the chain is
	 * resubmitted unchanged.
	 *
	 * Dropped ops are spliced from {@link pendingOps} in this pass; later `reSubmitSquashed`
	 * calls for those same ops short-circuit via the membership check.
	 */
	protected override reSubmitSquashed(content: unknown, localOpMetadata: unknown): void {
		const pendingOp = localOpMetadata as SharedArrayPendingOp<T>;
		if (this.stagingBoundaryIdx === undefined) {
			// First staged op in this resubmit batch — anchor the staging boundary at its
			// position so chain walking from earlier (pre-staging) inserts can't pull a
			// staged delete into a drop set and silently corrupt state.
			const idx = this.pendingOps.indexOf(pendingOp);
			this.stagingBoundaryIdx = idx === -1 ? this.pendingOps.length : idx;
			this.cachedSquashPlan = undefined;
		}
		this.cachedSquashPlan ??= this.computeSquashPlan(this.stagingBoundaryIdx);
		const { drops, rewrites } = this.cachedSquashPlan;
		if (drops.has(pendingOp)) {
			const idx = this.pendingOps.indexOf(pendingOp);
			if (idx !== -1) {
				this.pendingOps.splice(idx, 1);
			}
			return;
		}
		if (rewrites.has(pendingOp)) {
			const newInsertAfter = rewrites.get(pendingOp);
			const op = content as ISharedArrayOperation<T>;
			if (op.type === OperationType.insertEntry || op.type === OperationType.moveEntry) {
				this.reSubmitCore({ ...op, insertAfterEntryId: newInsertAfter }, localOpMetadata);
				return;
			}
		}
		this.reSubmitCore(content, localOpMetadata);
	}

	/**
	 * Push a pending-op record and submit the op with that record as `localOpMetadata`.
	 * The record is consumed FIFO on local ack (see {@link processMessage}) and may be
	 * spliced out earlier by a squash decision (see {@link reSubmitSquashed}).
	 */
	private submitArrayOp(op: ISharedArrayOperation<T>): void {
		const pendingOp = this.buildPendingOp(op);
		this.pendingOps.push(pendingOp);
		this.cachedSquashPlan = undefined;
		this.stagingBoundaryIdx = undefined;
		this.submitLocalMessage(op, pendingOp);
	}

	private buildPendingOp(op: ISharedArrayOperation<T>): SharedArrayPendingOp<T> {
		switch (op.type) {
			case OperationType.insertEntry:
			case OperationType.deleteEntry:
			case OperationType.toggle: {
				return { op, type: op.type, entryId: op.entryId };
			}
			case OperationType.moveEntry:
			case OperationType.toggleMove: {
				return {
					op,
					type: op.type,
					entryId: op.entryId,
					targetEntryId: op.changedToEntryId,
				};
			}
			default: {
				unreachableCase(op);
			}
		}
	}

	/**
	 * Compute the squash plan for the current pendingOps state. Two passes:
	 * pass 1 identifies each insertEntry chain (insert + moves + terminal
	 * delete/toggle); chains that terminate in a deleted state contribute their
	 * ops to `drops` and their entryIds to `droppedEntries`. Pass 2 computes
	 * insertAfter rewrites for non-dropped insert/move ops whose
	 * `insertAfterEntryId` references a dropped entry, by walking sharedArray
	 * backward to the nearest non-dropped entry.
	 */
	private computeSquashPlan(stagingBoundaryIdx: number = 0): {
		drops: Set<SharedArrayPendingOp<T>>;
		rewrites: Map<SharedArrayPendingOp<T>, string | undefined>;
	} {
		const drops = new Set<SharedArrayPendingOp<T>>();
		const droppedEntries = new Set<string>();
		const claimed = new Set<SharedArrayPendingOp<T>>();

		for (let opIdx = 0; opIdx < this.pendingOps.length; opIdx++) {
			const op = this.pendingOps[opIdx];
			assert(op !== undefined, "pendingOps index in range");
			if (op.type !== OperationType.insertEntry || claimed.has(op)) {
				continue;
			}
			if (opIdx < stagingBoundaryIdx) {
				// Pre-staging insert — already on the wire, can't be retracted via squash.
				continue;
			}
			const chain = this.walkInsertChain(op);
			if (chain === undefined) {
				continue;
			}
			for (const chainOp of chain.ops) {
				drops.add(chainOp);
				claimed.add(chainOp);
			}
			for (const entry of chain.entries) {
				droppedEntries.add(entry);
				this.wireBlacklist.add(entry);
			}
		}

		const rewrites = new Map<SharedArrayPendingOp<T>, string | undefined>();
		if (droppedEntries.size > 0) {
			const entryBirthIdx = this.buildEntryBirthIndexMap();
			for (let pIdx = 0; pIdx < this.pendingOps.length; pIdx++) {
				const pendingOp = this.pendingOps[pIdx];
				assert(pendingOp !== undefined, 0xcfd /* pendingOps index in range */);
				if (drops.has(pendingOp)) {
					continue;
				}
				const op = pendingOp.op;
				if (op.type !== OperationType.insertEntry && op.type !== OperationType.moveEntry) {
					continue;
				}
				if (
					op.insertAfterEntryId === undefined ||
					(!droppedEntries.has(op.insertAfterEntryId) &&
						!this.wireBlacklist.has(op.insertAfterEntryId))
				) {
					continue;
				}
				const anchorEntryId =
					op.type === OperationType.moveEntry ? op.changedToEntryId : pendingOp.entryId;
				rewrites.set(
					pendingOp,
					this.resolveRewriteTarget(anchorEntryId, pIdx, droppedEntries, entryBirthIdx),
				);
			}
		}
		return { drops, rewrites };
	}

	/**
	 * Map from entryId to the pendingOps index where that entry is created
	 * (insertEntry or moveEntry's target). Entries not in the map are pre-staging
	 * acked entries that are already on the wire.
	 */
	private buildEntryBirthIndexMap(): Map<string, number> {
		const map = new Map<string, number>();
		for (let i = 0; i < this.pendingOps.length; i++) {
			const p = this.pendingOps[i];
			assert(p !== undefined, 0xcfe /* pendingOps index in range */);
			if (p.type === OperationType.insertEntry) {
				map.set(p.entryId, i);
			} else if (p.type === OperationType.moveEntry && p.targetEntryId !== undefined) {
				map.set(p.targetEntryId, i);
			}
		}
		return map;
	}

	/**
	 * Walk sharedArray backward from the given entry's position to find the nearest
	 * entry that will be on the wire when the rewritten op is submitted. A candidate
	 * qualifies when it is not in `droppedEntries`, not in `wireBlacklist`, and is
	 * either acked pre-staging (not in `entryBirthIdx`) or born earlier than this
	 * op in the same squash batch. Returns undefined when no qualifying predecessor
	 * exists, which means the rewrite anchors to the front.
	 */
	private resolveRewriteTarget(
		anchorEntryId: string,
		opPendingIdx: number,
		droppedEntries: Set<string>,
		entryBirthIdx: Map<string, number>,
	): string | undefined {
		const idx = this.findIndexOfEntryId(anchorEntryId);
		if (idx <= 0) {
			return undefined;
		}
		for (let i = idx - 1; i >= 0; i--) {
			const entry = this.sharedArray[i];
			if (entry === undefined) {
				continue;
			}
			if (droppedEntries.has(entry.entryId)) {
				continue;
			}
			if (this.wireBlacklist.has(entry.entryId)) {
				// Dropped by an earlier squash batch — sharedArray still has the (deleted)
				// entry locally, but it never reached peers.
				continue;
			}
			const birthIdx = entryBirthIdx.get(entry.entryId);
			if (birthIdx !== undefined && birthIdx >= opPendingIdx) {
				// Predecessor's wire op is submitted later than this one; not yet on
				// the wire at the time of submission.
				continue;
			}
			return entry.entryId;
		}
		return undefined;
	}

	/**
	 * Walk forward from the given insertEntry collecting its chain — insert + any
	 * `moveEntry` hops + a terminating `deleteEntry` or deleting `toggle`. Returns
	 * the chain ops and entryIds touched if the chain ends in a deleted state;
	 * undefined otherwise. Ignores forward dependencies; rewrite handling lives in
	 * the caller.
	 */
	private walkInsertChain(
		insertOp: SharedArrayPendingOp<T>,
	): { ops: SharedArrayPendingOp<T>[]; entries: Set<string> } | undefined {
		const startIdx = this.pendingOps.indexOf(insertOp);
		if (startIdx === -1) {
			return undefined;
		}

		let currentEntry = insertOp.entryId;
		let isCurrentlyDeleted = false;
		const ops: SharedArrayPendingOp<T>[] = [insertOp];
		const entries = new Set<string>([currentEntry]);

		for (let i = startIdx + 1; i < this.pendingOps.length; i++) {
			const candidate = this.pendingOps[i];
			assert(candidate !== undefined, 0xcf9 /* pendingOps index in range */);
			const sourceMatches = candidate.entryId === currentEntry;
			const targetMatches = candidate.targetEntryId === currentEntry;
			if (!sourceMatches && !targetMatches) {
				continue;
			}
			if (candidate.type === OperationType.deleteEntry && sourceMatches) {
				ops.push(candidate);
				isCurrentlyDeleted = true;
				continue;
			}
			if (candidate.type === OperationType.toggle && sourceMatches) {
				ops.push(candidate);
				isCurrentlyDeleted = (candidate.op as IToggleOperation).isDeleted;
				continue;
			}
			if (candidate.type === OperationType.moveEntry && sourceMatches) {
				ops.push(candidate);
				assert(
					candidate.targetEntryId !== undefined,
					0xcfa /* moveEntry pendingOp has target */,
				);
				currentEntry = candidate.targetEntryId;
				entries.add(currentEntry);
				isCurrentlyDeleted = false;
				continue;
			}
			// toggleMove or a move-into-chain rewires the skip list in ways the walker
			// can't safely compose; bail.
			return undefined;
		}

		return isCurrentlyDeleted ? { ops, entries } : undefined;
	}

	/**
	 * Tracks the doubly linked skip list for the given entry to identify local pending counter attribute.
	 * It signifies if a local pending operation exists for the payload/value being tracked in the skip list
	 *
	 * returns true if counterAttribute's count \> 0
	 * @param entryId - id for which counter attribute is to be tracked in chian.
	 * @param counterAttribute - flag or property name from SharedArrayEntry whose counter is to be tracked.
	 */
	private isLocalPending(
		entryId: string,
		counterAttribute: keyof SharedArrayEntry<T>,
	): boolean {
		const getCounterAttributeValue = (
			entry: SharedArrayEntry<T>,
			counterAttr: keyof SharedArrayEntry<T>,
		): number => {
			return entry[counterAttr] as number;
		};

		const inputEntry = this.getEntryForId(entryId);
		let prevEntryId = inputEntry.prevEntryId;
		let nextEntryId = inputEntry.nextEntryId;
		if (getCounterAttributeValue(inputEntry, counterAttribute) > 0) {
			return true;
		}
		// track back in chain
		while (prevEntryId !== undefined && prevEntryId) {
			const prevEntry = this.getEntryForId(prevEntryId);
			if (getCounterAttributeValue(prevEntry, counterAttribute)) {
				return true;
			}
			prevEntryId = prevEntry.prevEntryId;
		}

		// track forward in the chain
		while (nextEntryId !== undefined && nextEntryId) {
			const nextEntry = this.getEntryForId(nextEntryId);
			if (getCounterAttributeValue(nextEntry, counterAttribute)) {
				return true;
			}
			nextEntryId = nextEntry.nextEntryId;
		}

		return false;
	}

	private getEntryForId(entryId: string): SharedArrayEntry<T> {
		return this.idToEntryMap.get(entryId) as SharedArrayEntry<T>;
	}

	protected override processMessagesCore(messagesCollection: IRuntimeMessageCollection): void {
		const { envelope, local, messagesContent } = messagesCollection;
		for (const messageContent of messagesContent) {
			this.processMessage(envelope, messageContent, local);
		}
	}

	private processMessage(
		messageEnvelope: ISequencedMessageEnvelope,
		messageContent: IRuntimeMessagesContent,
		local: boolean,
	): void {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
		if (messageEnvelope.type === MessageType.Operation) {
			const op = messageContent.contents as ISharedArrayOperation<T>;
			switch (op.type) {
				case OperationType.insertEntry: {
					this.handleInsertOp<SerializableTypeForSharedArray>(
						op.entryId,
						op.insertAfterEntryId,
						local,
						op.value,
					);
					break;
				}
				case OperationType.deleteEntry: {
					this.handleDeleteOp(op, local);
					break;
				}
				case OperationType.moveEntry: {
					this.handleMoveOp(op, local);
					break;
				}
				case OperationType.toggle: {
					this.handleToggleOp(op, local);
					break;
				}
				case OperationType.toggleMove: {
					this.handleToggleMoveOp(op, local);
					break;
				}

				default: {
					throw new Error("Unknown operation");
				}
			}
			if (local) {
				// Pending ops are FIFO-consumed on local ack. Squash-drops splice their
				// entries out earlier in {@link reSubmitSquashed}, so the shifted entry
				// here always matches the op being acked.
				this.pendingOps.shift();
				this.cachedSquashPlan = undefined;
				this.stagingBoundaryIdx = undefined;
			} else {
				this.emitValueChangedEvent(op, local);
			}
		}
	}

	private handleInsertOp<TWrite>(
		entryId: string,
		insertAfterEntryId: string | undefined,
		local: boolean,
		value: Serializable<TWrite> & T,
	): void {
		let index = 0;
		if (local) {
			this.getEntryForId(entryId).isAckPending = false;
		} else {
			if (insertAfterEntryId !== undefined) {
				index = this.findIndexOfEntryId(insertAfterEntryId) + 1;
			}
			const newEntry = this.createNewEntry(entryId, value);
			newEntry.isAckPending = false;
			this.addEntry(this.getInternalInsertIndexByIgnoringLocalPendingInserts(index), newEntry);
		}
	}

	private handleDeleteOp(op: IDeleteOperation, local: boolean): void {
		const opEntry = this.getEntryForId(op.entryId);
		if (local) {
			// Decrementing local pending counter as op is already applied to local state
			opEntry.isLocalPendingDelete -= 1;
			this.remoteDeleteWithLocalPendingDelete.delete(op.entryId);
		} else {
			if (this.isLocalPending(op.entryId, "isLocalPendingDelete")) {
				this.remoteDeleteWithLocalPendingDelete.add(op.entryId);
			} else {
				// last element in skip list is the most recent and live entry, so marking it deleted
				this.getLiveEntry(op.entryId).isDeleted = true;
			}
		}
	}

	private handleMoveOp(op: IMoveOperation, local: boolean): void {
		const opEntry = this.getEntryForId(op.entryId);
		this.handleInsertOp<SerializableTypeForSharedArray>(
			op.changedToEntryId,
			op.insertAfterEntryId,
			local,
			opEntry.value,
		);
		if (local) {
			// decrement the local pending move op as its already applied to local state
			opEntry.isLocalPendingMove -= 1;
		} else {
			const newElementEntryId = op.changedToEntryId;
			const newElement = this.getEntryForId(newElementEntryId);
			// If local pending then simply mark the new location dead as finally the local op will win
			if (
				this.isLocalPending(op.entryId, "isLocalPendingDelete") ||
				this.isLocalPending(op.entryId, "isLocalPendingMove")
			) {
				this.updateDeadEntry(op.entryId, newElementEntryId);
			} else {
				// move the element
				const liveEntry = this.getLiveEntry(op.entryId);
				const isDeleted = liveEntry.isDeleted;
				this.updateLiveEntry(liveEntry.entryId, newElementEntryId);
				// mark newly added element as deleted if existing live element was already deleted
				if (isDeleted) {
					newElement.isDeleted = isDeleted;
				}
			}
		}
	}

	private handleToggleOp(op: IToggleOperation, local: boolean): void {
		const opEntry = this.getEntryForId(op.entryId);
		if (local) {
			// decrement the local pending delete op as its already applied to local state
			if (opEntry.isLocalPendingDelete) {
				opEntry.isLocalPendingDelete -= 1;
			}
		} else {
			if (!this.isLocalPending(op.entryId, "isLocalPendingDelete")) {
				this.getLiveEntry(op.entryId).isDeleted = op.isDeleted;
			}
		}
	}

	private handleToggleMoveOp(op: IToggleMoveOperation, local: boolean): void {
		const opEntry = this.getEntryForId(op.entryId);
		if (local) {
			// decrement the local pending move op as its already applied to local state
			if (opEntry.isLocalPendingMove) {
				opEntry.isLocalPendingMove -= 1;
			}
		} else if (
			!this.isLocalPending(op.entryId, "isLocalPendingDelete") &&
			!this.isLocalPending(op.entryId, "isLocalPendingMove") &&
			this.getLiveEntry(op.entryId).isDeleted === false
		) {
			this.updateLiveEntry(this.getLiveEntry(op.entryId).entryId, op.entryId);
		}
	}

	private findInternalIndex(countEntries: number): number {
		if (countEntries < 0) {
			throw new Error("Input count is zero");
		}

		let countDown = countEntries;
		let entriesIterator = 0;
		for (; entriesIterator < this.sharedArray.length; entriesIterator = entriesIterator + 1) {
			const entry = this.sharedArray[entriesIterator];
			assert(entry !== undefined, 0xb93 /* Invalid index */);
			if (entry.isDeleted === false) {
				if (countDown === 0) {
					return entriesIterator;
				}
				countDown = countDown - 1;
			}
		}
		throw new Error(`Count of live entries is less than required`);
	}

	private findInternalInsertionIndex(index: number): number {
		return index === 0 ? index : this.findInternalIndex(index - 1) + 1;
	}

	private findInternalDeletionIndex(index: number): number {
		return this.findInternalIndex(index);
	}

	private createAddEntry<TWrite>(index: number, value: Serializable<TWrite> & T): string {
		const newEntry = this.createNewEntry(uuid(), value);
		this.addEntry(index, newEntry);
		return newEntry.entryId;
	}

	private addEntry(insertIndex: number, newEntry: SharedArrayEntry<T>): void {
		// in scenario where we populate 100K rows, we insert them all at the end of array.
		// slicing array is way slower than pushing elements.
		if (insertIndex === this.sharedArray.length) {
			this.sharedArray.push(newEntry);
		} else {
			this.sharedArray.splice(insertIndex, 0 /* deleteCount */, newEntry);
		}

		// Updating the idToEntryMap optimizer data set as new entry has been added
		this.idToEntryMap.set(newEntry.entryId, newEntry);
	}

	private emitValueChangedEvent(op: ISharedArrayOperation, isLocal: boolean): void {
		this.emit("valueChanged", op, isLocal, this);
	}

	private emitRevertibleEvent(op: ISharedArrayOperation): void {
		const revertible = new SharedArrayRevertible(this, op);
		this.emit("revertible", revertible);
	}

	private deleteCore(index: number): void {
		const entry = this.sharedArray[index];
		assert(entry !== undefined, 0xb94 /* Invalid index */);

		if (entry.isDeleted) {
			throw new Error("Entry already deleted.");
		}
		entry.isDeleted = true;

		// Adding local pending counter
		entry.isLocalPendingDelete += 1;
	}

	private createMoveEntry(oldIndex: number, newIndex: number): string {
		const oldEntry = this.sharedArray[oldIndex];
		assert(oldEntry !== undefined, 0xb95 /* Invalid index */);
		const newEntry = this.createNewEntry<SerializableTypeForSharedArray>(
			uuid(),
			oldEntry.value,
			oldEntry.entryId,
		);

		oldEntry.isDeleted = true;
		oldEntry.nextEntryId = newEntry.entryId;

		// Adding local pending counter
		oldEntry.isLocalPendingMove += 1;

		this.addEntry(newIndex /* insertIndex */, newEntry);

		return newEntry.entryId;
	}

	/**
	 * Creates new entry of type SharedArrayEntry interface.
	 * @param entryId - id for which new entry is created
	 * @param value - value for the new entry
	 * @param prevEntryId - prevEntryId if exists to update the previous pointer of double ended linked list
	 */
	private createNewEntry<TWrite>(
		entryId: string,
		value: Serializable<TWrite> & T,
		prevEntryId?: string,
	): SharedArrayEntry<T> {
		return {
			entryId,
			value,
			isAckPending: true,
			isDeleted: false,
			prevEntryId,
			nextEntryId: undefined,
			isLocalPendingDelete: 0,
			isLocalPendingMove: 0,
		};
	}

	/**
	 * Unsets all local flags used by the DDS. This method can be used after reading from snapshott to ensure
	 * local flags are initialized for use by the DDS.
	 * @param entry - Entry for which the local flags have to be cleaned up
	 */
	private unsetLocalFlags(entry: SharedArrayEntry<T>): void {
		entry.isAckPending = false;
		entry.isLocalPendingDelete = 0;
		entry.isLocalPendingMove = 0;
	}

	/**
	 * Returns the index of the first entry starting with startIndex that does not have the isAckPending flag
	 */
	private getInternalInsertIndexByIgnoringLocalPendingInserts(startIndex: number): number {
		let localOpsIterator = startIndex;
		for (
			;
			localOpsIterator < this.sharedArray.length;
			localOpsIterator = localOpsIterator + 1
		) {
			const entry = this.sharedArray[localOpsIterator];
			assert(entry !== undefined, 0xb96 /* Invalid index */);
			if (!entry.isAckPending) {
				break;
			}
		}
		return localOpsIterator;
	}

	private findIndexOfEntryId(entryId: string | undefined): number {
		for (let index = 0; index < this.sharedArray.length; index = index + 1) {
			if (this.sharedArray[index]?.entryId === entryId) {
				return index;
			}
		}
		return -1;
	}

	private prepareToMakeEntryIdLive(entry: SharedArrayEntry<T>): void {
		const prevIndex = this.findIndexOfEntryId(entry.prevEntryId);
		const nextIndex = this.findIndexOfEntryId(entry.nextEntryId);
		if (prevIndex !== -1) {
			const prevEntry = this.sharedArray[prevIndex];
			assert(prevEntry !== undefined, 0xb97 /* Invalid index */);
			prevEntry.nextEntryId = entry.nextEntryId;
		}
		if (nextIndex !== -1) {
			const nextEntry = this.sharedArray[nextIndex];
			assert(nextEntry !== undefined, 0xb98 /* Invalid index */);
			nextEntry.prevEntryId = entry.prevEntryId;
		}
		entry.prevEntryId = undefined;
		entry.nextEntryId = undefined;
	}

	/**
	 * Method that returns the live entry.
	 * The shared array internally can store a skip list of all related entries which got created
	 * due to move operations for the same payload/value. However, all elements except for one element
	 * can have isDeleted flag as false indicating this is the live entry for the value.
	 * Current implementation ensures that the last element in the skip list of entries is the liveEntry/
	 * last live entry
	 *
	 * @param entryId - Entry id of any node in the skip list for the same payload/value
	 */
	private getLiveEntry(entryId: string): SharedArrayEntry<T> {
		let liveEntry = this.getEntryForId(entryId);
		while (liveEntry.nextEntryId !== undefined && liveEntry.nextEntryId) {
			liveEntry = this.getEntryForId(liveEntry.nextEntryId);
		}
		return liveEntry;
	}

	/**
	 * We track sequence of moves for a entry in the shared array using doubly linked skip list.
	 * This utility function helps us keep track of the current position of an entry.value by marking the entry
	 * at previous position deleted and appending the entry at the new position at the end of the double linked
	 * list for that entry.value.
	 */
	private updateLiveEntry(oldLiveEntryEntryId: string, newLiveEntryEntryId: string): void {
		const oldLiveEntry = this.getEntryForId(oldLiveEntryEntryId);
		const newLiveEntry = this.getEntryForId(newLiveEntryEntryId);
		if (oldLiveEntryEntryId === newLiveEntryEntryId) {
			oldLiveEntry.isDeleted = false;
		} else {
			this.prepareToMakeEntryIdLive(newLiveEntry);
			// Make entryId live
			oldLiveEntry.nextEntryId = newLiveEntryEntryId;
			newLiveEntry.prevEntryId = oldLiveEntryEntryId;
			newLiveEntry.isDeleted = false;
			oldLiveEntry.isDeleted = true;
		}
	}

	/**
	 * We track sequence of moves for a entry in the shared array using doubly linked skip list.
	 * This utility function helps to insert the new entry as dead entry and reconnecting the double linked list with
	 * existingEntry -\> deadeEntry(appended) -\> existing chain(if any).
	 */
	private updateDeadEntry(existingEntryId: string, deadEntryId: string): void {
		const existingEntry = this.getEntryForId(existingEntryId);
		const deadEntry = this.getEntryForId(deadEntryId);

		// update dead entry's next to existingEntry's next, if existingEntry's next entry exists.
		// It can be undefined if the exiting element is the last element (or only element) of chain.
		if (existingEntry.nextEntryId !== undefined) {
			deadEntry.nextEntryId = existingEntry.nextEntryId;
			this.getEntryForId(existingEntry.nextEntryId).prevEntryId = deadEntryId;
		}

		// update current entry's next pointer to dead entry and vice versa.
		existingEntry.nextEntryId = deadEntryId;
		deadEntry.prevEntryId = existingEntryId;
		deadEntry.isDeleted = true;
	}

	private handleStashedInsert(
		entryId: string,
		insertAfterEntryId: string | undefined,
		value: Serializable<SerializableTypeForSharedArray> & T,
	): void {
		let index = 0;
		if (insertAfterEntryId !== undefined) {
			index = this.findIndexOfEntryId(insertAfterEntryId) + 1;
		}
		const newEntry = this.createNewEntry<SerializableTypeForSharedArray>(entryId, value);
		newEntry.isAckPending = true;
		this.addEntry(index, newEntry);
	}

	protected applyStashedOp(content: unknown): void {
		const op = content as ISharedArrayOperation<T>;

		switch (op.type) {
			case OperationType.insertEntry: {
				this.handleStashedInsert(
					op.entryId,
					op.insertAfterEntryId,
					op.value as Serializable<SerializableTypeForSharedArray> & T,
				);
				break;
			}
			case OperationType.deleteEntry: {
				this.getLiveEntry(op.entryId).isDeleted = true;
				this.getEntryForId(op.entryId).isLocalPendingDelete += 1;
				break;
			}
			case OperationType.moveEntry: {
				const opEntry = this.getEntryForId(op.entryId);
				this.handleStashedInsert(
					op.changedToEntryId,
					op.insertAfterEntryId,
					opEntry.value as Serializable<SerializableTypeForSharedArray> & T,
				);

				const newElementEntryId = op.changedToEntryId;
				const newElement = this.getEntryForId(newElementEntryId);
				if (
					this.isLocalPending(op.entryId, "isLocalPendingDelete") ||
					this.isLocalPending(op.entryId, "isLocalPendingMove")
				) {
					this.updateDeadEntry(op.entryId, newElementEntryId);
				} else {
					// move the element
					const liveEntry = this.getLiveEntry(op.entryId);
					const isDeleted = liveEntry.isDeleted;
					this.updateLiveEntry(liveEntry.entryId, newElementEntryId);
					// mark newly added element as deleted if existing live element was already deleted
					if (isDeleted) {
						newElement.isDeleted = isDeleted;
					}
				}
				opEntry.isLocalPendingMove += 1;
				break;
			}
			case OperationType.toggle: {
				this.getLiveEntry(op.entryId).isDeleted = op.isDeleted;
				this.getEntryForId(op.entryId).isLocalPendingDelete += 1;
				break;
			}
			case OperationType.toggleMove: {
				this.updateLiveEntry(this.getLiveEntry(op.entryId).entryId, op.entryId);
				this.getEntryForId(op.entryId).isLocalPendingMove += 1;
				break;
			}
			default: {
				unreachableCase(op);
			}
		}
		this.submitArrayOp(op);
	}
}
