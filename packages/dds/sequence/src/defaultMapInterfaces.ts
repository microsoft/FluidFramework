/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObjectEvents } from "@fluidframework/shared-object-base";
import { IEventThisPlaceHolder } from "@fluidframework/core-interfaces";
import { ISerializedInterval, IntervalOpType, SerializedIntervalDelta } from "./intervals";

/**
 * Type of "valueChanged" event parameter.
 */
export interface IValueChanged {
	/**
	 * The key storing the value that changed.
	 */
	key: string;

	/**
	 * The value that was stored at the key prior to the change.
	 */
	previousValue: any;
}

/**
 * Value types are given an IValueOpEmitter to emit their ops through the container type that holds them.
 * @internal
 * @deprecated - will be remove from public api as there is no public used of this type
 */
export interface IValueOpEmitter {
	/**
	 * Called by the value type to emit a value type operation through the container type holding it.
	 * @param opName - Name of the emitted operation
	 * @param previousValue - JSONable previous value as defined by the value type @deprecated unused
	 * @param params - JSONable params for the operation as defined by the value type
	 * @param localOpMetadata - JSONable local metadata which should be submitted with the op
	 */
	emit(
		opName: IntervalOpType,
		previousValue: undefined,
		params: SerializedIntervalDelta,
		localOpMetadata: IMapMessageLocalMetadata,
	): void;
}

/**
 * @internal
 */
export interface IMapMessageLocalMetadata {
	localSeq: number;
}

/**
 * Optional flags that configure options for sequence DDSs
 * @internal
 */
export interface SequenceOptions {
	/**
	 * Enable the ability to use interval APIs that rely on positions before and
	 * after individual characters, referred to as "sides". See {@link SequencePlace}
	 * for additional context.
	 *
	 * This flag must be enabled to pass instances of {@link SequencePlace} to
	 * any IIntervalCollection API.
	 *
	 * Also see the feature flag `mergeTreeReferencesCanSlideToEndpoint` to allow
	 * endpoints to slide to the special endpoint segments.
	 *
	 * The default value is false.
	 */
	intervalStickinessEnabled: boolean;
	/**
	 * Enable the ability for interval endpoints to slide to the special endpoint
	 * segments that exist before and after the bounds of the string. This is
	 * primarily useful for workflows involving interval stickiness, and it is
	 * suggested to enable both this flag and `intervalStickinessEnabled` at the
	 * same time.
	 *
	 * The default value is false.
	 */
	mergeTreeReferencesCanSlideToEndpoint: boolean;
	[key: string]: boolean;
}

/**
 * A value factory is used to serialize/deserialize value types to a map
 * @alpha
 */
export interface IValueFactory<T> {
	/**
	 * Create a new value type.  Used both in creation of new value types, as well as in loading existing ones
	 * from remote.
	 * @param emitter - Emitter object that the created value type will use to emit operations
	 * @param raw - Initialization parameters as defined by the value type
	 * @returns The new value type
	 * @alpha
	 */
	load(emitter: IValueOpEmitter, raw: any, options?: Partial<SequenceOptions>): T;

	/**
	 * Given a value type, provides a JSONable form of its data to be used for snapshotting.  This data must be
	 * loadable using the load method of its factory.
	 * @param value - The value type to serialize
	 * @returns The JSONable form of the value type
	 * @alpha
	 */
	store(value: T): any;
}

/**
 * Defines an operation that a value type is able to handle.
 * @alpha
 */
export interface IValueOperation<T> {
	/**
	 * Performs the actual processing on the incoming operation.
	 * @param value - The current value stored at the given key, which should be the value type
	 * @param params - The params on the incoming operation
	 * @param local - Whether the operation originated from this client
	 * @param message - The operation itself
	 * @param localOpMetadata - any local metadata submitted by `IValueOpEmitter.emit`.
	 * @alpha
	 */
	process(
		value: T,
		params: ISerializedInterval,
		local: boolean,
		message: ISequencedDocumentMessage | undefined,
		localOpMetadata: IMapMessageLocalMetadata | undefined,
	): void;

	/**
	 * Rebases an `op` on `value` from its original perspective (ref/local seq) to the current
	 * perspective. Should be invoked on reconnection.
	 * @param value - The current value stored at the given key, which should be the value type.
	 * @param op - The op to be rebased.
	 * @param localOpMetadata - Any local metadata that was originally submitted with the op.
	 * @returns A rebased version of the op and any local metadata that should be submitted with it.
	 */
	rebase(
		value: T,
		op: IValueTypeOperationValue,
		localOpMetadata: IMapMessageLocalMetadata,
	):
		| { rebasedOp: IValueTypeOperationValue; rebasedLocalOpMetadata: IMapMessageLocalMetadata }
		| undefined;
}

/**
 * Defines a value type that can be registered on a container type.
 */
export interface IValueType<T> {
	/**
	 * Name of the value type.
	 * @alpha
	 */
	name: string;

	/**
	 * Factory method used to convert to/from a JSON form of the type.
	 * @alpha
	 */
	factory: IValueFactory<T>;

	/**
	 * Operations that can be applied to the value type.
	 * @alpha
	 */
	ops: Map<IntervalOpType, IValueOperation<T>>;
}

export interface ISharedDefaultMapEvents extends ISharedObjectEvents {
	(
		event: "valueChanged" | "create",
		listener: (changed: IValueChanged, local: boolean, target: IEventThisPlaceHolder) => void,
	): void;
}

/**
 * The _ready-for-serialization_ format of values contained in DDS contents. This allows us to use
 * ISerializableValue.type to understand whether they're storing a Plain JS object, a SharedObject, or a value type.
 * Note that the in-memory equivalent of ISerializableValue is ILocalValue (similarly holding a type, but with
 * the _in-memory representation_ of the value instead). An ISerializableValue is what gets passed to
 * JSON.stringify and comes out of JSON.parse. This format is used both for snapshots (loadCore/populate)
 * and ops (set).
 *
 * The DefaultMap implementation for sequence has been specialized to only support a single ValueType, which serializes
 * and deserializes via .store() and .load().
 */
export interface ISerializableValue {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: string;

	/**
	 * The JSONable representation of the value.
	 */
	value: any;
}

export interface ISerializedValue {
	/**
	 * A type annotation to help indicate how the value serializes.
	 */
	type: string;

	/**
	 * String representation of the value.
	 */
	value: string | undefined;
}

/**
 * ValueTypes handle ops slightly differently from SharedObjects or plain JS objects.  Since the Map/Directory doesn't
 * know how to handle the ValueType's ops, those ops are instead passed along to the ValueType for processing.
 * IValueTypeOperationValue is that passed-along op.  The opName on it is the ValueType-specific operation and the
 * value is whatever params the ValueType needs to complete that operation.  Similar to ISerializableValue, it is
 * serializable via JSON.stringify/parse but differs in that it has no equivalency with an in-memory value - rather
 * it just describes an operation to be applied to an already-in-memory value.
 * @alpha
 */
export interface IValueTypeOperationValue {
	/**
	 * The name of the operation.
	 */
	opName: IntervalOpType;

	/**
	 * The payload that is submitted along with the operation.
	 */
	value: SerializedIntervalDelta;
}
