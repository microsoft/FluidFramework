/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IEvent } from "@fluidframework/core-interfaces";
import { TypedEventEmitter, EventEmitterEventType } from "@fluidframework/common-utils";

/**
 * Event Emitter helper class
 * Any exceptions thrown by listeners will be caught and raised through "error" event.
 * Any exception thrown by "error" listeners will propagate to the caller.
 */
export class EventEmitterWithErrorHandling<
	TEvent extends IEvent = IEvent,
> extends TypedEventEmitter<TEvent> {
	constructor(
		// TODO: use `unknown` instead (breaking API change)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private readonly errorHandler: (eventName: EventEmitterEventType, error: any) => void,
	) {
		super();
	}

	public emit(event: EventEmitterEventType, ...args: unknown[]): boolean {
		try {
			return super.emit(event, ...args);
		} catch (error) {
			this.errorHandler(event, error);
			return true;
		}
	}
}
