/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@prague/container-definitions";
import { ISharedObject } from "@prague/shared-object-common";

export interface ISet<T> {
    add(value: T): ISet<T>;

    delete(value: T): ISet<T>;

    entries(): T[];
}

/**
 * Type of "valueChanged" event parameter
 */
export interface IValueChanged {
    key: string;
    previousValue: any;
}

export interface IValueOpEmitter {
    emit(opName: string, previousValue: any, params: any);
}

/**
 * A value factory is used to serialize/deserialize values to a map
 */
export interface IValueFactory<T> {
    load(emitter: IValueOpEmitter, raw: any): T;

    store(value: T): any;
}

export interface IValueOperation<T> {
    /**
     * Allows the handler to prepare for the operation
     */
    prepare(value: T, params: any, local: boolean, message: ISequencedDocumentMessage): Promise<any>;

    /**
     * Performs the actual processing on the operation
     */
    process(value: T, params: any, context: any, local: boolean, message: ISequencedDocumentMessage);
}

/**
 * Used to register a new value type on a map
 */
export interface IValueType<T> {
    /**
     * Name of the value type
     */
    name: string;

    /**
     * Factory method used to convert to/from a JSON form of the type
     */
    factory: IValueFactory<T>;

    /**
     * Do we need initialization code here???
     */

    /**
     * Operations that can be applied to the value
     */
    ops: Map<string, IValueOperation<T>>;
}

export interface IValueTypeSupporter {
    /**
     * Registers a value type to support
     */
    registerValueType<T>(type: IValueType<T>);
}

/**
 * Interface describing actions on a directory.  When used as a Map, operates on its keys.
 */
export interface IDirectory extends Map<string, any> {
    /**
     * Retrieves the given key from the map
     */
    get<T = any>(key: string): T;

    /**
     * Sets the key to the provided value. An optional type can be specified to initialize the key
     * to one of the registered value types.
     */
    set<T = any>(key: string, value: T, type?: string): this;

    /**
     * Get an IDirectory within the directory, in order to use relative paths from that location.
     * @param path - Path of the IDirectory to get, relative to this IDirectory
     */
    getWorkingDirectory(path: string): IDirectory;
}

/**
 * Interface describing a shared directory.
 */
export interface ISharedDirectory extends ISharedObject, IValueTypeSupporter, IDirectory {
}

/**
 * Type of "valueChanged" event parameter for SharedDirectory
 */
export interface IDirectoryValueChanged extends IValueChanged {
    path: string;
}

/**
 * Shared map interface
 */
export interface ISharedMap extends ISharedObject, IValueTypeSupporter, Map<string, any> {
    /**
     * Retrieves the given key from the map
     */
    get<T = any>(key: string): T;

    /**
     * A form of get except it will only resolve the promise once the key exists in the map.
     */
    wait<T>(key: string): Promise<T>;

    /**
     * Sets the key to the provided value. An optional type can be specified to initialize the key
     * to one of the registered value types.
     */
    set<T = any>(key: string, value: T, type?: string): this;

    /**
     * Registers a listener on the specified events
     */
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    on(
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    on(event: "valueChanged", listener: (
                                        changed: IValueChanged,
                                        local: boolean,
                                        op: ISequencedDocumentMessage,
                                        target: this) => void): this;
}

/**
 * The _ready-for-serialization_ format of values contained in DDS contents.  This allows us to use
 * ISerializableValue.type to understand whether they're storing a Plain JS object, a SharedObject, or a value type.
 * Note that the in-memory equivalent of ISerializableValue is ILocalValue (similarly holding a type, but with
 * the _in-memory representatation_ of the value instead).  An ISerializableValue is what gets passed to
 * JSON.stringify and comes out of JSON.parse.  This format is used both for snapshots (loadCore/populate)
 * and ops (set).
 * If type is Plain, then it's taken at face value as a JS object but it better be something that can survive a
 * JSON.stringify/parse roundtrip or it won't work.  E.g. a URL object will just get stringified to a URL string
 * and not rehydrate as a URL object on the other side.
 * If type is Shared, then the in-memory value will just be a reference to the SharedObject.  Its value will be a
 * channel ID.
 * If type is a value type then it must be amongst the types registered via registerValueType or we won't know how
 * to serialize/deserialize it (we rely on its factory via .load() and .store()).  Its value will be type-dependent.
 */
export interface ISerializableValue {
    type: string;
    value: any;
}

/**
 * ValueTypes handle ops slightly differently from SharedObjects or plain JS objects.  The type on the op itself
 * will describe the type of ValueType, so the value on the op instead carries a more-complex object to describe
 * specificially what that ValueType is doing.  IValueTypeOperationValue is that more complex object.  The type on it
 * is the ValueType-specific operation (e.g. "increment" on Counter) and the value is whatever params the
 * ValueType needs to complete that operation.
 * Similar to ISerializableValue, it is serializable via JSON.stringify/parse but differs in that it has no
 * equivalency with an in-memory value - rather it just describes an operation to be applied to an already-in-memory
 * value.
 */
export interface IValueTypeOperationValue {
    opName: string;
    value: any;
}
