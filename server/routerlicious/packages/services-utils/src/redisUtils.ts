/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { Redis } from "ioredis";

export async function executeRedisMultiWithHmsetExpire(
    client: Redis,
    key: string,
    data: { [key: string]: any },
    expireAfterSeconds: number) {
    const deferred = new Deferred<void>();
    await client.multi()
                .hmset(key, data)
                .expire(key, expireAfterSeconds)
                .exec((err, results) => {
                    // `err` refers to possible errors in the exec command (compile-time)
                    // and `results` is an array of responses corresponding to the sequence of queued commands.
                    // Each response follows the format `[err, result]`. `err` refers to runtime errors.

                    // Check if exec had an error
                    if (err) {
                        deferred.reject(err);
                        return;
                    }

                    // Check if any queued command had an error
                    for (const result of results) {
                        if (result[0] && result[0] instanceof Error) {
                            deferred.reject(err);
                            return;
                        }
                    }

                    // HMSET should return the string OK indicating success. Otherwise, we had an error.
                    if (results[0][1] !== "OK") {
                        deferred.reject(new Error(`Redis HMSET returned unexpected response: ${results[0][1]}`));
                        return;
                    }

                    // EXPIRE should return the number 1 indicating success. Otherwise, we had an error.
                    if (results[1][1] !== 1) {
                        deferred.reject(new Error(`Redis EXPIRE returned unexpected response: ${results[0][1]}`));
                        return;
                    }

                    deferred.resolve();
                });

    return deferred.promise;
}
