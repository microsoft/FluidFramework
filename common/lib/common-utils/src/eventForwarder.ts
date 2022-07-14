/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable, IEvent, IEventProvider } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "./typedEventEmitter";

/**
 * Base class used for forwarding events from a source EventEmitter.
 * This can be useful when all arbitrary listeners need to be removed,
 * but the primary source needs to stay intact.
 */
export class EventForwarder<TEvent = IEvent>
    extends TypedEventEmitter<TEvent> implements IDisposable {
    protected static isEmitterEvent(event: string): boolean {
        return event === EventForwarder.newListenerEvent || event === EventForwarder.removeListenerEvent;
    }

    private static readonly newListenerEvent = "newListener";
    private static readonly removeListenerEvent = "removeListener";

    /**
     * {@inheritDoc @fluidframework/common-definitions#IDisposable.disposed}
     */
    public get disposed(): boolean { return this.isDisposed; }
    private isDisposed: boolean = false;

    private readonly forwardingEvents =
        new Map<string, Map<EventEmitter | IEventProvider<TEvent & IEvent>, () => void>>();

    constructor(source?: EventEmitter | IEventProvider<TEvent & IEvent>) {
        super();
        if (source !== undefined) {
            // NewListener event is raised whenever someone starts listening to this events, so
            // we keep track of events being listened to, and start forwarding from the source
            // event emitter per event listened to on this
            const removeListenerHandler = (event: string): void => this.unforwardEvent(source, event);
            const newListenerHandler = (event: string): void => this.forwardEvent(source, event);
            this.on(EventForwarder.removeListenerEvent, removeListenerHandler);
            this.on(EventForwarder.newListenerEvent, newListenerHandler);
        }
    }

    /**
     * {@inheritDoc @fluidframework/common-definitions#IDisposable.dispose}
     */
    public dispose(): void {
        this.isDisposed = true;
        for (const listenerRemovers of this.forwardingEvents.values()) {
            for (const listenerRemover of listenerRemovers.values()) {
                try {
                    listenerRemover();
                } catch {
                    // Should be fine because of removeAllListeners below
                }
            }
        }
        this.removeAllListeners();
        this.forwardingEvents.clear();
    }

    protected forwardEvent(source: EventEmitter | IEventProvider<TEvent & IEvent>, ...events: string[]): void {
        for (const event of events) {
            if (source !== undefined && event !== undefined && !EventForwarder.isEmitterEvent(event)) {
                let sources = this.forwardingEvents.get(event);
                if (sources === undefined) {
                    sources = new Map();
                    this.forwardingEvents.set(event, sources);
                }
                if (!sources.has(source)) {
                    const listener = (...args: any[]): boolean => this.emit(event, ...args);
                    sources.set(source, () => source.off(event, listener));
                    source.on(event, listener);
                }
            }
        }
    }

    protected unforwardEvent(source: EventEmitter | IEventProvider<TEvent & IEvent>, ...events: string[]): void {
        for (const event of events) {
            if (event !== undefined && !EventForwarder.isEmitterEvent(event)) {
                const sources = this.forwardingEvents.get(event);
                if ((sources?.has(source)) === true && this.listenerCount(event) === 0) {
                    const listenerRemover = sources.get(source);
                    if (listenerRemover !== undefined) {
                        listenerRemover();
                    }
                    sources.delete(source);
                    if (sources.size === 0) {
                        this.forwardingEvents.delete(event);
                    }
                }
            }
        }
    }
}
