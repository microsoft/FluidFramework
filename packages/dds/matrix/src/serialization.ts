/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { BlobTreeEntry } from "@fluidframework/protocol-base";
import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

export const serializeBlob = (
    handle: IFluidHandle,
    path: string,
    snapshot: Serializable,
    serializer: IFluidSerializer,
) => new BlobTreeEntry(path, serializer.stringify(snapshot, handle));

export async function deserializeBlob(storage: IChannelStorageService, path: string, serializer: IFluidSerializer) {
    const handleTableChunk = await storage.read(path);
    const utf8 = fromBase64ToUtf8(handleTableChunk);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return serializer.parse(utf8);
}
