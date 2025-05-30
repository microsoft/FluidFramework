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
import { type ILocalValue, LocalValueMaker, makeSerializable } from "./localValues.js";

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
	process(op: IMapOperation, local: boolean, localOpMetadata: number | undefined): void;

	/**
	 * Communicate the operation to remote clients.
	 * @param op - The map operation to submit
	 * @param localOpMetadata - The metadata to be submitted with the message.
	 */
	submit(op: IMapOperation, localOpMetadata: number): void;
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
	private readonly sequencedData = new Map<string, ILocalValue>();

	/**
	 * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
	 */
	private nextPendingMessageId: number = 0;

	private readonly pendingData = new Map<string, PendingKeyChange[]>();

	/**
	 * The pending ids of any clears that have been performed locally but not yet ack'd from the server
	 */
	private readonly pendingClearMessageIds: number[] = [];

	/**
	 * Object to create encapsulations of the values stored in the map.
	 */
	private readonly localValueMaker: LocalValueMaker;

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
		this.localValueMaker = new LocalValueMaker();
		this.messageHandlers = this.getMessageHandlers();
	}

	/**
	 * Get an iterator over the keys in this map.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		return this.data.keys();
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public entries(): IterableIterator<[string, any]> {
		const localEntriesIterator = this.data.entries();
		const iterator = {
			next(): IteratorResult<[string, unknown]> {
				const nextVal = localEntriesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: // Unpack the stored value
						{ value: [nextVal.value[0], nextVal.value[1].value], done: false };
			},
			[Symbol.iterator](): IterableIterator<[string, unknown]> {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public values(): IterableIterator<any> {
		const localValuesIterator = this.data.values();
		const iterator = {
			next(): IteratorResult<unknown> {
				const nextVal = localValuesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: // Unpack the stored value
						{ value: nextVal.value.value as unknown, done: false };
			},
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
	 * {@inheritDoc ISharedMap.get}
	 */
	// TODO: Use `unknown` instead (breaking change).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public get<T = any>(key: string): T | undefined {
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

		// Create a local value and serialize it.
		const localValue = this.localValueMaker.fromInMemory(value);
		const previousOptimisticLocalValue = this.getOptimisticLocalValue(key);

		if (!this.isAttached()) {
			this.sequencedData.set(key, localValue);
			this.eventEmitter.emit(
				"valueChanged",
				{ key, previousValue: previousOptimisticLocalValue?.value as unknown },
				true,
				this.eventEmitter,
			);
			return;
		}

		let pendingValuesForKey = this.pendingData.get(key);
		if (pendingValuesForKey === undefined) {
			pendingValuesForKey = [];
			this.pendingData.set(key, pendingValuesForKey);
		}
		const pendingMessageId = this.nextPendingMessageId++;
		pendingValuesForKey.push({
			pendingMessageId,
			type: "set",
			value: localValue,
		});

		const op: IMapSetOperation = {
			key,
			type: "set",
			value: { type: localValue.type, value: localValue.value as unknown },
		};
		this.submitMessage(op, pendingMessageId);
		this.eventEmitter.emit(
			"valueChanged",
			{ key, previousValue: previousOptimisticLocalValue?.value as unknown },
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
				{ key, previousValue: previousOptimisticLocalValue?.value as unknown },
				true,
				this.eventEmitter,
			);
			return successfullyRemoved;
		}

		if (previousOptimisticLocalValue === undefined) {
			return false;
		}

		let pendingValuesForKey = this.pendingData.get(key);
		if (pendingValuesForKey === undefined) {
			pendingValuesForKey = [];
			this.pendingData.set(key, pendingValuesForKey);
		}
		const pendingMessageId = this.nextPendingMessageId++;
		pendingValuesForKey.push({
			pendingMessageId,
			type: "delete",
		});

		const op: IMapDeleteOperation = {
			key,
			type: "delete",
		};
		this.submitMessage(op, pendingMessageId);
		this.eventEmitter.emit(
			"valueChanged",
			{ key, previousValue: previousOptimisticLocalValue.value as unknown },
			true,
			this.eventEmitter,
		);

		return true;
	}

	/**
	 * Clear all data from the map.
	 */
	public clear(): void {
		// TODO: Consider putting it in pending but then simulating an immediate ack instead
		if (!this.isAttached()) {
			this.sequencedData.clear();
			this.eventEmitter.emit("clear", true, this.eventEmitter);
			return;
		}

		const op: IMapClearOperation = {
			type: "clear",
		};

		const pendingMessageId = this.nextPendingMessageId++;
		this.pendingClearMessageIds.push(pendingMessageId);
		this.submitMessage(op, pendingMessageId);
		this.eventEmitter.emit("clear", true, this.eventEmitter);
	}

	/**
	 * Serializes the data stored in the shared map to a JSON string
	 * @param serializer - The serializer to use to serialize handles in its values.
	 * @returns A JSON string containing serialized map data
	 */
	public getSerializedStorage(serializer: IFluidSerializer): IMapDataObjectSerialized {
		const serializableMapData: IMapDataObjectSerialized = {};
		for (const [key, localValue] of this.sequencedData.entries()) {
			serializableMapData[key] = localValue.makeSerialized(serializer, this.handle);
		}
		return serializableMapData;
	}

	public getSerializableStorage(serializer: IFluidSerializer): IMapDataObjectSerializable {
		const serializableMapData: IMapDataObjectSerializable = {};
		for (const [key, localValue] of this.sequencedData.entries()) {
			serializableMapData[key] = makeSerializable(localValue, serializer, this.handle);
		}
		return serializableMapData;
	}

	public serialize(serializer: IFluidSerializer): string {
		return JSON.stringify(this.getSerializableStorage(serializer));
	}

	/**
	 * Populate the kernel with the given map data.
	 * @param data - A JSON string containing serialized map data
	 */
	public populateFromSerializable(json: IMapDataObjectSerializable): void {
		for (const [key, serializable] of Object.entries(
			this.serializer.decode(json) as IMapDataObjectSerializable,
		)) {
			const localValue = {
				key,
				value: this.makeLocal(key, serializable),
			};

			this.data.set(localValue.key, localValue.value);
			this.sequencedData.set(localValue.key, localValue.value);
		}
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
		assert(typeof localOpMetadata === "number", "Expect localOpMetadata to be a number");
		const handler = this.messageHandlers.get(op.type);
		if (handler === undefined) {
			return false;
		}
		handler.submit(op, localOpMetadata);
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
				this.set(op.key, this.makeLocal(op.key, op.value).value);
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
		if (local) {
			assert(typeof localOpMetadata === "number", "Expect localOpMetadata to be a number");
		} else {
			assert(
				localOpMetadata === undefined,
				"Expect localOpMetadata to be undefined for remote ops",
			);
		}
		handler.process(op, local, localOpMetadata);
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
		assert(typeof localOpMetadata === "number", "Expect localOpMetadata to be a number");

		// if (op.type === "clear" && localOpMetadata.type === "clear") {
		// 	if (localOpMetadata.previousMap === undefined) {
		// 		throw new Error("Cannot rollback without previous map");
		// 	}
		// 	for (const [key, localValue] of localOpMetadata.previousMap.entries()) {
		// 		this.setCore(key, localValue, true);
		// 	}

		// 	const lastPendingClearId = this.pendingClearMessageIds.pop();
		// 	if (
		// 		lastPendingClearId === undefined ||
		// 		lastPendingClearId !== localOpMetadata.pendingMessageId
		// 	) {
		// 		throw new Error("Rollback op does match last clear");
		// 	}
		// } else if (op.type === "delete" || op.type === "set") {
		// 	if (localOpMetadata.type === "add") {
		// 		this.deleteCore(op.key as string, true);
		// 	} else if (
		// 		localOpMetadata.type === "edit" &&
		// 		localOpMetadata.previousValue !== undefined
		// 	) {
		// 		this.setCore(op.key as string, localOpMetadata.previousValue, true);
		// 	} else {
		// 		throw new Error("Cannot rollback without previous value");
		// 	}

		// 	const pendingMessageIds = this.pendingKeys.get(op.key as string);
		// 	const lastPendingMessageId = pendingMessageIds?.pop();
		// 	if (!pendingMessageIds || lastPendingMessageId !== localOpMetadata.pendingMessageId) {
		// 		throw new Error("Rollback op does not match last pending");
		// 	}
		// 	if (pendingMessageIds.length === 0) {
		// 		this.pendingKeys.delete(op.key as string);
		// 	}
		// } else {
		// 	throw new Error("Unsupported op for rollback");
		// }
	}

	/* eslint-enable @typescript-eslint/no-unsafe-member-access */

	private readonly getOptimisticLocalValue = (key: string): ILocalValue | undefined => {
		const pendingChanges = this.pendingData.get(key);
		const latestPendingValue = pendingChanges?.[pendingChanges.length - 1];
		const latestPendingClearMessageId =
			this.pendingClearMessageIds[this.pendingClearMessageIds.length - 1];
		if (latestPendingValue === undefined) {
			return latestPendingClearMessageId === undefined
				? this.sequencedData.get(key)
				: undefined;
		} else {
			if (
				latestPendingClearMessageId !== undefined &&
				latestPendingClearMessageId > latestPendingValue.pendingMessageId
			) {
				return undefined;
			} else if (latestPendingValue.type === "set") {
				return latestPendingValue.value;
			} else if (latestPendingValue.type === "delete") {
				return undefined;
			}
			unreachableCase(latestPendingValue, "Unknown pending value type");
		}
	};

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
			return this.localValueMaker.fromSerializable(serializable, this.serializer, this.handle);
		} else {
			throw new Error("Unknown local value type");
		}
	}

	/**
	 * Get the message handlers for the map.
	 * @returns A map of string op names to IMapMessageHandlers for those ops
	 */
	private getMessageHandlers(): Map<string, IMapMessageHandler> {
		const messageHandlers = new Map<string, IMapMessageHandler>();
		messageHandlers.set("clear", {
			process: (op: IMapClearOperation, local: boolean, localOpMetadata: number) => {
				this.sequencedData.clear();
				if (local) {
					const pendingClearMessageId = this.pendingClearMessageIds.shift();
					assert(
						pendingClearMessageId === localOpMetadata,
						0x2fb /* pendingMessageId does not match */,
					);
				} else {
					// Only emit for remote ops, we would have already emitted for local ops.
					this.eventEmitter.emit("clear", local, this.eventEmitter);
				}
			},
			submit: (op: IMapClearOperation, localOpMetadata: number) => {
				// TODO: This assumes we are attached?
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				const pendingClearMessageId = this.pendingClearMessageIds.shift();
				assert(
					pendingClearMessageId === localOpMetadata,
					0x2fd /* pendingMessageId does not match */,
				);
				const pendingMessageId = this.nextPendingMessageId++;
				this.pendingClearMessageIds.push(pendingMessageId);
				this.submitMessage(op, pendingMessageId);
			},
		});
		messageHandlers.set("delete", {
			process: (op: IMapDeleteOperation, local: boolean, localOpMetadata: number) => {
				const { key } = op;
				if (local) {
					const pendingValuesForKey = this.pendingData.get(key);
					assert(
						pendingValuesForKey !== undefined,
						"Got a delete message we weren't expecting",
					);
					const pendingValue = pendingValuesForKey.shift();
					if (pendingValuesForKey.length === 0) {
						this.pendingData.delete(key);
					}
					assert(pendingValue !== undefined, "Got a delete message we weren't expecting");
					assert(
						pendingValue.pendingMessageId === localOpMetadata,
						"pendingMessageId does not match",
					);
					assert(pendingValue.type === "delete", "pendingValue type is incorrect");
					this.sequencedData.delete(key);
				} else {
					const previousSequencedLocalValue = this.sequencedData.get(key);
					const previousValue: unknown = previousSequencedLocalValue?.value;
					this.sequencedData.delete(key);
					if (!this.pendingData.has(key) && this.pendingClearMessageIds.length === 0) {
						// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
						this.eventEmitter.emit(
							"valueChanged",
							{ key, previousValue },
							local,
							this.eventEmitter,
						);
					}
				}
			},
			submit: (op: IMapDeleteOperation, localOpMetadata: number) => {
				// this.resubmitMapKeyMessage(op, localOpMetadata);
				const { key } = op;
				const pendingValuesForKey = this.pendingData.get(key);
				assert(pendingValuesForKey !== undefined, "Got a delete message we weren't expecting");
				const pendingValue = pendingValuesForKey.shift();
				assert(pendingValue !== undefined, "Got a delete message we weren't expecting");
				assert(
					pendingValue.pendingMessageId === localOpMetadata,
					"pendingMessageId does not match",
				);
				assert(pendingValue.type === "delete", "pendingValue type is incorrect");

				const pendingMessageId = this.nextPendingMessageId++;
				pendingValuesForKey.push({
					pendingMessageId,
					type: "delete",
				});

				this.submitMessage(op, pendingMessageId);
			},
		});
		messageHandlers.set("set", {
			process: (op: IMapSetOperation, local: boolean, localOpMetadata: number) => {
				const { key, value } = op;
				if (local) {
					const pendingValuesForKey = this.pendingData.get(key);
					assert(pendingValuesForKey !== undefined, "Got a set message we weren't expecting");
					const pendingValue = pendingValuesForKey.shift();
					if (pendingValuesForKey.length === 0) {
						this.pendingData.delete(key);
					}
					assert(pendingValue !== undefined, "Got a set message we weren't expecting");
					assert(
						pendingValue.pendingMessageId === localOpMetadata,
						"pendingMessageId does not match",
					);
					assert(pendingValue.type === "set", "pendingValue type is incorrect");
					// TODO: Choosing to reuse the object reference here rather than create a new one from the incoming op?
					this.sequencedData.set(key, pendingValue.value);
				} else {
					const localValue = this.makeLocal(key, value);
					const previousSequencedLocalValue = this.sequencedData.get(key);
					const previousValue: unknown = previousSequencedLocalValue?.value;
					this.sequencedData.set(key, localValue);
					if (!this.pendingData.has(key) && this.pendingClearMessageIds.length === 0) {
						// Suppress the event if local changes would cause the incoming change to be invisible optimistically.
						this.eventEmitter.emit(
							"valueChanged",
							{ key, previousValue },
							local,
							this.eventEmitter,
						);
					}
				}
			},
			submit: (op: IMapSetOperation, localOpMetadata: number) => {
				const { key } = op;
				const pendingValuesForKey = this.pendingData.get(key);
				assert(pendingValuesForKey !== undefined, "Got a set message we weren't expecting");
				const pendingValue = pendingValuesForKey.shift();
				assert(pendingValue !== undefined, "Got a set message we weren't expecting");
				assert(
					pendingValue.pendingMessageId === localOpMetadata,
					"pendingMessageId does not match",
				);
				assert(pendingValue.type === "set", "pendingValue type is incorrect");
				const pendingMessageId = this.nextPendingMessageId++;
				pendingValuesForKey.push({
					pendingMessageId,
					type: "set",
					// TODO: Choosing to reuse the object reference here rather than create a new one from the resubmitted op?
					value: pendingValue.value,
				});

				this.submitMessage(op, pendingMessageId);
			},
		});

		return messageHandlers;
	}
}
