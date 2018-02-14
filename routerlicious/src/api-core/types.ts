import * as protocol from "./protocol";
import * as storage from "./storage";

export const SAVE = "save";

/**
 * Helper interface to wrap a snapshot with the sequence number it was taken at
 */
export interface ICollaborativeObjectSnapshot {
    sequenceNumber: number;

    snapshot: any;
}

export interface ICollaborativeObjectSave {
    type: string;

    message: string;
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
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    /**
     * Removes the specified listenever
     */
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;

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
