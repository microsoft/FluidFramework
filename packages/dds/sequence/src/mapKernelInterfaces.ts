/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObject, ISharedObjectEvents } from "@fluidframework/shared-object-base";
import { IEventThisPlaceHolder } from "@fluidframework/common-definitions";

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
 */
export interface IValueOpEmitter {
    /**
     * Called by the value type to emit a value type operation through the container type holding it.
     * @param opName - Name of the emitted operation
     * @param previousValue - JSONable previous value as defined by the value type
     * @param params - JSONable params for the operation as defined by the value type
     * @alpha
     */
    emit(opName: string, previousValue: any, params: any): void;
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
    load(emitter: IValueOpEmitter, raw: any): T;

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
     * @alpha
     */
    process(value: T, params: any, local: boolean, message: ISequencedDocumentMessage | undefined);
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
    ops: Map<string, IValueOperation<T>>;
}

/**
 * Container types that are able to create value types as contained values.
 */
export interface IValueTypeCreator {
    /**
     * Create a new value type at the given key.
     * @param key - Key to create the value type at
     * @param type - Type of the value type to create
     * @param params - Initialization params for the value type
     * @alpha
     */
    createValueType(key: string, type: string, params: any): this;
}

export interface ISharedMapEvents extends ISharedObjectEvents {
    (event: "valueChanged" | "create", listener: (
        changed: IValueChanged,
        local: boolean,
        target: IEventThisPlaceHolder) => void);
    (event: "clear", listener: (
        local: boolean,
        target: IEventThisPlaceHolder
    ) => void);
}

/**
 * Shared map interface
 */
export interface ISharedMap extends ISharedObject<ISharedMapEvents>, Map<string, any> {
    /**
     * Retrieves the given key from the map.
     * @param key - Key to retrieve from
     * @returns The stored value, or undefined if the key is not set
     */
    get<T = any>(key: string): T | undefined;

    /**
     * A form of get except it will only resolve the promise once the key exists in the map.
     * @param key - Key to retrieve from
     * @returns The stored value once available
     */
    wait<T = any>(key: string): Promise<T>;

    /**
     * Sets the value stored at key to the provided value.
     * @param key - Key to set at
     * @param value - Value to set
     * @returns The ISharedMap itself
     */
    set<T = any>(key: string, value: T): this;

}

/**
 * The _ready-for-serialization_ format of values contained in DDS contents.  This allows us to use
 * ISerializableValue.type to understand whether they're storing a Plain JS object, a SharedObject, or a value type.
 * Note that the in-memory equivalent of ISerializableValue is ILocalValue (similarly holding a type, but with
 * the _in-memory representation_ of the value instead).  An ISerializableValue is what gets passed to
 * JSON.stringify and comes out of JSON.parse.  This format is used both for snapshots (loadCore/populate)
 * and ops (set).
 * If type is Plain, it must be a plain JS object that can survive a JSON.stringify/parse.  E.g. a URL object will
 * just get stringified to a URL string and not rehydrate as a URL object on the other side.  It may contain members
 * that are ISerializedHandle (the serialized form of a handle).
 * If type is a value type then it must be amongst the types registered via registerValueType or we won't know how
 * to serialize/deserialize it (we rely on its factory via .load() and .store()).  Its value will be type-dependent.
 * If type is Shared, then the in-memory value will just be a reference to the SharedObject.  Its value will be a
 * channel ID.  This type is legacy and deprecated.
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
    opName: string;

    /**
     * The payload that is submitted along with the operation.
     */
    value: any;
}
