/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";

export interface ISet<T> {
    add(value: T): ISet<T>;

    delete(value: T): ISet<T>;

    entries(): T[];
}

/**
 * Type of "valueChanged" event parameter
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
     * Performs the actual processing on the operation
     */
    process(value: T, params: any, local: boolean, message: ISequencedDocumentMessage);
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

export interface IValueTypeCreator {
    /**
     * Create a new value type at the given key.
     * @alpha
     * @param key - key to create the value type at
     * @param type - type of the value type to create
     * @param params - initialization params for the value type
     */
    createValueType(key: string, type: string, params: any): this;
}

/**
 * Interface describing actions on a directory.
 *
 * @remarks
 * When used as a Map, operates on its keys.
 */
export interface IDirectory extends Map<string, any>, IValueTypeCreator {
    /**
     * The absolute path of the directory.
     */
    readonly absolutePath: string;

    /**
     * Retrieves the value stored at the given key from the directory.
     * @param key - key to retrieve from
     */
    get<T = any>(key: string): T;

    /**
     * A form of get except it will only resolve the promise once the key exists in the directory.
     * @param key - key to retrieve from
     */
    wait<T = any>(key: string): Promise<T>;

    /**
     * Sets the value stored at key to the provided value.
     * @param key - key to set at
     * @param value - value to set
     */
    set<T = any>(key: string, value: T): this;

    /**
     * Creates an IDirectory child of this IDirectory.
     * @param subdirName - Name of the new child directory to create
     */
    createSubDirectory(subdirName: string): IDirectory;

    /**
     * Gets an IDirectory child of this IDirectory, if it exists.
     * @param subdirName - Name of the child directory to get
     */
    getSubDirectory(subdirName: string): IDirectory;

    /**
     * Checks whether this directory has a child directory with the given name.
     * @param subdirName - Name of the child directory to check
     */
    hasSubDirectory(subdirName: string): boolean;

    /**
     * Deletes an IDirectory child of this IDirectory, if it exists, along with all descendent keys and directories.
     * @param subdirName - Name of the child directory to delete
     */
    deleteSubDirectory(subdirName: string): boolean;

    /**
     * Returns an iterator over the IDirectory children of this IDirectory.
     */
    subdirectories(): IterableIterator<[string, IDirectory]>;

    /**
     * Get an IDirectory within the directory, in order to use relative paths from that location.
     * @param relativePath - Path of the IDirectory to get, relative to this IDirectory
     */
    getWorkingDirectory(relativePath: string): IDirectory;
}

/**
 * Interface describing a shared directory.
 */
export interface ISharedDirectory extends ISharedObject, IDirectory {
    /**
     * Registers a listener on the specified events
     */
    on(event: string | symbol, listener: (...args: any[]) => void): this;
    on(
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    on(event: "valueChanged", listener: (
        changed: IDirectoryValueChanged,
        local: boolean,
        op: ISequencedDocumentMessage,
        target: this) => void): this;
}

/**
 * Type of "valueChanged" event parameter for SharedDirectory
 */
export interface IDirectoryValueChanged extends IValueChanged {
    /**
     * The absolute path to the IDirectory storing the key which changed.
     */
    path: string;
}

/**
 * Shared map interface
 */
export interface ISharedMap extends ISharedObject, Map<string, any>, IValueTypeCreator {
    /**
     * Retrieves the given key from the map
     */
    get<T = any>(key: string): T;

    /**
     * A form of get except it will only resolve the promise once the key exists in the map.
     */
    wait<T = any>(key: string): Promise<T>;

    /**
     * Sets the key to the provided value.
     */
    set<T = any>(key: string, value: T): this;

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
 * If type is Plain, it must be a plain JS object that can survive a JSON.stringify/parse.  E.g. a URL object will
 * just get stringified to a URL string and not rehydrate as a URL object on the other side.  It may contain members
 * that are ISerializedHandle (the serialized form of a handle).
 * If type is a value type then it must be amongst the types registered via registerValueType or we won't know how
 * to serialize/deserialize it (we rely on its factory via .load() and .store()).  Its value will be type-dependent.
 * If type is Shared, then the in-memory value will just be a reference to the SharedObject.  Its value will be a
 * channel ID.  This type is legacy and deprecated.
 */
export interface ISerializableValue {
    type: string;
    value: any;
}

/**
 * ValueTypes handle ops slightly differently from SharedObjects or plain JS objects.  Since the Map/Directory doesn't
 * know how to handle the ValueType's ops, those ops are instead passed along to the ValueType for processing.
 * IValueTypeOperationValue is that passed-along op.  The opName on it is the ValueType-specific operation (e.g.
 * "increment" on Counter) and the value is whatever params the ValueType needs to complete that operation.
 * Similar to ISerializableValue, it is serializable via JSON.stringify/parse but differs in that it has no
 * equivalency with an in-memory value - rather it just describes an operation to be applied to an already-in-memory
 * value.
 */
export interface IValueTypeOperationValue {
    opName: string;
    value: any;
}
