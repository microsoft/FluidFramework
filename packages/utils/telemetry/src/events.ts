/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    ITelemetryLogger,
} from "@fluidframework/common-definitions";

export function raiseConnectedEvent(
    logger: ITelemetryLogger,
    emitter: EventEmitter,
    connected: boolean,
    clientId?: string)
{
    try {
        if (connected) {
            emitter.emit("connected", clientId);
        } else {
            emitter.emit("disconnected");
        }
    } catch (error) {
        logger.sendErrorEvent({ eventName: "RaiseConnectedEventError", clientId }, error);
    }
}
