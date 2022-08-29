/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";

/**
 * Read a blob from {@link @fluidframework/driver-definitions#IDocumentStorageService} and
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * it into object of type `T`.
 *
 * @param storage - The `DocumentStorageService` to read from.
 * @param id - The ID of the blob to read and parse.
 *
 * @typeParam T - Output type matching JSON format of inpyt blob data.
 *
 * @returns The object that we decoded and parsed via `JSON.parse`.
 */
export async function readAndParse<T>(storage: Pick<IDocumentStorageService, "readBlob">, id: string): Promise<T> {
    const blob = await storage.readBlob(id);
    const decoded = bufferToString(blob, "utf8");
    return JSON.parse(decoded) as T;
}
