/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryErrorEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { isOnline, OnlineStatus, canRetryOnError } from "./network";

export function logNetworkFailure(logger: ITelemetryLogger, event: ITelemetryErrorEvent, error?: any) {
    const newEvent = { ...event };

    const errorOnlineProp = error.online;
    newEvent.online = typeof errorOnlineProp === "string"
        ? errorOnlineProp
        : OnlineStatus[isOnline()];

    if (typeof navigator === "object" && navigator !== null) {
        const nav = navigator as any;
        const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
        if (connection !== null && typeof connection === "object") {
            newEvent.connectionType = connection.type;
        }
    }

    // non-retryable errors are fatal and should be logged as errors
    newEvent.category = canRetryOnError(error) ? "generic" : "error";
    logger.sendTelemetryEvent(newEvent, error);
}

/**
 * Wait for browser to get to connected state.
 * If connected, waits minimum of minDelay anyway (between network retries)
 * If disconnected, polls every 30 seconds anyway, to make sure we are not getting stuck because of wrong signal
 * Note that browsers will have false positives (like having Hyper-V adapter on machine,
 * or machine connected to router that is not connected to internet)
 * But there should be no false negatives.
 * The only exception - Opera returns false when user enters "Work Offline" mode, regardless of actual connectivity.
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async
export function waitForConnectedState(minDelay: number): Promise<void> {
    // Use this frequency to poll even when we are offline and able to setup online/offline listener
    // This is mostly safety net
    const offlinePollFrequency = 30000;

    return new Promise((resolve) => {
        let listener: () => void = resolve;
        let delay = minDelay;
        if (isOnline() === OnlineStatus.Offline) {
            if (window?.addEventListener !== undefined) {
                listener = () => {
                    resolve();
                    window.removeEventListener("online", listener);
                };
                window.addEventListener("online", listener, false);
                delay = Math.max(minDelay, offlinePollFrequency);
            }
        }
        setTimeout(listener, delay);
    });
}
