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
	IMapClearLocalOpMetadata,
	IMapClearOperation,
	IMapDeleteOperation,
	IMapKeyAddLocalOpMetadata,
	IMapKeyEditLocalOpMetadata,
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
		localOpMetadata: ListNode<MapLocalOpMetadata> | undefined,
	): void;

	/**
	 * Resubmit a previously submitted operation that was not delivered.
	 * @param op - The map operation to resubmit
	 * @param localOpMetadata - The metadata that was originally submitted with the message.
	 */
	resubmit(op: IMapOperation, localOpMetadata: ListNode<MapLocalOpMetadata>): void;
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

type MapKeyLocalOpMetadata = IMapKeyEditLocalOpMetadata | IMapKeyAddLocalOpMetadata;
type MapLocalOpMetadata = IMapClearLocalOpMetadata | MapKeyLocalOpMetadata;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

function isMapKeyLocalOpMetadata(metadata: any): metadata is MapKeyLocalOpMetadata {
	return (
		metadata !== undefined &&
		typeof metadata.pendingMessageId === "number" &&
		(metadata.type === "add" || metadata.type === "edit")
	);
}

function isClearLocalOpMetadata(metadata: any): metadata is IMapClearLocalOpMetadata {
	return (
		metadata !== undefined &&
		metadata.type === "clear" &&
		typeof metadata.pendingMessageId === "number"
	);
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

function createClearLocalOpMetadata(
	op: IMapClearOperation,
	pendingClearMessageId: number,
	previousMap?: Map<string, ILocalValue>,
): IMapClearLocalOpMetadata {
	const localMetadata: IMapClearLocalOpMetadata = {
		type: "clear",
		pendingMessageId: pendingClearMessageId,
		previousMap,
	};
	return localMetadata;
}

function createKeyLocalOpMetadata(
	op: IMapKeyOperation,
	pendingMessageId: number,
	previousValue?: ILocalValue,
): MapKeyLocalOpMetadata {
	const localMetadata: MapKeyLocalOpMetadata = previousValue
		? { type: "edit", pendingMessageId, previousValue }
		: { type: "add", pendingMessageId };
	return localMetadata;
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
	private readonly pendingKeys = new Map<string, number[]>();

	/**
	 * This is used to assign a unique id to every outgoing operation and helps in tracking unack'd ops.
	 */
	private nextPendingMessageId: number = 0;

	/**
	 * The pending metadata for any local operations that have not yet been ack'd from the server, in order.
	 */
	private readonly pendingMapLocalOpMetadata: DoublyLinkedList<MapLocalOpMetadata> =
		new DoublyLinkedList<MapLocalOpMetadata>();

	/**
	 * The pending ids of any clears that have been performed locally but not yet ack'd from the server
	 */
	private readonly pendingClearMessageIds: number[] = [];

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
	public entries(): IterableIterator<[string, unknown]> {
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
	public values(): IterableIterator<unknown> {
		const localValuesIterator = this.data.values();
		const iterator = {
			next(): IteratorResult<unknown> {
				const nextVal = localValuesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: // Unpack the stored value
						{ value: nextVal.value.value, done: false };
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
		// eslint-disable-next-line unicorn/no-array-for-each
		this.data.forEach((localValue, key, m) => {
			callbackFn(localValue.value, key, m);
		});
	}

	/**
	 * {@inheritDoc ISharedMap.get}
	 */
	public get<T = unknown>(key: string): T | undefined {
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

		// Set the value locally.
		const previousValue = this.setCore(key, { value }, true);

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		const op: IMapSetOperation = {
			key,
			type: "set",
			value: { type: ValueType[ValueType.Plain], value },
		};
		this.submitMapKeyMessage(op, previousValue);
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

		const op: IMapDeleteOperation = {
			key,
			type: "delete",
		};
		this.submitMapKeyMessage(op, previousValue);

		return previousValue !== undefined;
	}

	/**
	 * Clear all data from the map.
	 */
	public clear(): void {
		const copy = this.isAttached() ? new Map<string, ILocalValue>(this.data) : undefined;

		// Clear the data locally first.
		this.clearCore(true);

		// Clear the pendingKeys immediately, the local unack'd operations are aborted
		this.pendingKeys.clear();

		// If we are not attached, don't submit the op.
		if (!this.isAttached()) {
			return;
		}

		const op: IMapClearOperation = {
			type: "clear",
		};
		this.submitMapClearMessage(op, copy);
	}

	/**
	 * Serializes the data stored in the shared map to a JSON string
	 * @param serializer - The serializer to use to serialize handles in its values.
	 * @returns A JSON string containing serialized map data
	 */
	public getSerializedStorage(serializer: IFluidSerializer): IMapDataObjectSerialized {
		const serializedMapData: IMapDataObjectSerialized = {};
		for (const [key, localValue] of this.data.entries()) {
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
			this.data.set(key, { value: serializable.value });
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
		handler.resubmit(op, localOpMetadata as ListNode<MapLocalOpMetadata>);
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
		handler.process(op, local, localOpMetadata as ListNode<MapLocalOpMetadata> | undefined);
		return true;
	}

	/**
	 * Rollback a local op
	 * @param op - The operation to rollback
	 * @param localOpMetadata - The local metadata associated with the op.
	 */
	public rollback(op: unknown, localOpMetadata: unknown): void {
		const mapOp: IMapOperation = op as IMapOperation;
		const listNodeLocalOpMetadata = localOpMetadata as ListNode<MapLocalOpMetadata>;
		const removedLocalOpMetadata = this.pendingMapLocalOpMetadata.pop();
		assert(
			removedLocalOpMetadata !== undefined &&
				removedLocalOpMetadata === listNodeLocalOpMetadata,
			0xbcb /* Rolling back unexpected op */,
		);

		if (mapOp.type === "clear" && listNodeLocalOpMetadata.data.type === "clear") {
			if (listNodeLocalOpMetadata.data.previousMap === undefined) {
				throw new Error("Cannot rollback without previous map");
			}
			for (const [key, localValue] of listNodeLocalOpMetadata.data.previousMap.entries()) {
				this.setCore(key, localValue, true);
			}

			const lastPendingClearId = this.pendingClearMessageIds.pop();
			if (
				lastPendingClearId === undefined ||
				lastPendingClearId !== listNodeLocalOpMetadata.data.pendingMessageId
			) {
				throw new Error("Rollback op does match last clear");
			}
		} else if (mapOp.type === "delete" || mapOp.type === "set") {
			if (listNodeLocalOpMetadata.data.type === "add") {
				this.deleteCore(mapOp.key, true);
			} else if (
				listNodeLocalOpMetadata.data.type === "edit" &&
				listNodeLocalOpMetadata.data.previousValue !== undefined
			) {
				this.setCore(mapOp.key, listNodeLocalOpMetadata.data.previousValue, true);
			} else {
				throw new Error("Cannot rollback without previous value");
			}

			const pendingMessageIds = this.pendingKeys.get(mapOp.key);
			const lastPendingMessageId = pendingMessageIds?.pop();
			if (
				!pendingMessageIds ||
				lastPendingMessageId !== listNodeLocalOpMetadata.data.pendingMessageId
			) {
				throw new Error("Rollback op does not match last pending");
			}
			if (pendingMessageIds.length === 0) {
				this.pendingKeys.delete(mapOp.key);
			}
		} else {
			throw new Error("Unsupported op for rollback");
		}
	}

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
			this.eventEmitter.emit("valueChanged", { key, previousValue }, local, this.eventEmitter);
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
		localOpMetadata: MapLocalOpMetadata | undefined,
	): boolean {
		if (this.pendingClearMessageIds[0] !== undefined) {
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
				pendingKeyMessageIds.shift();
				if (pendingKeyMessageIds.length === 0) {
					this.pendingKeys.delete(op.key);
				}
			}
			return false;
		}

		// If we don't have a NACK op on the key, we need to process the remote ops.
		return !local;
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
				localOpMetadata: ListNode<MapLocalOpMetadata> | undefined,
			) => {
				if (local) {
					const removedLocalOpMetadata = this.pendingMapLocalOpMetadata.shift();
					assert(
						removedLocalOpMetadata !== undefined && removedLocalOpMetadata === localOpMetadata,
						0xbcc /* Processing unexpected local clear op */,
					);
					assert(
						isClearLocalOpMetadata(localOpMetadata.data),
						0x015 /* "pendingMessageId is missing from the local client's clear operation" */,
					);
					const pendingClearMessageId = this.pendingClearMessageIds.shift();
					assert(
						pendingClearMessageId === localOpMetadata.data.pendingMessageId,
						0x2fb /* pendingMessageId does not match */,
					);
					return;
				}
				if (this.pendingKeys.size > 0) {
					this.clearExceptPendingKeys();
					return;
				}
				this.clearCore(local);
			},
			resubmit: (op: IMapClearOperation, localOpMetadata: ListNode<MapLocalOpMetadata>) => {
				const removedLocalOpMetadata = localOpMetadata.remove()?.data;
				assert(
					removedLocalOpMetadata !== undefined,
					0xbcd /* Resubmitting unexpected local clear op */,
				);
				assert(
					isClearLocalOpMetadata(localOpMetadata.data),
					0x2fc /* Invalid localOpMetadata for clear */,
				);
				// We don't reuse the metadata pendingMessageId but send a new one on each submit.
				const pendingClearMessageId = this.pendingClearMessageIds.shift();
				assert(
					pendingClearMessageId === localOpMetadata.data.pendingMessageId,
					0x2fd /* pendingMessageId does not match */,
				);
				this.submitMapClearMessage(op, localOpMetadata.data.previousMap);
			},
		});
		messageHandlers.set("delete", {
			process: (
				op: IMapDeleteOperation,
				local: boolean,
				localOpMetadata: ListNode<MapLocalOpMetadata> | undefined,
			) => {
				if (local) {
					const removedLocalOpMetadata = this.pendingMapLocalOpMetadata.shift();
					assert(
						removedLocalOpMetadata !== undefined && removedLocalOpMetadata === localOpMetadata,
						0xbce /* Processing unexpected local delete op */,
					);
				}
				if (!this.needProcessKeyOperation(op, local, localOpMetadata?.data)) {
					return;
				}
				this.deleteCore(op.key, local);
			},
			resubmit: (op: IMapDeleteOperation, localOpMetadata: ListNode<MapLocalOpMetadata>) => {
				const removedLocalOpMetadata = localOpMetadata.remove()?.data;
				assert(
					removedLocalOpMetadata !== undefined,
					0xbcf /* Resubmitting unexpected local delete op */,
				);
				this.resubmitMapKeyMessage(op, localOpMetadata.data);
			},
		});
		messageHandlers.set("set", {
			process: (
				op: IMapSetOperation,
				local: boolean,
				localOpMetadata: ListNode<MapLocalOpMetadata> | undefined,
			) => {
				if (local) {
					const removedLocalOpMetadata = this.pendingMapLocalOpMetadata.shift();
					assert(
						removedLocalOpMetadata !== undefined && removedLocalOpMetadata === localOpMetadata,
						0xbd0 /* Processing unexpected local set op */,
					);
				}
				if (!this.needProcessKeyOperation(op, local, localOpMetadata?.data)) {
					return;
				}

				// needProcessKeyOperation should have returned false if local is true
				migrateIfSharedSerializable(op.value, this.serializer, this.handle);
				this.setCore(op.key, { value: op.value.value }, local);
			},
			resubmit: (op: IMapSetOperation, localOpMetadata: ListNode<MapLocalOpMetadata>) => {
				const removedLocalOpMetadata = localOpMetadata.remove()?.data;
				assert(
					removedLocalOpMetadata !== undefined,
					0xbd1 /* Resubmitting unexpected local set op */,
				);
				this.resubmitMapKeyMessage(op, localOpMetadata.data);
			},
		});

		return messageHandlers;
	}

	private getMapClearMessageId(): number {
		const pendingMessageId = this.nextPendingMessageId++;
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
	): void {
		const pendingMessageId = this.getMapClearMessageId();
		const localMetadata = createClearLocalOpMetadata(op, pendingMessageId, previousMap);
		const listNode = this.pendingMapLocalOpMetadata.push(localMetadata).first;
		this.submitMessage(op, listNode);
	}

	private getMapKeyMessageId(op: IMapKeyOperation): number {
		const pendingMessageId = this.nextPendingMessageId++;
		const pendingMessageIds = this.pendingKeys.get(op.key);
		if (pendingMessageIds === undefined) {
			this.pendingKeys.set(op.key, [pendingMessageId]);
		} else {
			pendingMessageIds.push(pendingMessageId);
		}
		return pendingMessageId;
	}

	/**
	 * Submit a map key message to remote clients.
	 * @param op - The map key message
	 * @param previousValue - The value of the key before this op
	 */
	private submitMapKeyMessage(op: IMapKeyOperation, previousValue?: ILocalValue): void {
		const pendingMessageId = this.getMapKeyMessageId(op);
		const localMetadata = createKeyLocalOpMetadata(op, pendingMessageId, previousValue);
		const listNode = this.pendingMapLocalOpMetadata.push(localMetadata).first;
		this.submitMessage(op, listNode);
	}

	/**
	 * Submit a map key message to remote clients based on a previous submit.
	 * @param op - The map key message
	 * @param localOpMetadata - Metadata from the previous submit
	 */
	private resubmitMapKeyMessage(
		op: IMapKeyOperation,
		localOpMetadata: MapLocalOpMetadata,
	): void {
		assert(
			isMapKeyLocalOpMetadata(localOpMetadata),
			0x2fe /* Invalid localOpMetadata in submit */,
		);

		// no need to submit messages for op's that have been aborted
		const pendingMessageIds = this.pendingKeys.get(op.key);
		if (pendingMessageIds === undefined) {
			return;
		}

		const index = pendingMessageIds.indexOf(localOpMetadata.pendingMessageId);
		if (index === -1) {
			return;
		}

		pendingMessageIds.splice(index, 1);
		if (pendingMessageIds.length === 0) {
			this.pendingKeys.delete(op.key);
		}

		// We don't reuse the metadata pendingMessageId but send a new one on each submit.
		const pendingMessageId = this.getMapKeyMessageId(op);
		const localMetadata: MapKeyLocalOpMetadata =
			localOpMetadata.type === "edit"
				? { type: "edit", pendingMessageId, previousValue: localOpMetadata.previousValue }
				: { type: "add", pendingMessageId };
		const listNode = this.pendingMapLocalOpMetadata.push(localMetadata).first;
		this.submitMessage(op, listNode);
	}
}
