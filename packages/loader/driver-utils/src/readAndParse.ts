/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { DriverErrorType, IDocumentStorageService, IThrottlingWarning } from "@fluidframework/driver-definitions";

/**
 * Read a blob from IDocumentStorageService, decode it (from "base64") and JSON.parse it into object of type T
 *
 * @param storage - the IDocumentStorageService to read from
 * @param id - the id of the blob to read and parse
 * @returns the object that we decoded and JSON.parse
 */
export async function readAndParse<T>(storage: Pick<IDocumentStorageService, "read">, id: string): Promise<T> {
    const encoded = await readWithRetry(async () => storage.read(id));
    const decoded = fromBase64ToUtf8(encoded);
    return JSON.parse(decoded) as T;
}

/**
 * Read a blob from map, decode it (from "base64") and JSON.parse it into object of type T
 *
 * @param blobs - the blob map to read from
 * @param id - the id of the blob to read and parse
 * @returns the object that we decoded and JSON.parse
 */
export function readAndParseFromBlobs<T>(blobs: {[index: string]: string}, id: string): T {
    const encoded = blobs[id];
    const decoded = fromBase64ToUtf8(encoded);
    return JSON.parse(decoded) as T;
}

/**
 * Utility to retry the read or fetch until it succeeds in it.
 * @param api - Method to be retried.
 */
export async function readWithRetry<T>(api: () => Promise<T>): Promise<T> {
    let result: T;
    try {
        result = await api();
    } catch (error) {
        let retryAfter = 0;
        // If the error is throttling error, then wait for the specified time before retrying.
        // eslint-disable-next-line no-null/no-null
        if (error !== null && typeof error === "object" && error.errorType === DriverErrorType.throttlingError) {
            retryAfter = (error as IThrottlingWarning).retryAfterSeconds;
        }
        result = await new Promise((resolve) => setTimeout(async () => {
            resolve(await readWithRetry(api));
        }, retryAfter));
    }
    return result;
}
