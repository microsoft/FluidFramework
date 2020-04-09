/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable, IEventProvider, IEvent } from "@microsoft/fluid-common-definitions";
import { TypedEventEmitter, TEventEmitterEvent } from "./typedEventEmitter";

/**
 * Base class used for forwarding events from a source EventEmitter.
 * This can be useful when all arbitrary listeners need to be removed,
 * but the primary source needs to stay intact.
 */
export class EventForwarder<TEvent extends IEvent = IEvent>
    extends TypedEventEmitter<TEvent> implements IDisposable {
    protected static isEmitterEvent(event: TEventEmitterEvent): boolean {
        return event === EventForwarder.newListenerEvent || event === EventForwarder.removeListenerEvent;
    }

    private static readonly newListenerEvent = "newListener";
    private static readonly removeListenerEvent = "removeListener";

    public get disposed() { return this.isDisposed; }
    private isDisposed: boolean = false;

    private readonly forwardingEvents = new Map<TEventEmitterEvent, () => void>();

    constructor(source: EventEmitter | IEventProvider<TEvent>) {
        super();
        if (source) {
            // NewListener event is raised whenever someone starts listening to this events, so
            // we keep track of events being listened to, and start forwarding from the source
            // event emitter per event listened to on this
            const removeListenerHandler = (event: string) => this.unforwardEvent(event);
            const newListenerHandler = (event: string) => this.forwardEvent(source, event);
            this.on(EventForwarder.removeListenerEvent, removeListenerHandler);
            this.on(EventForwarder.newListenerEvent, newListenerHandler);
        }
    }

    public dispose() {
        this.isDisposed = true;
        for (const listenerRemover of this.forwardingEvents.values()) {
            try {
                listenerRemover();
            } catch {
                // Should be fine because of removeAllListeners below
            }
        }
        this.removeAllListeners();
        this.forwardingEvents.clear();
    }

    protected forwardEvent(source: EventEmitter | IEventProvider<TEvent>, ...events: TEventEmitterEvent[]): void {
        for(const event of events){
            if (source && event && !EventForwarder.isEmitterEvent(event) && !this.forwardingEvents.has(event)) {
                const listener = (...args: any[]) => this.emit(event, ...args);
                this.forwardingEvents.set(event, () => source.off(event, listener));
                source.on(event, listener);
            }
        }
    }

    protected unforwardEvent(...events: TEventEmitterEvent[]): void {
        for(const event of events){
            if (event && !EventForwarder.isEmitterEvent(event) && this.forwardingEvents.has(event)) {
                if (this.listenerCount(event) === 0) {
                    const listenerRemover = this.forwardingEvents.get(event);
                    if (listenerRemover) {
                        listenerRemover();
                    }
                    this.forwardingEvents.delete(event);
                }
            }
        }
    }
}
