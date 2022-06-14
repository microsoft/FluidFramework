/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Redis } from "ioredis";

export interface IRedisParameters {
    prefix?: string;
    expireAfterSeconds?: number;
}

export const executeRedisMultiWithHmsetExpire = async (
    client: Redis,
    key: string,
    data: { [key: string]: any; },
    expireAfterSeconds: number): Promise<void> => new Promise<void>((resolve, reject) => {
        client.multi()
        .hmset(key, data)
        .expire(key, expireAfterSeconds)
        .exec()
        .then((results) => {
            // results` is an array of responses corresponding to the sequence of queued commands.
            // In other words, it is [Error | null, any][].
            // Each response follows the format `[err, result]`. `err` refers to runtime errors.

            // Check if any queued command had an error
            for (const result of results) {
                if (result[0] && result[0] instanceof Error) {
                    reject(result[0]);
                    return;
                }
            }

            // HMSET should return the string OK indicating success. Otherwise, we had an error.
            if (results[0][1] !== "OK") {
                reject(new Error(`Redis HMSET returned unexpected response: ${results[0][1]}`));
                return;
            }

            // EXPIRE should return the number 1 indicating success. Otherwise, we had an error.
            if (results[1][1] !== 1) {
                reject(new Error(`Redis EXPIRE returned unexpected response: ${results[0][1]}`));
                return;
            }

            resolve();
        })
        .catch((error) => { reject(error); });
});
