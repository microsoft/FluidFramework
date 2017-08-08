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
}

export interface IMapView {
    /**
     * Retrieves the given key from the map
     */
    get(key: string): any;

    /**
     * Returns a boolean indicating whether or not the key exists in the map
     */
    has(key: string): boolean;

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
    keys(): string[];

    /**
     * Removes all entries from the map
     */
    clear(): Promise<void>;
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
