/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";

/**
 * Event Emitter helper class
 * Any exceptions thrown by listeners will be caught and raised through "error" event.
 * Any exception thrown by "error" listeners will propagate to the caller.
 */
export class EventEmitterWithErrorHandling extends EventEmitter {
    public emit(event: string | symbol, ...args: any[]): boolean {
        if (event === "error") {
            const anyListeners = super.emit(event, ...args);
            if (!anyListeners) {
                console.error("Nobody is listening for 'error' events");
            }
            return anyListeners;
        }

        let result: boolean;
        try {
            result = super.emit(event, ...args);
        } catch (error) {
            result = this.emit("error", error);
        }
        return result;
    }
}
