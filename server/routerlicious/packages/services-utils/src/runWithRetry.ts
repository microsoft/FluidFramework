/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { delay } from "@fluidframework/common-utils";
import * as winston from "winston";

export async function runWithRetry<T>(
    api: () => Promise<T>,
    callName: string,
    shouldRetry?: (error) => boolean,
): Promise<T | undefined> {
    let result: T | undefined;
    let retryCount = 0;
    const retryAfterMs = 1000;
    let success = false;
    do  {
        try {
            result = await api();
            success = true;
        } catch (error) {
            winston.info(`Error running ${callName}: ${error}`);
            if (shouldRetry !== undefined && shouldRetry(error) === false) {
                break;
            } else {
                if (retryCount > 3) {
                    // Needs to be a full rejection here
                    return Promise.reject(error);
                }
                await delay(retryAfterMs * 2 ** retryCount);
                retryCount++;
            }
        }
    } while (!success);

    return result;
}
