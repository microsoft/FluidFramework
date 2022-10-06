/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";

/**
 * API used to schedule non-essential tasks
 * Time measurements are in milliseconds as a floating point with a decimal
 */
export class IdleTaskScheduler {
  /*
  Takes in and runs a callback during idle time. Fallback to setTimeout if window doesn't
  support requestIdleCallback.
  @returns A promise pertaining to the callback that was passed in.
  */
  public async scheduleIdleTask<T>(callback: () => T, timeout: number, props: ITelemetryProperties = {}): Promise<T> {
    // let promise;
    // Check for the availability in window.
    if (typeof window?.requestIdleCallback === "function") {
      return  new Promise<T>((resolve, reject) => {
        requestIdleCallback(doLowPriorityTask, { timeout });
        function doLowPriorityTask(deadline): void {
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
      return new Promise<T>((resolve, reject) => {
        setTimeout(() => {
          try {
            resolve(callback())
          } catch (e) {
            reject(e);
          }
        }, timeout);
      });
    }
  }

}
