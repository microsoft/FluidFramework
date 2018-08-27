import { IChannel, IObjectMessage, ITree } from "@prague/runtime-definitions";

/**
 * Helper interface to wrap a snapshot with the sequence number it was taken at
 */
export interface ICollaborativeObjectSnapshot {
    sequenceNumber: number;

    snapshot: any;
}

export interface ICollaborativeObject extends IChannel {
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
     * Transforms the given message relative to the provided sequence number
     */
    transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;
}
