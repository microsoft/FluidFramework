/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { bufferToString } from "@fluidframework/driver-utils";
import { FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";

export const serializeBlob = (
    handle: IFluidHandle,
    path: string,
    snapshot: Serializable,
    serializer: IFluidSerializer,
) => ({
        mode: FileMode.File,
        path,
        type: TreeEntry.Blob,
        value: {
            contents: serializer.stringify(snapshot, handle),
            encoding: "utf-8",
        },
    });

export async function deserializeBlob(storage: IChannelStorageService, path: string, serializer: IFluidSerializer) {
    const blob = await storage.readBlob(path);
    const handleTableChunk = bufferToString(blob);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return serializer.parse(handleTableChunk);
}
