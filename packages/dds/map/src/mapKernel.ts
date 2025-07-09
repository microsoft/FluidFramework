/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	assert,
	DoublyLinkedList,
	type ListNode,
	unreachableCase,
} from "@fluidframework/core-utils/internal";
import type { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import { ValueType } from "@fluidframework/shared-object-base/internal";

import type { ISharedMapEvents } from "./interfaces.js";
import type {
	IMapClearOperation,
	IMapDeleteOperation,
	IMapSetOperation,
	// eslint-disable-next-line import/no-deprecated
	ISerializableValue,
	ISerializedValue,
} from "./internalInterfaces.js";
import {
	type ILocalValue,
	serializeValue,
	migrateIfSharedSerializable,
} from "./localValues.js";

/**
 * Defines the means to process and resubmit a given op on a map.
 */
interface IMapMessageHandler {
	/**
	 * Apply the given operation.
	 * @param op - The map operation to apply
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 */
	process(
		op: IMapOperation,
		local: boolean,
		localOpMetadata: ListNode<PendingLocalOpMetadata> | undefined,
	): void;

	/**
	 * Resubmit a previously submitted operation that was not delivered.
	 * @param op - The map operation to resubmit
	 * @param localOpMetadata - The metadata that was originally submitted with the message.
	 */
	resubmit(op: IMapOperation, localOpMetadata: ListNode<PendingLocalOpMetadata>): void;
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
// eslint-disable-next-line import/no-deprecated
export type IMapDataObjectSerializable = Record<string, ISerializableValue>;

/**
 * Serialized key/value data.
 */
export type IMapDataObjectSerialized = Record<string, ISerializedValue>;

interface PendingKeySet {
	pendingMessageId: number;
	type: "set";
	value: ILocalValue;
}

interface PendingKeyDelete {
	pendingMessageId: number;
	type: "delete";
}

type PendingKeyChange = PendingKeySet | PendingKeyDelete;

// TODO: Just exporting these for the metadata test, should they be exported and should that be tested?
/**
 * Metadata submitted along with set/delete operations.
 */
export interface PendingKeyChangeMetadata {
	pendingMessageId: number;
	// TODO: This is a weird type
	type: "key";
	change: PendingKeyChange;
}
/**
 * Metadata submitted along with clear operations.
 */
export interface PendingClearMetadata {
	pendingMessageId: number;
	type: "clear";
}
/**
 * Metadata submitted along with local operations.
 */
export type PendingLocalOpMetadata = PendingKeyChangeMetadata | PendingClearMetadata;

interface PendingKeyLifetime {
	key: string;
	keyChanges: PendingKeyChange[]; // Expected to either be all sets or conclude with a delete.
}

// Rough polyfill for Array.findLastIndex until we target ES2023 or greater.
const findLastIndex = <T>(array: T[], callbackFn: (value: T) => boolean): number => {
	for (let i = array.length - 1; i >= 0; i--) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (callbackFn(array[i]!)) {
			return i;
		}
	}
	return -1;
};

// Rough polyfill for Array.findLast until we target ES2023 or greater.
const findLast = <T>(array: T[], callbackFn: (value: T) => boolean): T | undefined =>
	array[findLastIndex(array, callbackFn)];

/**
 * A SharedMap is a map-like distributed data structure.
 */
export class MapKernel {
	/**
	 * The number of key/value pairs stored in the map.
	 */
	public get size(): number {
		// TODO: Consider some better implementation
		const iterableItems = [...this.internalIterator()];
		return iterableItems.length;
	}

	/**
	 * Mapping of op types to message handlers.
	 */
	private readonly messageHandlers: ReadonlyMap<string, IMapMessageHandler> = new Map();

	/**
	 * The in-memory data the map is storing.
	 */
	private readonly sequencedData = new Map<string, ILocalValue>();
	private readonly pendingData: PendingKeyLifetime[] = [];
	/**
	 * The pending ids of any clears that have been performed locally but not yet ack'd from the server
	 */
	private readonly pendingClearMessageIds: number[] = [];

	/**
	 * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
	 */
	private nextPendingMessageId: number = 0;

	/**
	 * The pending metadata for any local operations that have not yet been ack'd from the server, in order.
	 */
	private readonly pendingLocalOpMetadata: DoublyLinkedList<PendingLocalOpMetadata> =
		new DoublyLinkedList<PendingLocalOpMetadata>();

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
		this.messageHandlers = this.getMessageHandlers();
	}

	private readonly internalIterator = (): IterableIterator<[string, ILocalValue]> => {
		const sequencedDataIterator = this.sequencedData.entries();
		const pendingDataIterator = this.pendingData.values();
		const next = (): IteratorResult<[string, ILocalValue]> => {
			// TODO CONVERSION: This empty clear check can fold into the some check below.
			if (this.pendingClearMessageIds.length === 0) {
				let nextSequencedVal = sequencedDataIterator.next();
				while (!nextSequencedVal.done) {
					const [key] = nextSequencedVal.value;
					// If we have any pending deletes, then we won't iterate to this key yet (if at all).
					// Either it is optimistically deleted and will not be part of the iteration, or it was
					// re-added later and we'll iterate to it when we get to the pending data.
					if (
						!this.pendingData.some(
							(lifetime) =>
								lifetime.key === key &&
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								lifetime.keyChanges[lifetime.keyChanges.length - 1]!.type === "delete",
						)
					) {
						const optimisticValue = this.getOptimisticLocalValue(key);
						assert(
							optimisticValue !== undefined,
							"optimisticValue should be skipped if undefined",
						);
						return { value: [key, optimisticValue], done: false };
					}
					nextSequencedVal = sequencedDataIterator.next();
				}
			}

			let nextPendingVal = pendingDataIterator.next();
			while (!nextPendingVal.done) {
				const pendingLifetime = nextPendingVal.value;
				const latestPendingValue =
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					pendingLifetime.keyChanges[pendingLifetime.keyChanges.length - 1]!;
				const latestPendingClearMessageId =
					this.pendingClearMessageIds[this.pendingClearMessageIds.length - 1];
				// Skip iterating for lifetimes that have been terminated with a delete.
				if (
					latestPendingValue.type !== "delete" &&
					(latestPendingClearMessageId === undefined ||
						latestPendingClearMessageId < latestPendingValue.pendingMessageId)
				) {
					// TODO: clean up
					// TODO: Consider the case where we have started iterating the pending data, then all of our
					// ops get sequenced, then we finish iterating the pending data (we would skip the remaining
					// elements since we can't go back to the sequenced data).
					// Skip iterating if we would have would have iterated it as part of the sequenced data.
					// eslint-disable-next-line unicorn/no-lonely-if
					if (
						!this.sequencedData.has(pendingLifetime.key) ||
						this.pendingData.some(
							(lifetime) =>
								lifetime.key === pendingLifetime.key &&
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								lifetime.keyChanges[lifetime.keyChanges.length - 1]!.type === "delete",
						)
					) {
						return { value: [pendingLifetime.key, latestPendingValue.value], done: false };
					}
				}
				nextPendingVal = pendingDataIterator.next();
			}

			return { value: undefined, done: true };
		};

		// TODO: Consider just tracking sequenced adds and tacking them on at the end.
		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<[string, ILocalValue]> {
				return this;
			},
		};
		return iterator;
	};

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	public entries(): IterableIterator<[string, unknown]> {
		const internalIterator = this.internalIterator();
		const next = (): IteratorResult<[string, unknown]> => {
			const nextResult = internalIterator.next();
			if (nextResult.done) {
				return { value: undefined, done: true };
			}
			// Unpack the stored value
			const [key, localValue] = nextResult.value;
			return { value: [key, localValue.value], done: false };
		};

		// TODO: Consider just tracking sequenced adds and tacking them on at the end.
		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<[string, unknown]> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the keys in this map.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		const internalIterator = this.internalIterator();
		const next = (): IteratorResult<string> => {
			const nextResult = internalIterator.next();
			if (nextResult.done) {
				return { value: undefined, done: true };
			}
			const [key] = nextResult.value;
			return { value: key, done: false };
		};
		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<string> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	public values(): IterableIterator<unknown> {
		const internalIterator = this.internalIterator();
		const next = (): IteratorResult<unknown> => {
			const nextResult = internalIterator.next();
			if (nextResult.done) {
				return { value: undefined, done: true };
			}
			const [, value] = nextResult.value;
			return { value, done: false };
		};
		const iterator = {
			next,
			[Symbol.iterator](): IterableIterator<unknown> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	public [Symbol.iterator](): IterableIterator<[string, unknown]> {
		return this.entries();
	}

	/**
	 * Executes the given callback on each entry in the map.
	 * @param callbackFn - Callback function
	 */
	public forEach(
		callbackFn: (value: unknown, key: string, map: Map<string, unknown>) => void,
	): void {
		// TODO: Would be better to iterate over the data without a temp map.  However,
		// we don't have a valid map to pass for the third argument here (really, it should probably should
		// be a reference to the SharedMap). This is already kind of a bug since we leak access to this.data
		// in the current implementation.
		const tempMap = new Map(this.internalIterator());
		// eslint-disable-next-line unicorn/no-array-for-each
		tempMap.forEach((localValue, key, m) => {
			callbackFn(localValue.value, key, m);
		});
	}

	// TODO CONVERSION: This would just search back through the pending changes, stop early if find a
	// clear or delete, return sequenced value if not found.
	private readonly getOptimisticLocalValue = (key: string): ILocalValue | undefined => {
		const latestPendingLifetime = findLast(
			this.pendingData,
			(lifetime) => lifetime.key === key,
		);
		const latestPendingKeyChange =
			latestPendingLifetime?.keyChanges[latestPendingLifetime.keyChanges.length - 1];
		const latestPendingClearMessageId =
			this.pendingClearMessageIds[this.pendingClearMessageIds.length - 1];

		if (latestPendingKeyChange === undefined) {
			return latestPendingClearMessageId === undefined
				? this.sequencedData.get(key)
				: undefined;
		} else {
			if (
				latestPendingClearMessageId !== undefined &&
				latestPendingClearMessageId > latestPendingKeyChange.pendingMessageId
			) {
				return undefined;
			} else if (latestPendingKeyChange.type === "set") {
				return latestPendingKeyChange.value;
			} else if (latestPendingKeyChange.type === "delete") {
				return undefined;
			}
			unreachableCase(latestPendingKeyChange, "Unknown pending value type");
		}
	};

	/**
	 * {@inheritDoc ISharedMap.get}
	 */
	public get<T = unknown>(key: string): T | undefined {
		const localValue = this.getOptimisticLocalValue(key);
		return localValue === undefined ? undefined : (localValue.value as T);
	}

	/**
	 * Check if a key exists in the map.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public has(key: string): boolean {
		return this.getOptimisticLocalValue(key) !== undefined;
	}

	/**
	 * {@inheritDoc ISharedMap.set}
	 */
	public set(key: string, value: unknown): void {
		// Undefined/null keys can't be serialized to JSON in the manner we currently snapshot.
		if (key === undefined || key === null) {
			throw new Error("Undefined and null keys are not supported");
		}

		const localValue: ILocalValue = { value };
		const previousOptimisticLocalValue = this.getOptimisticLocalValue(key);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			this.sequencedData.set(key, localValue);
			this.eventEmitter.emit(
				"valueChanged",
				{ key, previousValue: previousOptimisticLocalValue?.value },
				true,
				this.eventEmitter,
			);
			return;
		}

		// A new pending key lifetime is created if:
		// 1. There isn't one yet
		// 2. The most recent change was a deletion (as this terminates the prior lifetime)
		// 3. A clear was sent after the last change (which also terminates the prior lifetime)
		// TODO: Should I just check the optimistic value?
		let pendingKeyLifetime = findLast(this.pendingData, (lifetime) => lifetime.key === key);
		const latestPendingClearMessageId =
			this.pendingClearMessageIds[this.pendingClearMessageIds.length - 1];
		if (
			pendingKeyLifetime === undefined ||
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			pendingKeyLifetime.keyChanges[pendingKeyLifetime.keyChanges.length - 1]!.type ===
				"delete" ||
			(latestPendingClearMessageId !== undefined &&
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				pendingKeyLifetime.keyChanges[pendingKeyLifetime.keyChanges.length - 1]!
					.pendingMessageId < latestPendingClearMessageId)
		) {
			pendingKeyLifetime = { key, keyChanges: [] };
			this.pendingData.push(pendingKeyLifetime);
		}
		const pendingMessageId = this.nextPendingMessageId++;
		const keyChange: PendingKeySet = {
			pendingMessageId,
			type: "set",
			value: localValue,
		};
		pendingKeyLifetime.keyChanges.push(keyChange);
		const localMetadata: PendingKeyChangeMetadata = {
			pendingMessageId,
			type: "key",
			change: keyChange,
		};
		const listNode = this.pendingLocalOpMetadata.push(localMetadata).first;

		const op: IMapSetOperation = {
			key,
			type: "set",
			value: { type: ValueType[ValueType.Plain], value: localValue.value },
		};
		this.submitMessage(op, listNode);
		this.eventEmitter.emit(
			"valueChanged",
			{ key, previousValue: previousOptimisticLocalValue?.value },
			true,
			this.eventEmitter,
		);
	}

	/**
	 * Delete a key from the map.
	 * @param key - Key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		const previousOptimisticLocalValue = this.getOptimisticLocalValue(key);

		if (!this.isAttached()) {
			const successfullyRemoved = this.sequencedData.delete(key);
			this.eventEmitter.emit(
				"valueChanged",
				{ key, previousValue: previousOptimisticLocalValue?.value },
				true,
				this.eventEmitter,
			);
			// Should always return true here or else we would have early-exited above
			return successfullyRemoved;
		}

		let pendingKeyLifetime = findLast(this.pendingData, (lifetime) => lifetime.key === key);
		if (pendingKeyLifetime === undefined) {
			// Deletion only creates a new lifetime in the case of directly deleting a sequenced value
			pendingKeyLifetime = { key, keyChanges: [] };
			this.pendingData.push(pendingKeyLifetime);
		}
		const pendingMessageId = this.nextPendingMessageId++;
		const keyChange: PendingKeyDelete = {
			pendingMessageId,
			type: "delete",
		};
		pendingKeyLifetime.keyChanges.push(keyChange);
		const localMetadata: PendingKeyChangeMetadata = {
			pendingMessageId,
			type: "key",
			change: keyChange,
		};
		const listNode = this.pendingLocalOpMetadata.push(localMetadata).first;

		const op: IMapDeleteOperation = {
			key,
			type: "delete",
		};
		this.submitMessage(op, listNode);
		// Only emit if we locally believe we deleted something.  Otherwise we still send the op
		// (permitting speculative deletion even if we don't see anything locally) but don't emit
		// a valueChanged since we in fact did not locally observe a value change.
		if (previousOptimisticLocalValue !== undefined) {
			this.eventEmitter.emit(
				"valueChanged",
				{ key, previousValue: previousOptimisticLocalValue.value },
				true,
				this.eventEmitter,
			);
		}

		return true;
	}

	/**
	 * Clear all data from the map.
	 */
	public clear(): void {
		// TODO: Consider putting it in pending but then simulating an immediate ack instead
		if (!this.isAttached()) {
			this.sequencedData.clear();
			// TODO: Should this also emit deletes or something?  Given the pending behavior.
			this.eventEmitter.emit("clear", true, this.eventEmitter);
			return;
		}

		const op: IMapClearOperation = {
			type: "clear",
		};

		const pendingMessageId = this.nextPendingMessageId++;
		// TODO CONVERSION: This just inserts into the list of pending changes
		this.pendingClearMessageIds.push(pendingMessageId);
		const localMetadata: PendingClearMetadata = {
			type: "clear",
			pendingMessageId,
		};
		const listNode = this.pendingLocalOpMetadata.push(localMetadata).first;
		this.submitMessage(op, listNode);
		this.eventEmitter.emit("clear", true, this.eventEmitter);
	}

	/**
	 * Serializes the data stored in the shared map to a JSON string
	 * @param serializer - The serializer to use to serialize handles in its values.
	 * @returns A JSON string containing serialized map data
	 */
	public getSerializedStorage(serializer: IFluidSerializer): IMapDataObjectSerialized {
		const serializedMapData: IMapDataObjectSerialized = {};
		for (const [key, localValue] of this.sequencedData.entries()) {
			serializedMapData[key] = serializeValue(localValue.value, serializer, this.handle);
		}
		return serializedMapData;
	}

	/**
	 * Populate the kernel with the given map data.
	 * @param data - A JSON string containing serialized map data
	 */
	public populateFromSerializable(json: IMapDataObjectSerializable): void {
		for (const [key, serializable] of Object.entries(
			this.serializer.decode(json) as IMapDataObjectSerializable,
		)) {
			migrateIfSharedSerializable(serializable, this.serializer, this.handle);
			this.sequencedData.set(key, { value: serializable.value });
		}
	}

	/**
	 * Resubmit the given op if a handler is registered.
	 * @param op - The operation to attempt to submit
	 * @param localOpMetadata - The local metadata associated with the op. This is kept locally by the runtime
	 * and not sent to the server. This will be sent back when this message is received back from the server. This is
	 * also sent if we are asked to resubmit the message.
	 * @returns True if the operation was submitted, false otherwise.
	 */
	public tryResubmitMessage(op: IMapOperation, localOpMetadata: unknown): boolean {
		const handler = this.messageHandlers.get(op.type);
		if (handler === undefined) {
			return false;
		}
		handler.resubmit(op, localOpMetadata as ListNode<PendingLocalOpMetadata>);
		return true;
	}

	public tryApplyStashedOp(op: IMapOperation): void {
		switch (op.type) {
			case "clear": {
				this.clear();
				break;
			}
			case "delete": {
				this.delete(op.key);
				break;
			}
			case "set": {
				migrateIfSharedSerializable(op.value, this.serializer, this.handle);
				this.set(op.key, op.value.value);
				break;
			}
			default: {
				unreachableCase(op);
			}
		}
	}

	/**
	 * Process the given op if a handler is registered.
	 * @param message - The message to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 * @returns True if the operation was recognized and thus processed, false otherwise.
	 *
	 * @remarks
	 * When this returns false and the caller doesn't handle the op itself, then the op could be from a different version of this code.
	 * In such a case, not applying the op would result in this client becoming out of sync with clients that do handle the op
	 * and could result in data corruption or data loss as well.
	 * Therefore, in such cases the caller should typically throw an error, ensuring that this client treats the situation as data corruption
	 * (since its data no longer matches what other clients think the data should be) and will avoid overriding document content or misleading the users into thinking their current state is accurate.
	 */
	public tryProcessMessage(
		op: IMapOperation,
		local: boolean,
		localOpMetadata: unknown,
	): boolean {
		const handler = this.messageHandlers.get(op.type);
		if (handler === undefined) {
			return false;
		}
		handler.process(
			op,
			local,
			localOpMetadata as ListNode<PendingLocalOpMetadata> | undefined,
		);
		return true;
	}

	/**
	 * Rollback a local op
	 * @param op - The operation to rollback
	 * @param localOpMetadata - The local metadata associated with the op.
	 */
	public rollback(op: unknown, localOpMetadata: unknown): void {
		const mapOp: IMapOperation = op as IMapOperation;
		const listNodeLocalOpMetadata = localOpMetadata as ListNode<PendingLocalOpMetadata>;
		const removedListNode = this.pendingLocalOpMetadata.pop();
		assert(
			removedListNode !== undefined && removedListNode === listNodeLocalOpMetadata,
			0xbcb /* Rolling back unexpected op */,
		);
		const pendingLocalOpMetadata = removedListNode.data;

		if (mapOp.type === "clear") {
			// Just pop the pending changes, it better be the last one
			const pendingClear = this.pendingClearMessageIds.pop();
			// TODO: Really need to assert all this?
			assert(
				pendingLocalOpMetadata.type === "clear" &&
					pendingClear !== undefined &&
					pendingClear === pendingLocalOpMetadata.pendingMessageId,
				"Unexpected clear rollback",
			);
			for (const [key] of this.internalIterator()) {
				// TODO: Consider if it's weird that all the values are immediately visible when the first
				// event is emitted, rather than becoming visible one-by-one as the event is raised.
				this.eventEmitter.emit(
					"valueChanged",
					{ key, previousValue: undefined },
					true,
					this.eventEmitter,
				);
			}
		} else {
			const pendingLifetimeIndex = findLastIndex(
				this.pendingData,
				(lifetime) => lifetime.key === mapOp.key,
			);
			const pendingLifetime = this.pendingData[pendingLifetimeIndex];
			assert(pendingLifetime !== undefined, "Unexpected rollback for key");
			const previousLocalValue = this.getOptimisticLocalValue(mapOp.key);
			const pendingKeyChange = pendingLifetime.keyChanges.pop();
			if (pendingLifetime.keyChanges.length === 0) {
				this.pendingData.splice(pendingLifetimeIndex, 1);
			}
			assert(
				pendingKeyChange !== undefined &&
					pendingLocalOpMetadata.type === "key" &&
					pendingKeyChange === pendingLocalOpMetadata.change,
				"Unexpected rollback for key",
			);
			this.eventEmitter.emit(
				"valueChanged",
				{ key: mapOp.key, previousValue: previousLocalValue?.value },
				true,
				this.eventEmitter,
			);
		}
	}

	/**
	 * Get the message handlers for the map.
	 * @returns A map of string op names to IMapMessageHandlers for those ops
	 */
	private getMessageHandlers(): Map<string, IMapMessageHandler> {
		const messageHandlers = new Map<string, IMapMessageHandler>();
		messageHandlers.set("clear", {
			process: (
				op: IMapClearOperation,
				local: boolean,
				localOpMetadata: ListNode<PendingLocalOpMetadata> | undefined,
			) => {
				this.sequencedData.clear();
				if (local) {
					const removedLocalOpMetadata = this.pendingLocalOpMetadata.shift();
					assert(
						removedLocalOpMetadata !== undefined && removedLocalOpMetadata === localOpMetadata,
						0xbcc /* Processing unexpected local clear op */,
					);
					assert(
						localOpMetadata.data.type === "clear" &&
							typeof localOpMetadata.data.pendingMessageId === "number",
						0x015 /* "pendingMessageId is missing from the local client's clear operation" */,
					);
					// TODO CONVERSION: Just shift the pending changes, it better be the next one
					const pendingClearMessageId = this.pendingClearMessageIds.shift();
					assert(
						pendingClearMessageId === localOpMetadata.data.pendingMessageId,
						0x2fb /* pendingMessageId does not match */,
					);
				} else {
					// Only emit for remote ops, we would have already emitted for local ops.
					// TODO: Should also only emit if there are no local pending clears which would mask the remote clear?
					this.eventEmitter.emit("clear", local, this.eventEmitter);
				}
			},
			resubmit: (
				op: IMapClearOperation,
				localOpMetadata: ListNode<PendingLocalOpMetadata>,
			) => {
				const removedLocalOpMetadata = localOpMetadata.remove()?.data;
				assert(
					removedLocalOpMetadata !== undefined,
					0xbcd /* Resubmitting unexpected local clear op */,
				);
				assert(
					localOpMetadata.data.type === "clear" &&
						typeof localOpMetadata.data.pendingMessageId === "number",
					0x2fc /* Invalid localOpMetadata for clear */,
				);
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				// TODO CONVERSION: Instead of shift/push, mutate the pending change similar to the other ops
				const pendingClearMessageId = this.pendingClearMessageIds.shift();
				assert(
					pendingClearMessageId === localOpMetadata.data.pendingMessageId,
					0x2fd /* pendingMessageId does not match */,
				);
				const pendingMessageId = this.nextPendingMessageId++;
				this.pendingClearMessageIds.push(pendingMessageId);
				const localMetadata: PendingClearMetadata = { type: "clear", pendingMessageId };
				const listNode = this.pendingLocalOpMetadata.push(localMetadata).first;
				this.submitMessage(op, listNode);
			},
		});
		messageHandlers.set("delete", {
			process: (
				op: IMapDeleteOperation,
				local: boolean,
				localOpMetadata: ListNode<PendingLocalOpMetadata> | undefined,
			) => {
				const { key } = op;
				const pendingKeyLifetimeIndex = this.pendingData.findIndex(
					(lifetime) => lifetime.key === key,
				);
				if (local) {
					const removedLocalOpMetadata = this.pendingLocalOpMetadata.shift();
					assert(
						removedLocalOpMetadata !== undefined && removedLocalOpMetadata === localOpMetadata,
						0xbce /* Processing unexpected local delete op */,
					);
					const pendingKeyLifetime = this.pendingData[pendingKeyLifetimeIndex];
					assert(
						pendingKeyLifetime !== undefined,
						"Got a delete message we weren't expecting",
					);
					const pendingValue = pendingKeyLifetime.keyChanges.shift();
					if (pendingKeyLifetime.keyChanges.length === 0) {
						this.pendingData.splice(pendingKeyLifetimeIndex, 1);
					}
					assert(pendingValue !== undefined, "Got a delete message we weren't expecting");
					assert(
						localOpMetadata !== undefined &&
							pendingValue.pendingMessageId === localOpMetadata.data.pendingMessageId,
						"pendingMessageId does not match",
					);
					assert(pendingValue.type === "delete", "pendingValue type is incorrect");
					this.sequencedData.delete(key);
				} else {
					const previousSequencedLocalValue = this.sequencedData.get(key);
					const previousValue: unknown = previousSequencedLocalValue?.value;
					this.sequencedData.delete(key);
					// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
					// TODO CONVERSION: Instead of length check, a some check
					if (pendingKeyLifetimeIndex === -1 && this.pendingClearMessageIds.length === 0) {
						this.eventEmitter.emit(
							"valueChanged",
							{ key, previousValue },
							local,
							this.eventEmitter,
						);
					}
				}
			},
			resubmit: (
				op: IMapDeleteOperation,
				localOpMetadata: ListNode<PendingLocalOpMetadata>,
			) => {
				const removedLocalOpMetadata = localOpMetadata.remove()?.data;
				assert(
					removedLocalOpMetadata !== undefined && removedLocalOpMetadata.type === "key",
					0xbcf /* Resubmitting unexpected local delete op */,
				);

				const pendingMessageId = this.nextPendingMessageId++;

				// TODO: How do I feel about mutating here?
				removedLocalOpMetadata.change.pendingMessageId = pendingMessageId;
				const localMetadata: PendingKeyChangeMetadata = {
					...removedLocalOpMetadata,
					pendingMessageId,
				};
				const listNode = this.pendingLocalOpMetadata.push(localMetadata).first;

				this.submitMessage(op, listNode);
			},
		});
		messageHandlers.set("set", {
			process: (
				op: IMapSetOperation,
				local: boolean,
				localOpMetadata: ListNode<PendingLocalOpMetadata> | undefined,
			) => {
				const { key, value } = op;
				const pendingKeyLifetimeIndex = this.pendingData.findIndex(
					(lifetime) => lifetime.key === key,
				);
				if (local) {
					const removedLocalOpMetadata = this.pendingLocalOpMetadata.shift();
					assert(
						removedLocalOpMetadata !== undefined && removedLocalOpMetadata === localOpMetadata,
						0xbd0 /* Processing unexpected local set op */,
					);
					const pendingKeyLifetime = this.pendingData[pendingKeyLifetimeIndex];
					assert(pendingKeyLifetime !== undefined, "Got a set message we weren't expecting");
					const pendingValue = pendingKeyLifetime.keyChanges.shift();
					if (pendingKeyLifetime.keyChanges.length === 0) {
						this.pendingData.splice(pendingKeyLifetimeIndex, 1);
					}
					assert(pendingValue !== undefined, "Got a set message we weren't expecting");
					assert(
						localOpMetadata !== undefined &&
							pendingValue.pendingMessageId === localOpMetadata.data.pendingMessageId,
						"pendingMessageId does not match",
					);
					assert(pendingValue.type === "set", "pendingValue type is incorrect");
					// TODO: Choosing to reuse the object reference here rather than create a new one from the incoming op?
					this.sequencedData.set(key, pendingValue.value);
				} else {
					migrateIfSharedSerializable(value, this.serializer, this.handle);
					const localValue: ILocalValue = { value: value.value };
					const previousSequencedLocalValue = this.sequencedData.get(key);
					const previousValue: unknown = previousSequencedLocalValue?.value;
					this.sequencedData.set(key, localValue);
					// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
					// TODO CONVERSION: Another some check
					if (pendingKeyLifetimeIndex === -1 && this.pendingClearMessageIds.length === 0) {
						this.eventEmitter.emit(
							"valueChanged",
							{ key, previousValue },
							local,
							this.eventEmitter,
						);
					}
				}
			},
			resubmit: (op: IMapSetOperation, localOpMetadata: ListNode<PendingLocalOpMetadata>) => {
				const removedLocalOpMetadata = localOpMetadata.remove()?.data;
				assert(
					removedLocalOpMetadata !== undefined && removedLocalOpMetadata.type === "key",
					0xbd1 /* Resubmitting unexpected local set op */,
				);

				const pendingMessageId = this.nextPendingMessageId++;

				// TODO: How do I feel about mutating here?
				removedLocalOpMetadata.change.pendingMessageId = pendingMessageId;
				const localMetadata: PendingKeyChangeMetadata = {
					...removedLocalOpMetadata,
					pendingMessageId,
				};
				const listNode = this.pendingLocalOpMetadata.push(localMetadata).first;

				this.submitMessage(op, listNode);
			},
		});

		return messageHandlers;
	}
}
