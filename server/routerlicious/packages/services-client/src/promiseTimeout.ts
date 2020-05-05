/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Rejects if a promise is not fulfilled within <mSec> milliseconds.
*/
export async function promiseTimeout(mSec: number, promise: Promise<any>): Promise<any> {
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(`Timed out in ${mSec} milliseconds.`);
        }, mSec);
    });
    return Promise.race([
        promise,
        timeout,
    ]);
}
