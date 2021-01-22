/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";
import { bufferToString } from "@fluidframework/common-utils";

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
    // const handleTableChunk = await storage.read(path);
    // const utf8 = fromBase64ToUtf8(handleTableChunk);
    const blob = await storage.readBlob(path);
    const utf8 = bufferToString(blob, "utf8");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return serializer.parse(utf8);
}
