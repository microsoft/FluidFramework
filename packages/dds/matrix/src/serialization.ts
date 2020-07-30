/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/component-runtime-definitions";
import { FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { IFluidHandle } from "@fluidframework/component-core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

export function serializeBlob(
    runtime: IFluidDataStoreRuntime,
    handle: IFluidHandle,
    path: string,
    snapshot: Serializable,
) {
    const serializer = runtime.IFluidSerializer;

    return {
        mode: FileMode.File,
        path,
        type: TreeEntry[TreeEntry.Blob],
        value: {
            contents: serializer !== undefined
                ? serializer.stringify(snapshot, runtime.IFluidHandleContext, handle)
                : JSON.stringify(snapshot),
            encoding: "utf-8",
        },
    };
}

export async function deserializeBlob(runtime: IFluidDataStoreRuntime, storage: IChannelStorageService, path: string) {
    const handleTableChunk = await storage.read(path);
    const utf8 = fromBase64ToUtf8(handleTableChunk);

    const serializer = runtime.IFluidSerializer;
    const data = serializer !== undefined
        ? serializer.parse(utf8, runtime.IFluidHandleContext)
        : JSON.parse(utf8);

    return data;
}
