/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { ValueType, IFluidSerializer } from "@fluidframework/shared-object-base/internal";

import {
	IntervalCollectionTypeLocalValue,
	makeSerializable,
} from "./IntervalCollectionValues.js";
import {
	type IntervalCollection,
	reservedIntervalIdKey,
	toOptionalSequencePlace,
	toSequencePlace,
} from "./intervalCollection.js";
import {
	IIntervalCollectionType,
	IIntervalCollectionTypeOperationValue,
	IMapMessageLocalMetadata,
	ISerializableIntervalCollection,
	ISharedDefaultMapEvents,
	IValueChanged,
	// eslint-disable-next-line import/no-deprecated
	IValueOpEmitter,
	SequenceOptions,
} from "./intervalCollectionMapInterfaces.js";
import {
	type ISerializableInterval,
	IntervalDeltaOpType,
	SerializedIntervalDelta,
} from "./intervals/index.js";

function isMapOperation(op: unknown): op is IMapOperation {
	return typeof op === "object" && op !== null && "type" in op && op.type === "act";
}

/**
 * Description of a map delta operation
 */
export interface IMapOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "act";

	/**
	 * Map key being modified.
	 */
	key: string;

	/**
	 * Value of the operation, specific to the value type.
	 */
	value: IIntervalCollectionTypeOperationValue;
}
/**
 * Defines the in-memory object structure to be used for the conversion to/from serialized.
 * Directly used in JSON.stringify, direct result from JSON.parse
 */
export interface IMapDataObjectSerializable {
	[key: string]: ISerializableIntervalCollection;
}

/**
 * A DefaultMap is a map-like distributed data structure, supporting operations on values stored by
 * string key locations.
 *
 * Creation of values is implicit on access (either via `get` or a remote op application referring to
 * a collection that wasn't previously known)
 */
export class IntervalCollectionMap<T extends ISerializableInterval> {
	/**
	 * The number of key/value pairs stored in the map.
	 */
	public get size(): number {
		return this.data.size;
	}

	/**
	 * Mapping of op types to message handlers.
	 */
	private readonly messageHandler = {
		process: (
			op: IMapOperation,
			local: boolean,
			message: ISequencedDocumentMessage,
			localOpMetadata: IMapMessageLocalMetadata,
		) => {
			const localValue = this.data.get(op.key) ?? this.createCore(op.key, local);
			const handler = localValue.getOpHandler(op.value.opName);
			const previousValue = localValue.value;
			const translatedValue = op.value.value as any;
			handler.process(previousValue, translatedValue, local, message, localOpMetadata);
			const event: IValueChanged = { key: op.key, previousValue };
			this.eventEmitter.emit("valueChanged", event, local, message, this.eventEmitter);
		},
		submit: (op: IMapOperation, localOpMetadata: IMapMessageLocalMetadata) => {
			this.submitMessage(op, localOpMetadata);
		},
		resubmit: (op: IMapOperation, localOpMetadata: IMapMessageLocalMetadata) => {
			const localValue = this.data.get(op.key);

			assert(localValue !== undefined, 0x3f8 /* Local value expected on resubmission */);

			const handler = localValue.getOpHandler(op.value.opName);
			const rebased = handler.rebase(localValue.value, op.value, localOpMetadata);
			if (rebased !== undefined) {
				const { rebasedOp, rebasedLocalOpMetadata } = rebased;
				this.submitMessage({ ...op, value: rebasedOp }, rebasedLocalOpMetadata);
			}
		},
	};

	/**
	 * The in-memory data the map is storing.
	 */
	private readonly data = new Map<string, IntervalCollectionTypeLocalValue<T>>();

	/**
	 * Create a new default map.
	 * @param serializer - The serializer to serialize / parse handles
	 * @param handle - The handle of the shared object using the kernel
	 * @param submitMessage - A callback to submit a message through the shared object
	 * @param type - The value type to create at values of this map
	 * @param eventEmitter - The object that will emit map events
	 */
	constructor(
		private readonly serializer: IFluidSerializer,
		private readonly handle: IFluidHandle,
		private readonly submitMessage: (
			op: IMapOperation,
			localOpMetadata: IMapMessageLocalMetadata,
		) => void,
		private readonly type: IIntervalCollectionType<T>,
		private readonly options?: Partial<SequenceOptions>,
		public readonly eventEmitter = createEmitter<ISharedDefaultMapEvents>(),
	) {}

	/**
	 * Get an iterator over the keys in this map.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		return this.data.keys();
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	public values(): IterableIterator<any> {
		const localValuesIterator = this.data.values();
		const iterator = {
			next(): IteratorResult<any> {
				const nextVal = localValuesIterator.next();
				return nextVal.done
					? { value: undefined, done: true }
					: { value: nextVal.value.value, done: false }; // Unpack the stored value
			},
			[Symbol.iterator]() {
				return this;
			},
		};
		return iterator;
	}
	/**
	 * {@inheritDoc ISharedMap.get}
	 */
	public get(key: string): IntervalCollection<T> {
		const localValue = this.data.get(key) ?? this.createCore(key, true);

		return localValue.value;
	}

	public getSerializableStorage(serializer: IFluidSerializer): IMapDataObjectSerializable {
		const serializableMapData: IMapDataObjectSerializable = {};
		this.data.forEach((localValue, key) => {
			serializableMapData[key] = makeSerializable(localValue, serializer, this.handle);
		});
		return serializableMapData;
	}

