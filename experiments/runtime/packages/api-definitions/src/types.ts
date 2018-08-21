import { ITree } from "@prague/runtime-definitions";
import { IObjectMessage } from "./protocol";

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
     * Returns whether the object has any pending unacked ops.
     */
    dirty: boolean;

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
     * Snapshots the object
     */
    snapshot(): ITree;

    /**
     * Returns a promise indicating whether or not the distributed data structure is ready to process
     * incoming messages.
     */
    ready(): Promise<void>;

    /**
     * Transforms the given message relative to the provided sequence number
     */
    transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;
}
