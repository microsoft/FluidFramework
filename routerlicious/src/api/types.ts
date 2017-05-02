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
     * A readonly identifier for th e collaborative object
     */
    id?: string;

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
     * Attaches the given collaborative object to an upstream storage location.
     * This marks it as a collaborative object.
     */
    attach(source: storage.ICollaborationServices);

    /**
     * Gets a form of the object that can be serialized.
     * TODO this is temporary to bootstrap the process. For performance/dynamic load/etc... we'll likely expose
     * access to the snapshot behind the storage objects.
     */
    snapshot(): Promise<void>;
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
}