	public serialize(serializer: IFluidSerializer): string {
		return JSON.stringify(this.getSerializableStorage(serializer));
	}

	/**
	 * Populate the kernel with the given map data.
	 *
	 * @param serialized - A JSON string containing serialized map data
	 */
	public populate(serialized: string): void {
		const parsed = this.serializer.parse(serialized) as IMapDataObjectSerializable;

		for (const [key, serializable] of Object.entries(parsed)) {
			// Back-compat: legacy documents may have handles to an intervalCollection map kernel.
			// These collections should be empty, and ValueTypes are no longer supported.
			if (
				serializable.type === ValueType[ValueType.Plain] ||
				serializable.type === ValueType[ValueType.Shared]
			) {
				continue;
			}

			// Back-compat: Sequence previously arbitrarily prefixed all interval collection keys with
			// "intervalCollections/". This would burden users trying to iterate the collection and
			// access its value, as well as those trying to match a create message to its underlying
			// collection. See https://github.com/microsoft/FluidFramework/issues/10557 for more context.
			const normalizedKey = key.startsWith("intervalCollections/") ? key.substring(20) : key;

			const localValue = {
				key: normalizedKey,
				value: this.makeLocal(key, serializable),
			};

			this.data.set(localValue.key, localValue.value);
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
	public tryResubmitMessage(op: unknown, localOpMetadata: IMapMessageLocalMetadata): boolean {
		if (isMapOperation(op)) {
			this.messageHandler.resubmit(op, localOpMetadata);
			return true;
		}
		return false;
	}

	public tryApplyStashedOp(op: unknown): boolean {
		if (isMapOperation(op)) {
			const { value, key } = op;
			const map = this.get(key);

			switch (value.opName) {
				case "add": {
					map.add({
						// Todo: we should improve typing so we know add ops always have start and end
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						start: toSequencePlace(value.value.start!, value.value.startSide),
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						end: toSequencePlace(value.value.end!, value.value.endSide),
						props: value.value.properties,
					});
					return true;
				}
				case "change": {
					const { [reservedIntervalIdKey]: id, ...props } = value.value.properties ?? {};
					map.change(id, {
						start: toOptionalSequencePlace(value.value.start, value.value.startSide),
						end: toOptionalSequencePlace(value.value.end, value.value.endSide),
						props,
					});
					return true;
				}
				case "delete": {
					const { [reservedIntervalIdKey]: id } = value.value.properties ?? {};
					map.removeIntervalById(id);
					return true;
				}
				default:
					throw new Error("unknown ops should not be stashed");
			}
		}
		return false;
	}

	/**
	 * Process the given op if a handler is registered.
	 * @param message - The message to process
	 * @param local - Whether the message originated from the local client
	 * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
	 * For messages from a remote client, this will be undefined.
	 * @returns True if the operation was processed, false otherwise.
	 */
	public tryProcessMessage(
		op: unknown,
		local: boolean,
		message: ISequencedDocumentMessage,
		localOpMetadata: unknown,
	): boolean {
		if (isMapOperation(op)) {
			this.messageHandler.process(
				op,
				local,
				message,
				localOpMetadata as IMapMessageLocalMetadata,
			);
			return true;
		}
		return false;
	}

	/**
	 * Initializes a default ValueType at the provided key.
	 * Should be used when a map operation incurs creation.
	 * @param key - The key being initialized
	 * @param local - Whether the message originated from the local client
	 */
	private createCore(key: string, local: boolean): IntervalCollectionTypeLocalValue<T> {
		const localValue = new IntervalCollectionTypeLocalValue(
			this.type.factory.load(this.makeMapValueOpEmitter(key), undefined, this.options),
			this.type,
		);
		const previousValue = this.data.get(key);
		this.data.set(key, localValue);
		const event: IValueChanged = { key, previousValue };
		this.eventEmitter.emit("create", event, local, undefined, this.eventEmitter);
		return localValue;
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
	private makeLocal(
		key: string,
		serializable: ISerializableIntervalCollection,
	): IntervalCollectionTypeLocalValue<T> {
		assert(
			serializable.type !== ValueType[ValueType.Plain] &&
				serializable.type !== ValueType[ValueType.Shared],
			0x2e1 /* "Support for plain value types removed." */,
		);

		const localValue = this.type.factory.load(
			this.makeMapValueOpEmitter(key),
			serializable.value,
			this.options,
		);
		return new IntervalCollectionTypeLocalValue(localValue, this.type);
	}

	/**
	 * Create an emitter for a value type to emit ops from the given key.
	 * @param key - The key of the map that the value type will be stored on
	 * @returns A value op emitter for the given key
	 */
	// eslint-disable-next-line import/no-deprecated
	private makeMapValueOpEmitter(key: string): IValueOpEmitter {
		// eslint-disable-next-line import/no-deprecated
		const emit: IValueOpEmitter["emit"] = (
			opName: IntervalDeltaOpType,
			previousValue: unknown,
			params: SerializedIntervalDelta,
			localOpMetadata: IMapMessageLocalMetadata,
		): void => {
			const op: IMapOperation = {
				key,
				type: "act",
				value: {
					opName,
					value: params,
				},
			};

			this.submitMessage(op, localOpMetadata);

			const event: IValueChanged = { key, previousValue };
			this.eventEmitter.emit("valueChanged", event, true, undefined, this.eventEmitter);
		};

		return { emit };
	}
}
