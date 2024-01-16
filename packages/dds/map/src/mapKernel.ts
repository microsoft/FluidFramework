/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IFluidSerializer, ValueType } from "@fluidframework/shared-object-base";
import { assert } from "@fluidframework/core-utils";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { RedBlackTree } from "@fluidframework/merge-tree";
import {
	// eslint-disable-next-line import/no-deprecated
	ISerializableValue,
	ISerializedValue,
	ISharedMapEvents,
} from "./interfaces";
import {
	IMapSetOperation,
	IMapDeleteOperation,
	IMapClearOperation,
	IMapKeyEditLocalOpMetadata,
	IMapKeyAddLocalOpMetadata,
	IMapClearLocalOpMetadata,
	IMapKeyDeleteLocalOpMetadata,
} from "./internalInterfaces";
import { ILocalValue, LocalValueMaker, makeSerializable } from "./localValues";
import { CreationIndexTracker } from "./creationIndexTracker";

/**
 * Defines the means to process and submit a given op on a map.
 */
interface IMapMessageHandler {
	/**
	 * Apply the given operation.
	 * @param op - The map operation to apply
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	process(op: IMapOperation, local: boolean, localOpMetadata: MapLocalOpMetadata): void;

	/**
	 * Communicate the operation to remote clients.
	 * @param op - The map operation to submit
	 * @param localOpMetadata - The metadata to be submitted with the message.
	 */
	submit(op: IMapOperation, localOpMetadata: MapLocalOpMetadata): void;

	applyStashedOp(op: IMapOperation): MapLocalOpMetadata;
}

/**
 * Map key operations are one of several types.
 */
export type IMapKeyOperation = IMapSetOperation | IMapDeleteOperation;

/**
 * Description of a map delta operation
 */
export type IMapOperation = IMapKeyOperation | IMapClearOperation;

/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 *
 * @remarks Directly used in
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
 * | JSON.stringify}, direct result from
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}.
 */
export interface IMapDataObjectSerializable {
	// eslint-disable-next-line import/no-deprecated
	[key: string]: ISerializableValue;
}

/**
 * Serialized key/value data.
 */
export interface IMapDataObjectSerialized {
	[key: string]: ISerializedValue;
}

type MapKeyLocalOpMetadata =
	| IMapKeyEditLocalOpMetadata
	| IMapKeyAddLocalOpMetadata
	| IMapKeyDeleteLocalOpMetadata;
type MapLocalOpMetadata = IMapClearLocalOpMetadata | MapKeyLocalOpMetadata;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

function isMapKeyLocalOpMetadata(metadata: any): metadata is MapKeyLocalOpMetadata {
	return (
		metadata !== undefined &&
		typeof metadata.pendingMessageId === "number" &&
		(metadata.type === "add" || metadata.type === "edit" || metadata.type === "delete")
	);
}

function isClearLocalOpMetadata(metadata: any): metadata is IMapClearLocalOpMetadata {
	return (
		metadata !== undefined &&
		metadata.type === "clear" &&
		typeof metadata.pendingMessageId === "number"
	);
}

