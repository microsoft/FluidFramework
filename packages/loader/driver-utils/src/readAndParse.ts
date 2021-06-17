/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";

/**
 * Read a blob from IDocumentStorageService and JSON.parse it into object of type T
 *
 * @param storage - the IDocumentStorageService to read from
 * @param id - the id of the blob to read and parse
 * @returns the object that we decoded and JSON.parse
 */
export async function readAndParse<T>(storage: Pick<IDocumentStorageService, "readBlob">, id: string): Promise<T> {
    const blob = await storage.readBlob(id);
    const decoded = bufferToString(blob, "utf8");
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
