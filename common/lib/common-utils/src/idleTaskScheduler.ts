/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";

/**
 * API used to schedule non-essential tasks
 * Time measurements are in milliseconds as a floating point with a decimal
 */
export default class IdleTaskScheduler {
  /*
  Takes in and runs a callback during idle time. Fallback to setTimeout if window doesn't
  support requestIdleCallback.
  @returns A promise pertaining to the callback that was passed in.
  */
  public scheduleIdleTask<T>(callback: () => T, timeout: number, props: ITelemetryProperties = {}): Promise<T> {
    let promise;
    //Check for the availability in window.
    if (typeof window?.requestIdleCallback === "function") {
      promise = new Promise((resolve, reject) => {
        requestIdleCallback(doLowPriorityTask, { timeout: timeout });
        function doLowPriorityTask(deadline) {
          try {
            resolve(callback());
          } catch (err: any) {
            props.responseMessage = err.message;
            reject(err);
          }
        }
      });
    }
    else {
      promise = new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(callback())
          } catch (e) {
            reject(e);
          }
        }, timeout);
      });
    }
    return promise;
  }

}
