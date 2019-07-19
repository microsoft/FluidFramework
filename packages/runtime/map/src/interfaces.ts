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
    emit(name: string, previousValue: any, params: any);
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

export interface IMapRegistry {
    /**
     * Registers a new operation on the map
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
export interface ISharedDirectory extends ISharedObject, IDirectory {
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
export interface ISharedMap extends ISharedObject, IMapRegistry, Map<string, any> {
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

export interface ILocalViewElement {
    // The type of local value
    localType: string;

    // The actual local value
    localValue: any;
}
