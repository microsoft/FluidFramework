/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter, EventEmitterEventType } from "@fluidframework/common-utils";

/**
 * Event Emitter helper class
 * Any exceptions thrown by listeners will be caught and raised through "error" event.
 * Any exception thrown by "error" listeners will propagate to the caller.
 */
export class EventEmitterWithErrorHandling<TEvent extends IEvent = IEvent> extends TypedEventEmitter<TEvent> {
    constructor(private readonly errorListener?: (eventName: EventEmitterEventType, error: any) => void) {
        super();
        if (this.errorListener === undefined) {
            this.errorListener = this.defaultErrorHandler.bind(this);
        }
    }

    private defaultErrorHandler(event, error) {
        // Some listener threw an error, we'll try emitting that error via the error event
        // But not if we're already dealing with the error event, in that case just let the error be thrown
        if (event === "error") {
            throw error;
        }

        // Note: This will throw if no listeners are registered for the error event
        super.emit("error", error);
    }

    public emit(event: EventEmitterEventType, ...args: any[]): boolean {
        try {
            return super.emit(event, ...args);
        } catch (error) {
            this.errorListener!(event, error);
            return true;
        }
    }
}