function isMapLocalOpMetadata(metadata: any): metadata is MapLocalOpMetadata {
	return (
		metadata !== undefined &&
		typeof metadata.pendingMessageId === "number" &&
		(metadata.type === "add" ||
			metadata.type === "edit" ||
			metadata.type === "clear" ||
			metadata.type === "delete")
	);
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

function createClearLocalOpMetadata(
	op: IMapClearOperation,
	pendingClearMessageId: number,
	previousMap?: Map<string, ILocalValue>,
	previousAckedKeysTracker?: Map<string, number>,
	previousPendingSetTracker?: Map<string, number[]>,
	previousPendingDeleteTracker?: Map<string, number>,
): IMapClearLocalOpMetadata {
	const localMetadata: IMapClearLocalOpMetadata = {
		type: "clear",
		pendingMessageId: pendingClearMessageId,
		previousMap,
		previousAckedKeysTracker,
		previousPendingSetTracker,
		previousPendingDeleteTracker,
	};
	return localMetadata;
}

function createKeyLocalOpMetadata(
	op: IMapKeyOperation,
	pendingMessageId: number,
	previousValue?: ILocalValue,
	previousIndex?: (number | number[])[],
): MapKeyLocalOpMetadata {
	const localMetadata: MapKeyLocalOpMetadata = previousValue
		? previousIndex
			? { type: "delete", pendingMessageId, previousValue, previousIndex }
			: { type: "edit", pendingMessageId, previousValue }
		: { type: "add", pendingMessageId };
	return localMetadata;
}

/**
 * The comparator essentially performs the following procedure to determine the order of entry creation:
 * 1. If entry A has a non-negative 'seq' and entry B has a negative 'seq', entry A is always placed first due to
 * the policy that acknowledged entries precede locally created ones that have not been committed yet.
 *
 * 2. When both entries A and B have a non-negative 'seq', they are compared as follows:
 * - If A and B have different 'seq', they are ordered based on 'seq', and the one with the lower 'seq' will be positioned ahead. Notably this rule
 * should not be applied in the entries ordering, since the lowest 'seq' is -1, when the directory is created locally but not acknowledged yet.
 * - In the case where A and B have equal 'seq', the one with the lower 'clientSeq' will be positioned ahead. This scenario occurs when grouped
 * batching is enabled, and a lower 'clientSeq' indicates that it was processed earlier after the batch was ungrouped.
 *
 * 3. When both entries A and B have a negative 'seq', they are compared as follows:
 * - If A and B have different 'seq', the one with lower 'seq' will be positioned ahead, which indicates the corresponding creation message was
 * acknowledged by the server earlier.
 * - If A and B have equal 'seq', the one with lower 'clientSeq' will be placed at the front. This scenario suggests that both entries A
 * and B were created locally and not acknowledged yet, with the one possessing the lower 'clientSeq' being created earlier.
 *
 * 4. A 'seq' value of zero indicates that the entry was created in detached state, and it is considered acknowledged for the
 * purpose of ordering.
 */
const seqDataComparator = (a: SequenceData, b: SequenceData) => {
	if (isAcknowledgedOrDetached(a)) {
		if (isAcknowledgedOrDetached(b)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return a.seq !== b.seq ? a.seq - b.seq : a.clientSeq! - b.clientSeq!;
		} else {
			return -1;
		}
	} else {
		if (!isAcknowledgedOrDetached(b)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			return a.seq !== b.seq ? a.seq - b.seq : a.clientSeq! - b.clientSeq!;
		} else {
			return 1;
		}
	}
};

function isAcknowledgedOrDetached(seqData: SequenceData) {
	return seqData.seq >= 0;
}

/**
 * The combination of sequence numebr and client sequence number of an entry
 */
interface SequenceData {
	seq: number;
	clientSeq?: number;
}

class MapCreationTracker {
	readonly indexToKey: RedBlackTree<SequenceData, string>;
	readonly keyToIndex: Map<string, SequenceData[]>;

	constructor() {
		this.indexToKey = new RedBlackTree<SequenceData, string>(seqDataComparator);
		this.keyToIndex = new Map<string, SequenceData[]>();
	}

	set(key: string, seqData: SequenceData): void {
		if (!this.keyToIndex.has(key)) {
			this.keyToIndex.set(key, []);
			this.keyToIndex.get(key)?.push(seqData);
			this.indexToKey.put(seqData, key);
		} else {
			this.keyToIndex.get(key)?.push(seqData);
		}
	}

	has(keyOrSeqData: string | SequenceData): boolean {
		return typeof keyOrSeqData === "string"
			? this.keyToIndex.has(keyOrSeqData)
			: this.indexToKey.get(keyOrSeqData) !== undefined;
	}

	delete(key: string): void {
		if (this.has(key)) {
			const firstSeqData = this.keyToIndex.get(key)?.[0];
			this.indexToKey.remove(firstSeqData as SequenceData);
			this.keyToIndex.delete(key);
		}
	}

	/**
	 * Retrieves all entries with creation order that satisfy an optional constraint function.
	 * @param constraint - An optional constraint function that filters keys.
	 * @returns An array of keys that satisfy the constraint (or all keys if no constraint is provided).
	 */
	keys(constraint?: (key: string) => boolean): string[] {
		const keys: string[] = [];
		this.indexToKey.mapRange((node) => {
			if (!constraint || constraint(node.data)) {
				keys.push(node.data);
			}
			return true;
		}, keys);
		return keys;
	}
}

/**
 * A SharedMap is a map-like distributed data structure.
 */
export class MapKernel {
	/**
	 * The number of key/value pairs stored in the map.
	 */
	public get size(): number {
		return this.data.size;
	}

	/**
	 * Mapping of op types to message handlers.
	 */
	private readonly messageHandlers: ReadonlyMap<string, IMapMessageHandler> = new Map();

	/**
	 * The in-memory data the map is storing.
	 */
	private readonly data = new Map<string, ILocalValue>();

	/**
	 * Keys that have been modified locally but not yet ack'd from the server.
	 */
	private readonly pendingKeys: Map<string, number[]> = new Map();

	/**
	 * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
	 */
	private pendingMessageId: number = -1;

	/**
	 * The pending ids of any clears that have been performed locally but not yet ack'd from the server
	 */
	private readonly pendingClearMessageIds: number[] = [];

	/**
	 * Object to create encapsulations of the values stored in the map.
	 */
	private readonly localValueMaker: LocalValueMaker;

	/**
	 * Assigns a unique ID to each acknowledged entry created in the map, facilitating the tracking
	 * of key creation order.
	 *
	 * TODO: Consider replacing it with the sequence number for potential future attribution purposes.
	 */
	private creationIndex: number = -1;

	/**
	 * Maintains a bidirectional association between acked keys and the order in which they were inserted.
	 * This helps to ensure iteration order which is consistent with the JS map spec.
	 */
	private readonly ackedKeysIndexTracker = new CreationIndexTracker();

	/**
	 * Similar to {@link ackedKeysIndexTracker}, but for local (unacked) entries.
	 */
	private readonly localKeysIndexTracker = new CreationIndexTracker(false);

	/**
	 * The object to store the all pending sets' message ids since the last local delete/clear
	 */
	private readonly pendingSetTracker: Map<string, number[]> = new Map();

	/**
	 * Entries that have been deleted locally but not yet ack'd.
	 * The value is the number of pending delete ops for the given map key, *not* a pendingMessageId.
	 */
	private readonly pendingDeleteTracker: Map<string, number> = new Map();

	/**
	 * Create a new shared map kernel.
	 * @param serializer - The serializer to serialize / parse handles
	 * @param handle - The handle of the shared object using the kernel
	 * @param submitMessage - A callback to submit a message through the shared object
	 * @param isAttached - To query whether the shared object should generate ops
	 * @param valueTypes - The value types to register
	 * @param eventEmitter - The object that will emit map events
	 */
	public constructor(
		private readonly serializer: IFluidSerializer,
		private readonly handle: IFluidHandle,
		private readonly submitMessage: (op: unknown, localOpMetadata: unknown) => void,
		private readonly isAttached: () => boolean,
		private readonly eventEmitter: TypedEventEmitter<ISharedMapEvents>,
	) {
		this.localValueMaker = new LocalValueMaker(serializer);
		this.messageHandlers = this.getMessageHandlers();
	}

	/**
	 * Get an iterator over the keys in this map.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		if (!this.isAttached()) {
			return this.data.keys();
		}
		const keys = this.getKeysInCreationOrder();
		const iterator = {
			index: 0,
			next(): IteratorResult<string> {
				if (this.index < keys.length) {
					return { value: keys[this.index++], done: false };
				}
				return { value: undefined, done: true };
			},
			[Symbol.iterator](): IterableIterator<string> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	public entries(): IterableIterator<[string, any]> {
		const keys = Array.from(this.keys());
		const localEntriesIterator = {
			index: 0,
			map: this.data,
			next(): IteratorResult<[string, any]> {
				if (this.index < keys.length) {
					const key = keys[this.index++];
					const localValue = this.map.get(key);
					return { value: [key, localValue], done: false };
				}
				return { value: undefined, done: true };
			},
			[Symbol.iterator](): IterableIterator<[string, any]> {
				return this;
			},
		};

		return {
			next(): IteratorResult<[string, any]> {
				const nextVal = localEntriesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: { value: [nextVal.value[0], nextVal.value[1].value], done: false };
			},
			[Symbol.iterator](): IterableIterator<[string, any]> {
				return this;
			},
		};
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	public values(): IterableIterator<any> {
		const keys = Array.from(this.keys());
		const localValuesIterator = {
			index: 0,
			map: this.data,
			next(): IteratorResult<any> {
				if (this.index < keys.length) {
					const key = keys[this.index++];
					const localValue = this.map.get(key);
					return { value: localValue, done: false };
				}
				return { value: undefined, done: true };
			},
			[Symbol.iterator](): IterableIterator<any> {
				return this;
			},
		};

		return {
			next(): IteratorResult<any> {
				const nextVal = localValuesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: { value: nextVal.value.value, done: false };
			},
			[Symbol.iterator](): IterableIterator<any> {
				return this;
			},
		};
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public [Symbol.iterator](): IterableIterator<[string, any]> {
		return this.entries();
	}

	/**
	 * Executes the given callback on each entry in the map.
	 * @param callbackFn - Callback function
	 */
	public forEach(
		callbackFn: (value: unknown, key: string, map: Map<string, unknown>) => void,
	): void {
		// eslint-disable-next-line unicorn/no-array-for-each
		this.data.forEach((localValue, key, m) => {
			callbackFn(localValue.value, key, m);
		});
	}

	/**
	 * We currently make a copy of the map's keys when one of its iteration methods is called.
	 * This guarantees it's safe to use the iterator even after map mutation (as long
	 * as it's acceptable to return only the map content that existed before mutation).
	 * If we didn't have this requirement, we could be a bit more efficient here by
	 * implementing an O(1) auxiliary memory iterator on RedBlackTree and using that.
	 */
	private getKeysInCreationOrder(): string[] {
		// Get both ack'd and local uncommitted keys in creation order
		const ackedKeys = this.ackedKeysIndexTracker.keys();
		const localKeys = this.localKeysIndexTracker.keys(
			(key) => !this.ackedKeysIndexTracker.has(key),
		);

		const keys = [...ackedKeys, ...localKeys];

		assert(
			keys.length === this.data.size,
			"The count of keys for iteration should be consistent with the size of actual data",
		);

		return keys;
	}

	/**
	 * {@inheritDoc ISharedMap.get}
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public get<T = any>(key: string): T | undefined {
		const localValue = this.data.get(key);
		return localValue === undefined ? undefined : (localValue.value as T);
	}

	/**
	 * Check if a key exists in the map.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public has(key: string): boolean {
		return this.data.has(key);
	}

	/**
	 * {@inheritDoc ISharedMap.set}
	 */
	public set(key: string, value: unknown): void {
		// Undefined/null keys can't be serialized to JSON in the manner we currently snapshot.
		if (key === undefined || key === null) {
			throw new Error("Undefined and null keys are not supported");
		}

		// Create a local value and serialize it.
		const localValue = this.localValueMaker.fromInMemory(value);
		const serializableValue = makeSerializable(localValue, this.serializer, this.handle);

		// Set the value locally.
		const previousValue = this.setCore(key, localValue, true);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		const op: IMapSetOperation = {
			key,
			type: "set",
			value: serializableValue,
		};

		const messageId = this.getMapKeyMessageId(op);
		this.updatePendingSetIds(op, messageId);
		this.submitMapKeyMessage(op, messageId, previousValue);
	}

	/**
	 * Delete a key from the map.
	 * @param key - Key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		// Delete the key locally first.
		const previousValue = this.deleteCore(key, true);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return previousValue !== undefined;
		}

		// Update the unack'd deletion record
		this.incrementPendingDeleteCount(key);

		// Remove the key from ack'd insertions or all associated local pending set op's, it depends on
		// whether the key is already ack'd or not
		const previousIndex = this.deleteKeysIndex(key);

		const op: IMapDeleteOperation = {
			key,
			type: "delete",
		};

		const messageId = this.getMapKeyMessageId(op);
		this.updatePendingSetIds(op, messageId);
		this.submitMapKeyMessage(op, messageId, previousValue, previousIndex);

		return previousValue !== undefined;
	}

	private deleteKeysIndex(key: string): (number | number[])[] {
		const previousIndex: (number | number[])[] = [];

		// If the deleted key is already ack'd, remove and backup its creation index
		if (this.ackedKeysIndexTracker.has(key)) {
			const index = this.ackedKeysIndexTracker.get(key) as number;
			previousIndex.push(index);
			this.ackedKeysIndexTracker.delete(key);
		}
		// If there exist pending set ops targeted on the deleted key, remove and backup
		// the associated pending message ids
		if (this.pendingSetTracker.has(key)) {
			const pendingSetIds = this.pendingSetTracker.get(key) as number[];
			previousIndex.push([...pendingSetIds]);
			this.localKeysIndexTracker.delete(pendingSetIds[0]);
			this.pendingSetTracker.delete(key);
		}

		return previousIndex;
	}

	/**
	 * Clear all data from the map.
	 */
	public clear(): void {
		const dataCopy = this.isAttached() ? new Map<string, ILocalValue>(this.data) : undefined;

		// Clear the data locally first.
		this.clearCore(true);

		// Clear the pendingKeys immediately, the local unack'd operations are aborted
		this.pendingKeys.clear();

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		// Backup and empty all information of creation index
		const { ackedKeysTrackerCopy, pendingSetTrackerCopy, pendingDeleteTrackerCopy } =
			this.clearKeysIndex();

		const op: IMapClearOperation = {
			type: "clear",
		};
		this.submitMapClearMessage(
			op,
			dataCopy,
			ackedKeysTrackerCopy,
			pendingSetTrackerCopy,
			pendingDeleteTrackerCopy,
		);
	}

	private clearKeysIndex() {
		const ackedKeysTrackerCopy = new Map(this.ackedKeysIndexTracker.keyToIndex);
		const pendingSetTrackerCopy = new Map(this.pendingSetTracker);
		const pendingDeleteTrackerCopy = new Map(this.pendingDeleteTracker);

		this.ackedKeysIndexTracker.clear();
		this.localKeysIndexTracker.clear();
		this.pendingSetTracker.clear();
		this.pendingDeleteTracker.clear();

		return { ackedKeysTrackerCopy, pendingSetTrackerCopy, pendingDeleteTrackerCopy };
	}

	/**
	 * Serializes the data stored in the shared map to a JSON string
	 *
	 * There are two scenarios in which the creation index may be absent:
	 * 1. When the client is detached, we defer assigning the creation index until the data is about to be summarized.
	 * 2. When the client is attached, but data was created during the detached stage, the creation indices for that data are still missing.
	 * In both of these scenarios, the creation index is populated (starting from 0) before the summarization process begins.
	 *
	 * @param serializer - The serializer to use to serialize handles in its values.
	 * @returns A JSON string containing serialized map data
	 */
	public getSerializedStorage(serializer: IFluidSerializer): IMapDataObjectSerialized {
		const serializableMapData: IMapDataObjectSerialized = {};

		for (const [key, localValue] of this.data.entries()) {
			const serializedValue = localValue.makeSerialized(serializer, this.handle);

			if (!this.isAttached() || !this.ackedKeysIndexTracker.has(key)) {
				this.ackedKeysIndexTracker.set(key, ++this.creationIndex);
			}
			serializableMapData[key] = {
				...serializedValue,
				index: this.ackedKeysIndexTracker.get(key),
			};
		}

		return serializableMapData;
	}

	public getSerializableStorage(serializer: IFluidSerializer): IMapDataObjectSerializable {
		const serializableMapData: IMapDataObjectSerializable = {};

		for (const [key, localValue] of this.data.entries()) {
			const serializableValue = makeSerializable(localValue, serializer, this.handle);

			if (!this.isAttached() || !this.ackedKeysIndexTracker.has(key)) {
				this.ackedKeysIndexTracker.set(key, ++this.creationIndex);
			}
			serializableMapData[key] = {
				...serializableValue,
				index: this.ackedKeysIndexTracker.get(key),
			};
		}

		return serializableMapData;
	}

	public serialize(serializer: IFluidSerializer): string {
		return JSON.stringify(this.getSerializableStorage(serializer));
	}

	/**
	 * Populate the kernel with the given map data.
	 *
	 * If there exixts data created during the detached stage without assigned creation index, it is essential to populate these indices
	 * (starting from 0) and keep track of their count.
	 *
	 * Additionally, for loading data in the old format lacking an index field, it is necessary to populate the corresponding creation index
	 * based on the current value.
	 *
	 * @param data - A JSON string containing serialized map data
	 */
	public populateFromSerializable(json: IMapDataObjectSerializable): void {
		// Add creation index for the old data (if necessary)
		let detachedDataCount = 0;
		for (const key of this.data.keys()) {
			if (!this.ackedKeysIndexTracker.has(key)) {
				this.ackedKeysIndexTracker.set(key, ++this.creationIndex);
				detachedDataCount++;
			}
		}
		// Load the new data and maintain its order
		for (const [key, serializable] of Object.entries(json)) {
			const localValue = {
				key,
				value: this.makeLocal(key, serializable),
			};

			this.data.set(localValue.key, localValue.value);
			// fill the creation index for the loaded data
			if (!this.ackedKeysIndexTracker.has(localValue.key)) {
				this.ackedKeysIndexTracker.set(
					localValue.key,
					serializable.index !== undefined
						? detachedDataCount + serializable.index
						: ++this.creationIndex,
				);
			}
		}
		if (this.ackedKeysIndexTracker.size() > 0) {
			assert(
				this.ackedKeysIndexTracker.max() !== undefined,
				"There should exsit at least one data in the tracker",
			);
			this.creationIndex = this.ackedKeysIndexTracker.max() as number;
		}
	}

	public populate(json: string): void {
		this.populateFromSerializable(JSON.parse(json) as IMapDataObjectSerializable);
	}

	/**
	 * Submit the given op if a handler is registered.
	 * @param op - The operation to attempt to submit
	 * @param localOpMetadata - The local metadata associated with the op. This is kept locally by the runtime
	 * and not sent to the server. This will be sent back when this message is received back from the server. This is
	 * also sent if we are asked to resubmit the message.
	 * @returns True if the operation was submitted, false otherwise.
	 */
	public trySubmitMessage(op: IMapOperation, localOpMetadata: unknown): boolean {
		const handler = this.messageHandlers.get(op.type);
		if (handler === undefined) {
			return false;
		}
		handler.submit(op, localOpMetadata as MapLocalOpMetadata);
		return true;
	}

	public tryApplyStashedOp(op: IMapOperation): unknown {
		const handler = this.messageHandlers.get(op.type);
		if (handler === undefined) {
			throw new Error("no apply stashed op handler");
		}
		return handler.applyStashedOp(op);
	}

	/**
	 * Process the given op if a handler is registered.
	 * @param op - The message to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 * @returns True if the operation was processed, false otherwise.
	 */
	public tryProcessMessage(op: IMapOperation, local: boolean, localOpMetadata: unknown): boolean {
		const handler = this.messageHandlers.get(op.type);
		if (handler === undefined) {
			return false;
		}
		handler.process(op, local, localOpMetadata as MapLocalOpMetadata);
		return true;
	}

	/* eslint-disable @typescript-eslint/no-unsafe-member-access */

	/**
	 * Rollback a local op
	 * @param op - The operation to rollback
	 * @param localOpMetadata - The local metadata associated with the op.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	public rollback(op: any, localOpMetadata: unknown): void {
		if (!isMapLocalOpMetadata(localOpMetadata)) {
			throw new Error("Invalid localOpMetadata");
		}

		if (op.type === "clear" && localOpMetadata.type === "clear") {
			if (localOpMetadata.previousMap === undefined) {
				throw new Error("Cannot rollback without previous map");
			}
			// Rebuild the actual data
			for (const [key, localValue] of localOpMetadata.previousMap.entries()) {
				this.setCore(key, localValue, true);
			}
			// Rebuild the ackedKeysTracker and ackedInsertKeys
			if (localOpMetadata.previousAckedKeysTracker !== undefined) {
				for (const [key, index] of localOpMetadata.previousAckedKeysTracker) {
					this.ackedKeysIndexTracker.set(key, index);
				}
			}

			// Rebuild the pendingSetTracker and localKeysIndex
			if (localOpMetadata.previousPendingSetTracker !== undefined) {
				for (const [key, messageIds] of localOpMetadata.previousPendingSetTracker) {
					this.pendingSetTracker.set(key, Array.from(messageIds));
					this.localKeysIndexTracker.set(key, messageIds[0]);
				}
			}

			// Rebuild the pendingDeleteTracker
			if (localOpMetadata.previousPendingDeleteTracker !== undefined) {
				for (const [key, count] of localOpMetadata.previousPendingDeleteTracker) {
					this.pendingDeleteTracker.set(key, count);
				}
			}

			const lastPendingClearId = this.pendingClearMessageIds.pop();
			if (
				lastPendingClearId === undefined ||
				lastPendingClearId !== localOpMetadata.pendingMessageId
			) {
				throw new Error("Rollback op does match last clear");
			}
		} else if (op.type === "delete" || op.type === "set") {
			if (localOpMetadata.type === "add") {
				this.deleteCore(op.key as string, true);

				// Remove the associated pending message id from the pendingSetTracker, it must
				// exist in localKeysIndex since it is an "add" operation
				this.localKeysIndexTracker.delete(localOpMetadata.pendingMessageId);
				this.pendingSetTracker.delete(op.key);
			} else if (
				localOpMetadata.type === "edit" &&
				localOpMetadata.previousValue !== undefined
			) {
				this.setCore(op.key as string, localOpMetadata.previousValue, true);

				// Remove the associated pending message id from the pendingSetTracker, it will not
				// exist in localKeysIndex since it is an "edit" operation
				const pendingSetIds = this.pendingSetTracker.get(op.key);
				const index = pendingSetIds?.indexOf(localOpMetadata.pendingMessageId) as number;
				pendingSetIds?.splice(index, 1);
			} else if (
				localOpMetadata.type === "delete" &&
				localOpMetadata.previousValue !== undefined &&
				localOpMetadata.previousIndex !== undefined
			) {
				this.setCore(op.key as string, localOpMetadata.previousValue, true);
				this.decrementPendingDeleteCount(op.key);

				for (const index of localOpMetadata.previousIndex) {
					if (typeof index === "number") {
						this.ackedKeysIndexTracker.set(op.key, index);
					} else {
						this.localKeysIndexTracker.set(op.key, index[0]);
						this.pendingSetTracker.set(op.key, index);
					}
				}
			} else {
				throw new Error("Cannot rollback without previous value or preivous position");
			}

			const pendingMessageIds = this.pendingKeys.get(op.key as string);
			const lastPendingMessageId = pendingMessageIds?.pop();
			if (!pendingMessageIds || lastPendingMessageId !== localOpMetadata.pendingMessageId) {
				throw new Error("Rollback op does not match last pending");
			}
			if (pendingMessageIds.length === 0) {
				this.pendingKeys.delete(op.key as string);
			}
		} else {
			throw new Error("Unsupported op for rollback");
		}
	}

	/* eslint-enable @typescript-eslint/no-unsafe-member-access */

	/**
	 * Set implementation used for both locally sourced sets as well as incoming remote sets.
	 * @param key - The key being set
	 * @param value - The value being set
	 * @param local - Whether the message originated from the local client
	 * @returns Previous local value of the key, if any
	 */
	private setCore(key: string, value: ILocalValue, local: boolean): ILocalValue | undefined {
		const previousLocalValue = this.data.get(key);
		const previousValue: unknown = previousLocalValue?.value;
		this.data.set(key, value);
		this.eventEmitter.emit("valueChanged", { key, previousValue }, local, this.eventEmitter);
		return previousLocalValue;
	}

	/**
	 * Clear implementation used for both locally sourced clears as well as incoming remote clears.
	 * @param local - Whether the message originated from the local client
	 */
	private clearCore(local: boolean): void {
		this.data.clear();
		this.eventEmitter.emit("clear", local, this.eventEmitter);
	}

	/**
	 * Delete implementation used for both locally sourced deletes as well as incoming remote deletes.
	 * @param key - The key being deleted
	 * @param local - Whether the message originated from the local client
	 * @returns Previous local value of the key if it existed, undefined if it did not exist
	 */
	private deleteCore(key: string, local: boolean): ILocalValue | undefined {
		const previousLocalValue = this.data.get(key);
		const previousValue: unknown = previousLocalValue?.value;
		const successfullyRemoved = this.data.delete(key);
		if (successfullyRemoved) {
			this.eventEmitter.emit(
				"valueChanged",
				{ key, previousValue },
				local,
				this.eventEmitter,
			);
		}
		return previousLocalValue;
	}

	/**
	 * Clear all keys in memory in response to a remote clear, but retain keys we have modified but not yet been ack'd.
	 */
	private clearExceptPendingKeys(): void {
		// Assuming the pendingKeys is small and the map is large
		// we will get the value for the pendingKeys and clear the map
		const temp = new Map<string, ILocalValue>();
		for (const key of this.pendingKeys.keys()) {
			// Verify if the most recent pending operation is a delete op, no need to retain it if so.
			// This ensures the map size remains consistent.
			if (this.data.has(key)) {
				temp.set(key, this.data.get(key) as ILocalValue);
			}
		}
		this.clearCore(false);
		for (const [key, value] of temp.entries()) {
			this.setCore(key, value, true);
		}
	}

	/**
	 * The remote ISerializableValue we're receiving (either as a result of a load or an incoming set op) will
	 * have the information we need to create a real object, but will not be the real object yet.  For example,
	 * we might know it's a map and the map's ID but not have the actual map or its data yet.  makeLocal's
	 * job is to convert that information into a real object for local usage.
	 * @param key - The key that the caller intends to store the local value into (used for ops later).  But
	 * doesn't actually store the local value into that key.  So better not lie!
	 * @param serializable - The remote information that we can convert into a real object
	 * @returns The local value that was produced
	 */
	// eslint-disable-next-line import/no-deprecated
	private makeLocal(key: string, serializable: ISerializableValue): ILocalValue {
		if (
			serializable.type === ValueType[ValueType.Plain] ||
			serializable.type === ValueType[ValueType.Shared]
		) {
			return this.localValueMaker.fromSerializable(serializable);
		} else {
			throw new Error("Unknown local value type");
		}
	}

	/**
	 * If our local operations that have not yet been ack'd will eventually overwrite an incoming operation, we should
	 * not process the incoming operation.
	 * @param op - Operation to check
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 * @returns True if the operation should be processed, false otherwise
	 */
	private needProcessKeyOperation(
		op: IMapKeyOperation,
		local: boolean,
		localOpMetadata: MapLocalOpMetadata,
	): boolean {
		if (this.pendingClearMessageIds.length > 0) {
			if (local) {
				assert(
					localOpMetadata !== undefined &&
						isMapKeyLocalOpMetadata(localOpMetadata) &&
						localOpMetadata.pendingMessageId < this.pendingClearMessageIds[0],
					0x013 /* "Received out of order op when there is an unackd clear message" */,
				);
			}
			// If we have an unack'd clear, we can ignore all ops.
			return false;
		}

		const pendingKeyMessageIds = this.pendingKeys.get(op.key);
		if (pendingKeyMessageIds !== undefined) {
			// Found an unack'd op. Clear it from the map if the pendingMessageId in the map matches this message's
			// and don't process the op.
			if (local) {
				assert(
					localOpMetadata !== undefined && isMapKeyLocalOpMetadata(localOpMetadata),
					0x014 /* pendingMessageId is missing from the local client's operation */,
				);
				assert(
					pendingKeyMessageIds[0] === localOpMetadata.pendingMessageId,
					0x2fa /* Unexpected pending message received */,
				);
				const pendingMessageId = pendingKeyMessageIds.shift();
				if (pendingKeyMessageIds.length === 0) {
					this.pendingKeys.delete(op.key);
				}

				// When handling a local set message, we should transfer the creation index information from the `localKeysIndexTracker`
				// to the `ackedKeysIndexTracker`, as long as the key hasn't been inserted and acked by remote clients.
				if (op.type === "set") {
					this.ackPendingSetOp(op, pendingMessageId);
				} else {
					// If the local message is delete, the pending delete count needs to be updated.
					this.decrementPendingDeleteCount(op.key);
				}
			} else {
				// When processing a remote set message, two conditions need to be met to move it to the `ackedKeysIndexTracker`:
				//  1. There are no pending local deletions associated with this key.
				//  2. The key has not been inserted and acked by other clients yet.
				if (
					op.type === "set" &&
					// this.data.has(op.key) &&
					!this.isKeyFinallyDeleted(op.key) &&
					!this.ackedKeysIndexTracker.has(op.key)
				) {
					this.ackedKeysIndexTracker.set(op.key, ++this.creationIndex);
				} else if (op.type === "delete") {
					// If the remote message is a delete, just remove it from the `ackedKeysIndexTracker` as long as it still exsits
					this.ackedKeysIndexTracker.delete(op.key);
				}
			}
			return false;
		}

		// If we don't have a NACK op on the key, we need to process the remote ops.
		return !local;
	}

	private isKeyFinallyDeleted(key: string): boolean {
		if (this.data.has(key)) {
			return false;
		}
		if (!this.data.has(key) && this.pendingDeleteTracker.has(key)) {
			return true;
		}
		return false;
	}

	private ackPendingSetOp(op: IMapKeyOperation, pendingMessageId?: number): void {
		// If the message id of the "earliest" existing pending op matches the current pendingMessageId,
		// we need to ack this op
		const pendingSetIds = this.pendingSetTracker.get(op.key);
		if (pendingSetIds !== undefined && pendingSetIds[0] === pendingMessageId) {
			if (!this.ackedKeysIndexTracker.has(op.key)) {
				this.ackedKeysIndexTracker.set(op.key, ++this.creationIndex);
			}

			pendingSetIds.shift();
			if (pendingSetIds.length === 0) {
				this.pendingSetTracker.delete(op.key);
			}
			// re-order the local inserted keys
			if (this.localKeysIndexTracker.has(pendingMessageId)) {
				this.localKeysIndexTracker.delete(pendingMessageId);
				if (pendingSetIds.length > 0) {
					this.localKeysIndexTracker.set(op.key, pendingSetIds[0]);
				}
			}
		}
	}

	/**
	 * Get the message handlers for the map.
	 * @returns A map of string op names to IMapMessageHandlers for those ops
	 */
	private getMessageHandlers(): Map<string, IMapMessageHandler> {
		const messageHandlers = new Map<string, IMapMessageHandler>();
		messageHandlers.set("clear", {
			process: (op: IMapClearOperation, local, localOpMetadata) => {
				if (local) {
					assert(
						isClearLocalOpMetadata(localOpMetadata),
						0x015 /* "pendingMessageId is missing from the local client's clear operation" */,
					);
					const pendingClearMessageId = this.pendingClearMessageIds.shift();
					assert(
						pendingClearMessageId === localOpMetadata.pendingMessageId,
						0x2fb /* pendingMessageId does not match */,
					);

					return;
				}
				this.ackedKeysIndexTracker.clear();

				if (this.pendingKeys.size > 0) {
					this.clearExceptPendingKeys();
					return;
				}
				this.clearCore(local);
			},
			submit: (op: IMapClearOperation, localOpMetadata: IMapClearLocalOpMetadata) => {
				assert(
					isClearLocalOpMetadata(localOpMetadata),
					0x2fc /* Invalid localOpMetadata for clear */,
				);
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				const pendingClearMessageId = this.pendingClearMessageIds.shift();
				assert(
					pendingClearMessageId === localOpMetadata.pendingMessageId,
					0x2fd /* pendingMessageId does not match */,
				);
				this.submitMapClearMessage(
					op,
					localOpMetadata.previousMap,
					localOpMetadata.previousAckedKeysTracker,
					localOpMetadata.previousPendingSetTracker,
					localOpMetadata.previousPendingDeleteTracker,
				);
			},
			applyStashedOp: (op: IMapClearOperation) => {
				const dataCopy = new Map<string, ILocalValue>(this.data);
				this.clearCore(true);

				const { ackedKeysTrackerCopy, pendingSetTrackerCopy, pendingDeleteTrackerCopy } =
					this.clearKeysIndex();
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				return createClearLocalOpMetadata(
					op,
					this.getMapClearMessageId(),
					dataCopy,
					ackedKeysTrackerCopy,
					pendingSetTrackerCopy,
					pendingDeleteTrackerCopy,
				);
			},
		});
		messageHandlers.set("delete", {
			process: (op: IMapDeleteOperation, local, localOpMetadata) => {
				if (!this.needProcessKeyOperation(op, local, localOpMetadata)) {
					return;
				}
				this.deleteCore(op.key, local);
				// Adjust the keys order if the deleted key is already ack'd
				this.ackedKeysIndexTracker.delete(op.key);
			},
			submit: (op: IMapDeleteOperation, localOpMetadata: MapKeyLocalOpMetadata) => {
				this.resubmitMapKeyMessage(op, localOpMetadata);
			},
			applyStashedOp: (op: IMapDeleteOperation) => {
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				const previousValue = this.deleteCore(op.key, true);
				const previousIndex = this.deleteKeysIndex(op.key);
				this.incrementPendingDeleteCount(op.key);
				const messageId = this.getMapKeyMessageId(op);
				this.updatePendingSetIds(op, messageId);
				return createKeyLocalOpMetadata(op, messageId, previousValue, previousIndex);
			},
		});
		messageHandlers.set("set", {
			process: (op: IMapSetOperation, local, localOpMetadata) => {
				if (!this.needProcessKeyOperation(op, local, localOpMetadata)) {
					return;
				}

				// needProcessKeyOperation should have returned false if local is true
				const context = this.makeLocal(op.key, op.value);
				this.setCore(op.key, context, local);
				// Adjust the keys order if it is a fresh acked insertion
				if (!this.ackedKeysIndexTracker.has(op.key)) {
					this.ackedKeysIndexTracker.set(op.key, ++this.creationIndex);
				}
			},
			submit: (op: IMapSetOperation, localOpMetadata: MapKeyLocalOpMetadata) => {
				this.resubmitMapKeyMessage(op, localOpMetadata);
			},
			applyStashedOp: (op: IMapSetOperation) => {
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				const context = this.makeLocal(op.key, op.value);
				const previousValue = this.setCore(op.key, context, true);
				const messageId = this.getMapKeyMessageId(op);
				this.updatePendingSetIds(op, messageId);
				return createKeyLocalOpMetadata(op, messageId, previousValue);
			},
		});

		return messageHandlers;
	}

	private getMapClearMessageId(): number {
		const pendingMessageId = ++this.pendingMessageId;
		this.pendingClearMessageIds.push(pendingMessageId);
		return pendingMessageId;
	}

	/**
	 * Submit a clear message to remote clients.
	 * @param op - The clear message
	 */
	private submitMapClearMessage(
		op: IMapClearOperation,
		previousMap?: Map<string, ILocalValue>,
		previousAckedKeysTracker?: Map<string, number>,
		previousPendingSetTracker?: Map<string, number[]>,
		previousPendingDeleteTracker?: Map<string, number>,
	): void {
		const metadata = createClearLocalOpMetadata(
			op,
			this.getMapClearMessageId(),
			previousMap,
			previousAckedKeysTracker,
			previousPendingSetTracker,
			previousPendingDeleteTracker,
		);
		this.submitMessage(op, metadata);
	}

	private getMapKeyMessageId(op: IMapKeyOperation): number {
		const pendingMessageId = ++this.pendingMessageId;
		const pendingMessageIds = this.pendingKeys.get(op.key);
		if (pendingMessageIds !== undefined) {
			pendingMessageIds.push(pendingMessageId);
		} else {
			this.pendingKeys.set(op.key, [pendingMessageId]);
		}

		return pendingMessageId;
	}

	private incrementPendingDeleteCount(key: string): void {
		const count = this.pendingDeleteTracker.get(key) ?? 0;
		this.pendingDeleteTracker.set(key, count + 1);
	}

	private decrementPendingDeleteCount(key: string): void {
		const count = this.pendingDeleteTracker.get(key) ?? 0;
		this.pendingDeleteTracker.set(key, count - 1);
		if (count <= 1) {
			this.pendingDeleteTracker.delete(key);
		}
	}

	/**
	 * Update the message id's associated with the op's key
	 * @param op - The map key message
	 * @param pendingMessageId - The associated message id to be handled
	 */
	private updatePendingSetIds(op: IMapKeyOperation, pendingMessageId: number): void {
		// Store the messageId, for the creation order of unack'd keys
		if (op.type === "set") {
			if (!this.pendingSetTracker.has(op.key)) {
				this.pendingSetTracker.set(op.key, [pendingMessageId]);
				this.localKeysIndexTracker.set(op.key, pendingMessageId);
			} else {
				this.pendingSetTracker.get(op.key)?.push(pendingMessageId);
			}
		} else {
			if (this.pendingSetTracker.has(op.key)) {
				const index = this.pendingSetTracker.get(op.key)?.[0] as number;
				this.pendingSetTracker.delete(op.key);
				this.localKeysIndexTracker.delete(index);
			}
		}
	}

	/**
	 * Submit a map key message to remote clients.
	 * @param op - The map key message
	 * @param messageId - The message id
	 * @param previousValue - The value of the key before this op
	 * @param previousIndex - The information of creation index before this op
	 */
	private submitMapKeyMessage(
		op: IMapKeyOperation,
		messageId: number,
		previousValue?: ILocalValue,
		previousIndex?: (number | number[])[],
	): void {
		const localMetadata = createKeyLocalOpMetadata(op, messageId, previousValue, previousIndex);
		this.submitMessage(op, localMetadata);
	}

	/**
	 * Submit a map key message to remote clients based on a previous submit.
	 * @param op - The map key message
	 * @param localOpMetadata - Metadata from the previous submit
	 */
	private resubmitMapKeyMessage(op: IMapKeyOperation, localOpMetadata: MapLocalOpMetadata): void {
		assert(
			isMapKeyLocalOpMetadata(localOpMetadata),
			0x2fe /* Invalid localOpMetadata in submit */,
		);

		// no need to submit messages for op's that have been aborted
		const pendingMessageIds = this.pendingKeys.get(op.key);
		if (pendingMessageIds === undefined) {
			return;
		}

		const index = pendingMessageIds.findIndex((id) => id === localOpMetadata.pendingMessageId);
		if (index === -1) {
			return;
		}

		pendingMessageIds.splice(index, 1);
		if (pendingMessageIds.length === 0) {
			this.pendingKeys.delete(op.key);
		}

		/**
		 * Considering a new message id will be assigned, if the op is of type set, it is necessary to replace
		 * all "old information" with new message id
		 */
		if (op.type === "set") {
			const pendingSetIds = this.pendingSetTracker.get(op.key);
			if (pendingSetIds !== undefined) {
				const firstPendingSetId = pendingSetIds?.shift() as number;
				if (pendingSetIds?.length === 0) {
					this.pendingSetTracker.delete(op.key);
				}
				if (this.localKeysIndexTracker.has(firstPendingSetId)) {
					this.localKeysIndexTracker.delete(firstPendingSetId);
					if (pendingSetIds.length > 0) {
						this.localKeysIndexTracker.set(op.key, pendingSetIds[0]);
					}
				}
			}
		}

		// We don't reuse the metadata pendingMessageId but send a new one on each submit.
		const pendingMessageId = this.getMapKeyMessageId(op);
		this.updatePendingSetIds(op, pendingMessageId);

		const localMetadata =
			localOpMetadata.type === "edit"
				? {
						type: "edit",
						pendingMessageId,
						previousValue: localOpMetadata.previousValue,
				  }
				: localOpMetadata.type === "add"
				? { type: "add", pendingMessageId }
				: {
						type: "delete",
						pendingMessageId,
						previousValue: localOpMetadata.previousValue,
						previousIndex: localOpMetadata.previousIndex,
				  };

		this.submitMessage(op, localMetadata);
	}
}
