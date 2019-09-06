/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@prague/container-definitions";
import { EventEmitter } from "events";

/**
 * Base class used for forwarding events from a source EventEmitter.
 * This can be useful when all arbitrary listeners need to be removed,
 * but the primary source needs to stay intact.
 */
export class EventForwarder extends EventEmitter implements IDisposable {
    public get disposed() { return this.isDisposed; }
    private isDisposed: boolean = false;

    private readonly disposalActions: (() => void)[] = [];
    private readonly forwardingEvents: Set<string | symbol> = new Set<string | symbol>();

    constructor(emitter: EventEmitter) {
        super();
        if (emitter) {
            // newListener event is raised whenever someone starts listening to this events, so
            // we keep track of events being listened to, and start forwarding from the source
            // event emitter per event listened to on this
            const newListenerHandler = (event: string | symbol) => this.forward(emitter, event);
            this.on("newListener", newListenerHandler);
            this.disposalActions.push(() => this.off("newListener", newListenerHandler));
        }
    }

    public dispose() {
        this.isDisposed = true;
        for (const disposalAction of this.disposalActions) {
            try {
                disposalAction();
            } catch {
                // should be fine because of removeAllListeners below
            }
        }
        this.removeAllListeners();
        this.disposalActions.length = 0;
        this.forwardingEvents.clear();
    }

    protected forward(emitter: EventEmitter, event: string | symbol): void {
        if (emitter && event && !this.forwardingEvents.has(event)) {
            const listener = (...args: any[]) => this.emit(event, ...args);
            this.forwardingEvents.add(event);
            emitter.on(event, listener);
            this.disposalActions.push(() => emitter.off(event, listener));
        }
    }
}
