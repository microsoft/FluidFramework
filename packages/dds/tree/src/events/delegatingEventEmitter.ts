/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import { EventEmitter as NodeEventEmitter } from "events";
import { EventEmitter, EventFilter } from "./events";

/**
 * Used by a {@link DelegatingEventEmitter} to store the underlying built-in event emitter
 */
export const wrappedEmitter = Symbol("The underlying event emitter");

/**
 * An {@link IEventEmitter} which delegates eventing to a built-in event emitter.
 * Use the {@link wrappedEmitter} property to access the underlying emitter.
 * This class may be extended
 */
export class DelegatingEventEmitter<
    Events extends EventFilter<Events>,
> extends EventEmitter<Events> {
    /**
     * The event emitter provided during construction to which all operations in this class are delegated
     */
    public readonly [wrappedEmitter]: NodeEventEmitter;

    /**
     * Create a {@link DelegatingEventEmitter} that forwards event registration and emission to the given emitter
     * @param emitter - the inner event emitter which will be wrapped by this emitter. Defaults to a new `EventEmitter`.
     */
    public static create<Events extends EventFilter<Events>>(
        emitter: NodeEventEmitter = new NodeEventEmitter(),
    ) {
        // Expose the `emit` method so that it may be called by the creator.
        return new DelegatingEventEmitter(emitter) as DelegatingEventEmitter<Events> & {
            emit: DelegatingEventEmitter<Events>["emit"];
        };
    }

    /**
     * Create this {@link DelegatingEventEmitter} which delegates to the given built-in event emitter
     * @param emitter - the inner event emitter which will be wrapped by this emitter. Defaults to a new `EventEmitter`.
     */
    protected constructor(emitter: NodeEventEmitter = new NodeEventEmitter()) {
        super();
        this[wrappedEmitter] = emitter;
    }

    /**
     * Fire the given event, notifying all suscribers by calling their registered listener functions
     * @param eventName - the name of the event to fire
     * @param args - the arguments passed to the event listener functions
     */
    protected emit<K extends (string | symbol) & keyof EventFilter<Events>>(
        eventName: K,
        ...args: Parameters<Events[K]>
    ): void {
        const argArray: unknown[] = args; // TODO: TS 4.5.5 cannot spread `args`, but future versions (e.g. 4.8.4) can.
        this[wrappedEmitter].emit(eventName, ...argArray);
    }

    /**
     * Register an event listener
     * @param eventName - the name of the event
     * @param listener - the handler to run when the event is fired by the emitter
     * @param once - whether or not the listener should be removed after it is fired the first time
     * @param position - whether the listener should be appended to the beginning or the end of the list of existing listeners. Listeners are fired in the order of the list.
     * @returns a function which will deregister the listener when run
     */
    public on<K extends (string | symbol) & keyof EventFilter<Events>>(
        eventName: K,
        listener: Events[K],
        once = false,
        position: "prepend" | "append" = "append",
    ): () => void {
        if (once) {
            if (position === "prepend") {
                this[wrappedEmitter].prependOnceListener(eventName, listener);
            } else {
                this[wrappedEmitter].once(eventName, listener);
            }
        } else {
            if (position === "prepend") {
                this[wrappedEmitter].prependListener(eventName, listener);
            } else {
                this[wrappedEmitter].addListener(eventName, listener);
            }
        }

        return () => this[wrappedEmitter].removeListener(eventName, listener);
    }
}
