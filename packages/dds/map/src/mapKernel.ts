/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
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
		localOpMetadata: PendingLocalOpMetadata | undefined,
	): void;

	/**
	 * Resubmit a previously submitted operation that was not delivered.
	 * @param op - The map operation to resubmit
	 * @param localOpMetadata - The metadata that was originally submitted with the message.
	 */
	resubmit(op: IMapOperation, localOpMetadata: PendingLocalOpMetadata): void;
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
	type: "set";
	value: ILocalValue;
}

interface PendingKeyDelete {
	type: "delete";
	key: string;
}

interface PendingClear {
	type: "clear";
}

interface PendingKeyLifetime {
	type: "lifetime";
	key: string;
	keyChanges: PendingKeySet[];
}

type PendingChange = PendingKeyLifetime | PendingKeyDelete | PendingClear;
type PendingLocalOpMetadata = PendingKeySet | PendingKeyDelete | PendingClear;

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
	private readonly pendingData: PendingChange[] = [];

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
		const sequencedDataIterator = this.sequencedData.keys();
		const pendingDataIterator = this.pendingData.values();
		const next = (): IteratorResult<[string, ILocalValue]> => {
			let nextSequencedVal = sequencedDataIterator.next();
			while (!nextSequencedVal.done) {
				const key = nextSequencedVal.value;
				// If we have any pending deletes or clears, then we won't iterate to this key yet (if at all).
				// Either it is optimistically deleted and will not be part of the iteration, or it was
				// re-added later and we'll iterate to it when we get to the pending data.
				if (
					!this.pendingData.some(
						(change) =>
							change.type === "clear" || (change.type === "delete" && change.key === key),
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

			let nextPendingVal = pendingDataIterator.next();
			while (!nextPendingVal.done) {
				const pendingChange = nextPendingVal.value;
				if (pendingChange.type === "lifetime") {
					const nextPendingValIndex = this.pendingData.indexOf(pendingChange);
					const mostRecentDeleteOrClearIndex = findLastIndex(
						this.pendingData,
						(change) =>
							change.type === "clear" ||
							(change.type === "delete" && change.key === pendingChange.key),
					);
					if (
						pendingChange.type === "lifetime" &&
						nextPendingValIndex > mostRecentDeleteOrClearIndex
					) {
						const latestPendingValue =
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							pendingChange.keyChanges[pendingChange.keyChanges.length - 1]!;
						// TODO: clean up
						// TODO: Consider the case where we have started iterating the pending data, then all of our
						// ops get sequenced, then we finish iterating the pending data (we would skip the remaining
						// elements since we can't go back to the sequenced data).
						// Skip iterating if we would have would have iterated it as part of the sequenced data.
						if (
							!this.sequencedData.has(pendingChange.key) ||
							mostRecentDeleteOrClearIndex !== -1
						) {
							return { value: [pendingChange.key, latestPendingValue.value], done: false };
						}
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

	private readonly getOptimisticLocalValue = (key: string): ILocalValue | undefined => {
		const latestPendingChange = findLast(
			this.pendingData,
			(change) => change.type === "clear" || change.key === key,
		);

		if (latestPendingChange === undefined) {
			return this.sequencedData.get(key);
		} else if (latestPendingChange.type === "lifetime") {
			const latestPendingSet =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				latestPendingChange.keyChanges[latestPendingChange.keyChanges.length - 1]!;
			return latestPendingSet.value;
		} else {
			// Delete or clear
			return undefined;
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
		let latestPendingChange = findLast(
			this.pendingData,
			(change) => change.type === "clear" || change.key === key,
		);
		if (
			latestPendingChange === undefined ||
			latestPendingChange.type === "delete" ||
			latestPendingChange.type === "clear"
		) {
			latestPendingChange = { type: "lifetime", key, keyChanges: [] };
			this.pendingData.push(latestPendingChange);
		}
		const pendingKeySet: PendingKeySet = {
			type: "set",
			value: localValue,
		};
		latestPendingChange.keyChanges.push(pendingKeySet);

		const op: IMapSetOperation = {
			key,
			type: "set",
			value: { type: ValueType[ValueType.Plain], value: localValue.value },
		};
		this.submitMessage(op, pendingKeySet);
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

		const pendingKeyDelete: PendingKeyDelete = {
			type: "delete",
			key,
		};
		this.pendingData.push(pendingKeyDelete);

		const op: IMapDeleteOperation = {
			key,
			type: "delete",
		};
		this.submitMessage(op, pendingKeyDelete);
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
		if (!this.isAttached()) {
			this.sequencedData.clear();
			this.eventEmitter.emit("clear", true, this.eventEmitter);
			return;
		}

		const pendingClear: PendingClear = {
			type: "clear",
		};
		this.pendingData.push(pendingClear);

		const op: IMapClearOperation = {
			type: "clear",
		};
		this.submitMessage(op, pendingClear);
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
		handler.resubmit(op, localOpMetadata as PendingLocalOpMetadata);
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
		handler.process(op, local, localOpMetadata as PendingLocalOpMetadata | undefined);
		return true;
	}

	/**
	 * Rollback a local op
	 * @param op - The operation to rollback
	 * @param localOpMetadata - The local metadata associated with the op.
	 */
	public rollback(op: unknown, localOpMetadata: unknown): void {
		const mapOp: IMapOperation = op as IMapOperation;
		const typedLocalOpMetadata = localOpMetadata as PendingLocalOpMetadata;
		if (mapOp.type === "clear") {
			// A pending clear will be last in the list, since it terminates all prior lifetimes.
			const pendingClear = this.pendingData.pop();
			assert(
				pendingClear !== undefined &&
					pendingClear.type === "clear" &&
					pendingClear === typedLocalOpMetadata,
				"Unexpected clear rollback",
			);
			for (const [key] of this.internalIterator()) {
				this.eventEmitter.emit(
					"valueChanged",
					{ key, previousValue: undefined },
					true,
					this.eventEmitter,
				);
			}
		} else {
			// A pending set/delete may not be last in the list, as the lifetimes' order is based on when
			// they were created, not when they were last modified.
			const pendingChangeIndex = findLastIndex(
				this.pendingData,
				(change) => change.type !== "clear" && change.key === mapOp.key,
			);
			const pendingChange = this.pendingData[pendingChangeIndex];
			assert(
				pendingChange !== undefined &&
					(pendingChange.type === "delete" || pendingChange.type === "lifetime"),
				"Unexpected pending data for set/delete op",
			);
			if (pendingChange.type === "delete") {
				assert(pendingChange === typedLocalOpMetadata, "Unexpected delete rollback");
				this.pendingData.splice(pendingChangeIndex, 1);
				// Only emit if rolling back the delete actually results in a value becoming visible.
				if (this.getOptimisticLocalValue(mapOp.key) !== undefined) {
					this.eventEmitter.emit(
						"valueChanged",
						{ key: mapOp.key, previousValue: undefined },
						true,
						this.eventEmitter,
					);
				}
			} else if (pendingChange.type === "lifetime") {
				const pendingKeySet = pendingChange.keyChanges.pop();
				assert(
					pendingKeySet !== undefined && pendingKeySet === typedLocalOpMetadata,
					"Unexpected set rollback",
				);
				if (pendingChange.keyChanges.length === 0) {
					this.pendingData.splice(pendingChangeIndex, 1);
				}
				this.eventEmitter.emit(
					"valueChanged",
					{ key: mapOp.key, previousValue: pendingKeySet.value.value },
					true,
					this.eventEmitter,
				);
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
			process: (
				op: IMapClearOperation,
				local: boolean,
				localOpMetadata: PendingLocalOpMetadata | undefined,
			) => {
				this.sequencedData.clear();
				if (local) {
					const pendingClear = this.pendingData.shift();
					assert(
						pendingClear !== undefined &&
							pendingClear.type === "clear" &&
							pendingClear === localOpMetadata,
						"Got a local clear message we weren't expecting",
					);
				} else {
					// Only emit for remote ops, we would have already emitted for local ops. Only emit if there
					// is no optimistically-applied local pending clear that would supersede this remote clear.
					if (!this.pendingData.some((change) => change.type === "clear")) {
						this.eventEmitter.emit("clear", local, this.eventEmitter);
					}
				}
			},
			resubmit: (op: IMapClearOperation, localOpMetadata: PendingLocalOpMetadata) => {
				this.submitMessage(op, localOpMetadata);
			},
		});
		messageHandlers.set("delete", {
			process: (
				op: IMapDeleteOperation,
				local: boolean,
				localOpMetadata: PendingLocalOpMetadata | undefined,
			) => {
				const { key } = op;

				if (local) {
					const pendingKeyChangeIndex = this.pendingData.findIndex(
						(change) => change.type !== "clear" && change.key === key,
					);
					const pendingKeyChange = this.pendingData[pendingKeyChangeIndex];
					assert(
						pendingKeyChange !== undefined &&
							pendingKeyChange.type === "delete" &&
							pendingKeyChange === localOpMetadata,
						"Got a local delete message we weren't expecting",
					);
					this.pendingData.splice(pendingKeyChangeIndex, 1);

					this.sequencedData.delete(key);
				} else {
					const previousValue: unknown = this.sequencedData.get(key)?.value;
					this.sequencedData.delete(key);
					// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
					if (
						!this.pendingData.some((change) => change.type === "clear" || change.key === key)
					) {
						this.eventEmitter.emit(
							"valueChanged",
							{ key, previousValue },
							local,
							this.eventEmitter,
						);
					}
				}
			},
			resubmit: (op: IMapDeleteOperation, localOpMetadata: PendingLocalOpMetadata) => {
				this.submitMessage(op, localOpMetadata);
			},
		});
		messageHandlers.set("set", {
			process: (
				op: IMapSetOperation,
				local: boolean,
				localOpMetadata: PendingLocalOpMetadata | undefined,
			) => {
				const { key, value } = op;

				if (local) {
					const pendingKeyChangeIndex = this.pendingData.findIndex(
						(change) => change.type !== "clear" && change.key === key,
					);
					const pendingKeyLifetime = this.pendingData[pendingKeyChangeIndex];
					assert(
						pendingKeyLifetime !== undefined && pendingKeyLifetime.type === "lifetime",
						"Couldn't match local set message to pending lifetime",
					);
					const pendingKeySet = pendingKeyLifetime.keyChanges.shift();
					assert(
						pendingKeySet !== undefined && pendingKeySet === localOpMetadata,
						"Got a local set message we weren't expecting",
					);
					if (pendingKeyLifetime.keyChanges.length === 0) {
						this.pendingData.splice(pendingKeyChangeIndex, 1);
					}

					this.sequencedData.set(key, pendingKeySet.value);
				} else {
					migrateIfSharedSerializable(value, this.serializer, this.handle);
					const localValue: ILocalValue = { value: value.value };
					const previousValue: unknown = this.sequencedData.get(key)?.value;
					this.sequencedData.set(key, localValue);

					// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
					if (
						!this.pendingData.some((change) => change.type === "clear" || change.key === key)
					) {
						this.eventEmitter.emit(
							"valueChanged",
							{ key, previousValue },
							local,
							this.eventEmitter,
						);
					}
				}
			},
			resubmit: (op: IMapSetOperation, localOpMetadata: PendingLocalOpMetadata) => {
				this.submitMessage(op, localOpMetadata);
			},
		});

		return messageHandlers;
	}
}
