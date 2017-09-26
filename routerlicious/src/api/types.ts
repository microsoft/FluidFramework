import * as protocol from "./protocol";
import * as storage from "./storage";

/**
 * Helper interface to wrap a snapshot with the sequence number it was taken at
 */
export interface ICollaborativeObjectSnapshot {
    sequenceNumber: number;

    snapshot: any;
}

export interface ICollaborativeObject {
    /**
     * A readonly identifier for the collaborative object
     */
    id: string;

    /**
     * The type of the collaborative object
     */
    type: string;

    /**
     * Marker to clearly identify the object as a collaborative object
     */
    __collaborativeObject__: boolean;

    /**
     * Attaches an event listener for the given event
     */
    on(event: string, listener: Function): this;

    /**
     * Removes the specified listenever
     */
    removeListener(event: string, listener: Function): this;

    /**
     * Removes all listeners, or those of the specified event name
     */
    removeAllListeners(event?: string): this;

    /**
     * Attaches the given collaborative object to its containing document
     */
    attach(): this;

    /**
     * Returns whether the given collaborative object is local
     */
    isLocal(): boolean;

    /**
     * Gets a form of the object that can be serialized.
     * TODO this is temporary to bootstrap the process. For performance/dynamic load/etc... we'll likely expose
     * access to the snapshot behind the storage objects.
     */
    snapshot(): storage.ITree;

    /**
     * Transforms the given message relative to the provided sequence number
     */
    transform(message: protocol.IObjectMessage, sequenceNumber: number): protocol.IObjectMessage;
}

/**
 * Type of "valueChanged" event parameter
 */
export interface IValueChanged {
    key: string;
}

/**
 * Type of "KeyValueChanged" event parameter
 */
export interface IKeyValueChanged {
    key: string;

    value: any;
}

export interface IMapView {
    /**
     * Retrieves the given key from the map
     */
    get(key: string): any;

    /**
     * A form of get except it will only resolve the promise once the key exists in the map.
     */
    wait<T>(key: string): Promise<T>;

    /**
     * Returns a boolean indicating whether or not the key exists in the map
     */
    has(key: string): boolean;

    /**
     * Sets the key to the provided value
     */
    set(key: string, value: any): void;

    /**
     * Deletes the specified key from the map and returns the value of the key at the time of deletion.
     */
    delete(key: string): void;

    /**
     * Retreives all the keys contained within the map
     */
    keys(): string[];

    /**
     * Removes all entries from the map
     */
    clear(): void;
}

/**
 * Collaborative map interface
 */
export interface IMap extends ICollaborativeObject {
    /**
     * Retrieves the given key from the map
     */
    get(key: string): Promise<any>;

    /**
     * A form of get except it will only resolve the promise once the key exists in the map.
     */
    wait<T>(key: string): Promise<T>;

    /**
     * Returns a boolean indicating whether or not the key exists in the map
     */
    has(key: string): Promise<boolean>;

    /**
     * Sets the key to the provided value
     */
    set(key: string, value: any): Promise<void>;

    /**
     * Deletes the specified key from the map and returns the value of the key at the time of deletion.
     */
    delete(key: string): Promise<void>;

    /**
     * Retreives all the keys contained within the map
     */
    keys(): Promise<string[]>;

    /**
     * Removes all entries from the map
     */
    clear(): Promise<void>;

    /**
     * Retreives a synchronous view of the map
     */
    getView(): Promise<IMapView>;

    /**
     * Creates a counter inside the map.
     */
    createCounter(key: string, value?: number, min?: number, max?: number): Promise<ICounter>;

    /**
     * Creates a set inside the map.
     */
    createSet<T>(key: string, value?: T[]): Promise<ISet<T>>;
}

/**
 * Collaborative cell interface
 */
export interface ICell extends ICollaborativeObject {
    /**
     * Retrieves the cell value.
     */
    get(): Promise<any>;

    /**
     * Sets the cell value.
     */
    set(value: any): Promise<void>;

    /**
     * Checks whether cell is empty or not.
     */
    empty(): Promise<boolean>;

    /**
     * Delete the value from the cell.
     */
    delete(): Promise<void>;
}

/**
 * Counter interface
 */

 export interface ICounter {
    /**
     * Increment/decrement the underlying value.
     */
    increment(value: number): Promise<void>;

    /**
     * Increment/decrement the underlying value.
     */
    get(): Promise<number>;
 }

/**
 * Set interface
 */
export interface ISet<T> {
    /**
     * Inserts element to the set.
     */
    add(value: T): Promise<T[]>;

    /**
     * delete element from the set.
     */
    delete(value: T): Promise<T[]>;

    /**
     * Returns elements of the set.
     */
    entries(): Promise<T[]>;

 }
