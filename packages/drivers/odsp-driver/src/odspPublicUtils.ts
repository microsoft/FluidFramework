/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { hashFile, IsoBuffer } from "@fluidframework/common-utils";

export async function getHashedDocumentId(driveId: string, itemId: string): Promise<string> {
    const buffer = IsoBuffer.from(`${driveId}_${itemId}`);
    return encodeURIComponent(await hashFile(buffer, "SHA-256", "base64"));
}
