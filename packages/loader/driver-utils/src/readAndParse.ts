/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluidframework/common-utils";
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
