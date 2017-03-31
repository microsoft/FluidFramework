import * as storage from "./storage";

export interface ICollaborativeObject {
    /**
     * A readonly identifier for th e collaborative object
     */
    id: string;

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
    attach(source: storage.IStorageObject);
}

/**
 * Collaborative map interface
 */
export interface IMap extends ICollaborativeObject {
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
    set(key: string, value: any): void;

    /**
     * Deletes the specified key from the map and returns the value of the key at the time of deletion.
     */
    delete(key: string): any;

    /**
     * Retreives all the keys contained within the map
     */
    keys(): string[];

    /**
     * Removes all entries from the map
     */
    clear();
}
