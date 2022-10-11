/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * API used to schedule non-essential tasks
 * Time measurements are in milliseconds as a floating point with a decimal
 * Takes in and runs a callback during idle time. Fallback to setTimeout if window doesn't
 * support requestIdleCallback.
 * @returns A promise pertaining to the callback that was passed in.
 */
export async function scheduleIdleTask<T>(callback: () => T, timeout: number): Promise<T> {
    // Check for the availability in window.
    return typeof window?.requestIdleCallback === "function"
        ? new Promise<T>((resolve, reject) => {
              function doLowPriorityTask(deadline): void {
                  try {
                      resolve(callback());
                  } catch (err: any) {
                      reject(err);
                  }
              }
              requestIdleCallback(doLowPriorityTask, { timeout });
          })
        : new Promise<T>((resolve, reject) => {
              setTimeout(() => {
                  try {
                      resolve(callback());
                  } catch (e) {
                      reject(e);
                  }
              }, timeout);
          });
}
