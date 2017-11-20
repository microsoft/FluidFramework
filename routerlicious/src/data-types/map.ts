import { ICollaborativeObject } from "../api-core";

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
    keys(): IterableIterator<string>;

    /**
     * Removes all entries from the map
     */
    clear(): void;

    /**
     * Executes the provided callback function once per each key/value pair
     */
    forEach(callbackFn: (value, key) => void);
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
    createCounter(key: string, value?: number, min?: number, max?: number): ICounter;

    /**
     * Creates a set inside the map.
     */
    createSet<T>(key: string, value?: T[]): ISet<T>;
}

/**
 * Counter interface
 */
export interface ICounter {
    /**
     * Increment/decrement the underlying value.
     */
    increment(value: number): ICounter;

    /**
     * Returns the underlying value.
     */
    get(): number;
 }

/**
 * Set interface
 */
export interface ISet<T> {
    /**
     * Inserts an element to the set.
     */
    add(value: T): ISet<T>;

    /**
     * Deletes an element from the set.
     */
    delete(value: T): ISet<T>;

    /**
     * Returns elements of the set as an array.
     */
    entries(): any[];

    /**
     * Returns the underlying set.
     */
    getInternalSet(): Set<T>;
 }
