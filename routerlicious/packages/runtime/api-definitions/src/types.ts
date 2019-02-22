import { ITree } from "@prague/container-definitions";
import { IChannel } from "@prague/runtime-definitions";

/**
 * Helper interface to wrap a snapshot with the sequence number it was taken at
 */
export interface ISharedObjectSnapshot {
    sequenceNumber: number;

    snapshot: any;
}

export interface ISharedObject extends IChannel {
    /**
     * The type of the shared object
     */
    type: string;

    /**
     * Marker to clearly identify the object as a shared object
     */
    __sharedObject__: boolean;

    /**
     * Attaches an event listener for the given event
     */
    on(event: string | symbol, listener: (...args: any[]) => void): this;

    /**
     * Removes the specified listenever
     */
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this;

    /**
     * Attaches the given shared object to its containing document
     */
    attach(): this;

    /**
     * Returns whether the given shared object is local
     */
    isLocal(): boolean;

    /**
     * Snapshots the object
     */
    snapshot(): ITree;
}
