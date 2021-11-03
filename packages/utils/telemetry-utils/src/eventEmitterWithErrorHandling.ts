/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IEvent, ITelemetryProperties } from "@fluidframework/common-definitions";
import { TypedEventEmitter, EventEmitterEventType } from "@fluidframework/common-utils";
import { normalizeError } from "./errorLogging";
import { IFluidErrorBase } from "./fluidErrorBase";

/**
 * Event Emitter helper class
 * Any exceptions thrown by listeners will be caught and raised through "error" event.
 * Any exception thrown by "error" listeners will propagate to the caller.
 */
export class EventEmitterWithErrorHandling<TEvent extends IEvent = IEvent> extends TypedEventEmitter<TEvent> {
    /**
     * Set up the error handling in case an event handler throws
     * @param errorHandler - Callback to pass the thrown error to (error will be normalized/annotated first)
     * @param errorSource - Describes where an error thrown by an event handler originates,
     * for use as @see IFluidErrorBase.errorSource.
     */
    constructor(
        private readonly  errorHandler: (eventName: EventEmitterEventType, error: IFluidErrorBase) => void,
        private readonly errorSource: string,
    ) {
        super();
    }

    public emit(event: EventEmitterEventType, ...args: any[]): boolean {
        try {
            return super.emit(event, ...args);
        } catch (error) {
            const props: ITelemetryProperties = {};
            props.errorSource = this.errorSource;
            if (typeof event === "string") {
                props.mishandledEvent = event;
            }

            this.errorHandler(event, normalizeError(error, { props }));
            return true;
        }
    }
}
