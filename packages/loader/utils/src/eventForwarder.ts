/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@microsoft/fluid-container-definitions";
import { EventEmitter } from "events";

/**
 * Base class used for forwarding events from a source EventEmitter.
 * This can be useful when all arbitrary listeners need to be removed,
 * but the primary source needs to stay intact.
 */
export class EventForwarder extends EventEmitter implements IDisposable {
    protected static isEmitterEvent(event: string | symbol): boolean {
        return event === EventForwarder.newListenerEvent || event === EventForwarder.removeListenerEvent;
    }

    private static readonly newListenerEvent = "newListener";
    private static readonly removeListenerEvent = "removeListener";

    public get disposed() { return this.isDisposed; }
    private isDisposed: boolean = false;

    private readonly forwardingEvents: Map<string | symbol, () => void> =
        new Map<string | symbol, () => void>();

    constructor(source: EventEmitter) {
        super();
        if (source) {
            // newListener event is raised whenever someone starts listening to this events, so
            // we keep track of events being listened to, and start forwarding from the source
            // event emitter per event listened to on this
            const removeListenerHandler = (event: string | symbol) => this.unforward(event);
            const newListenerHandler = (event: string | symbol) => this.forward(source, event);
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
                // should be fine because of removeAllListeners below
            }
        }
        this.removeAllListeners();
        this.forwardingEvents.clear();
    }

    protected forward(source: EventEmitter, event: string | symbol): void {
        if (source && event && !EventForwarder.isEmitterEvent(event) && !this.forwardingEvents.has(event)) {
            const listener = (...args: any[]) => this.emit(event, ...args);
            this.forwardingEvents.set(event, () => source.off(event, listener));
            source.on(event, listener);
        }
    }

    protected unforward(event: string | symbol): void {
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
