/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

export const serializeBlob = (
    handle: IFluidHandle,
    path: string,
    snapshot: Serializable,
    serializer?: IFluidSerializer,
) => ({
        mode: FileMode.File,
        path,
        type: TreeEntry.Blob,
        value: {
            contents: serializer !== undefined
                ? serializer.stringify(snapshot, handle)
                : JSON.stringify(snapshot),
            encoding: "utf-8",
        },
    });

export async function deserializeBlob(storage: IChannelStorageService, path: string, serializer?: IFluidSerializer) {
    const handleTableChunk = await storage.read(path);
    const utf8 = fromBase64ToUtf8(handleTableChunk);
    const data = serializer !== undefined
        ? serializer.parse(utf8)
        : JSON.parse(utf8);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return data;
}
