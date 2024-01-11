/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { TypedEventEmitter, EventEmitterEventType } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";

/**
 * Event Emitter helper class
 *
 * @remarks
 * Any exceptions thrown by listeners will be caught and raised through "error" event.
 * Any exception thrown by "error" listeners will propagate to the caller.
 * @privateRemarks
 * This probably doesn't belong in this package, as it is not telemetry-specific, and is really only intended for internal fluid-framework use.
 * We should consider moving it to the `core-utils` package.
 * @public
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
