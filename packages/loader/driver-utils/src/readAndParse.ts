/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";

/**
 * Read a blob from IDocumentStorageService, decode it (from "base64") and JSON.parse it into object of type T
 *
 * @param storage - the IDocumentStorageService to read from
 * @param id - the id of the blob to read and parse
 * @returns the object that we decoded and JSON.parse
 */
export async function readAndParse<T>(storage: Pick<IDocumentStorageService, "read">, id: string): Promise<T> {
    const encoded = await storage.read(id);
    const decoded = Buffer
        .from(encoded, "base64")
        .toString();
    return JSON.parse(decoded) as T;
}
