/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";

/**
 * Helper class that is used to schedule non-essential tasks
 * Time measurements are in milliseconds as a floating point with a decimal
 */
export default class IdleTaskScheduler {

    /*
    Takes in and runs a callback function during idle time
    */
    public scheduleIdleTask<T> (callback: () => T, timeout: number, props: ITelemetryProperties) {
        if('requestIdleCallback' in window){
            // start time?
            requestIdleCallback(callback, {timeout: timeout});
            // stop time?
        } else {
            //polyfill code
            setTimeout(0)
        }

    }
}
