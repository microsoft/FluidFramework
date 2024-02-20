/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// False positive: this is an import from the `events` package, not from Node.
// eslint-disable-next-line unicorn/prefer-node-protocol
import { EventEmitter } from "events";
import { ITelemetryLoggerExt } from "./telemetryTypes.js";

/**
 * Note: The contents of this file really don't belong in this package, as they are only intended for internal use.
 * They should be moved into the `core-utils` package in the future.
 */

/**
 * @internal
 */
export const connectedEventName = "connected";

/**
 * @internal
 */
export const disconnectedEventName = "disconnected";

// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export function safeRaiseEvent(
	emitter: EventEmitter,
	logger: ITelemetryLoggerExt,
	event: string,
	...args: unknown[]
): void {
	try {
		emitter.emit(event, ...args);
	} catch (error) {
		logger.sendErrorEvent({ eventName: "RaiseEventError", event }, error);
	}
}

/**
 * Raises events pertaining to the connection
 * @param logger - The logger to log telemetry
 * @param emitter - The event emitter instance
 * @param connected - A boolean tracking whether the connection was in a connected state or not
 * @param clientId - The connected/disconnected clientId
 * @param disconnectedReason - The reason for the connection to be disconnected (Used for telemetry purposes only)
 *
 * @internal
 */
export function raiseConnectedEvent(
	logger: ITelemetryLoggerExt,
	emitter: EventEmitter,
	connected: boolean,
	clientId?: string,
	disconnectedReason?: string,
): void {
	try {
		if (connected) {
			emitter.emit(connectedEventName, clientId);
		} else {
			emitter.emit(disconnectedEventName, disconnectedReason);
		}
	} catch (error) {
		logger.sendErrorEvent({ eventName: "RaiseConnectedEventError" }, error);
	}
}
