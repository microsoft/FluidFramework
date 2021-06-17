/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { BlobTreeEntry } from "@fluidframework/protocol-base";
import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";
import { bufferToString } from "@fluidframework/common-utils";

export const serializeBlob = (
    handle: IFluidHandle,
    path: string,
    snapshot: Serializable,
    serializer: IFluidSerializer,
) => new BlobTreeEntry(path, serializer.stringify(snapshot, handle));

export async function deserializeBlob(storage: IChannelStorageService, path: string, serializer: IFluidSerializer) {
    const blob = await storage.readBlob(path);
    const utf8 = bufferToString(blob, "utf8");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return serializer.parse(utf8);
}
