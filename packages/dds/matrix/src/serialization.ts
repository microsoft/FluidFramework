/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IComponentRuntime, IChannelStorageService } from "@fluidframework/component-runtime-definitions";
import { FileMode, TreeEntry } from "@fluidframework/protocol-definitions";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

export function serializeBlob(
    runtime: IComponentRuntime,
    handle: IComponentHandle,
    path: string,
    snapshot: Serializable,
) {
    const serializer = runtime.IComponentSerializer;

    return {
        mode: FileMode.File,
        path,
        type: TreeEntry[TreeEntry.Blob],
        value: {
            contents: serializer !== undefined
                ? serializer.stringify(snapshot, runtime.IComponentHandleContext, handle)
                : JSON.stringify(snapshot),
            encoding: "utf-8",
        },
    };
}

export async function deserializeBlob(runtime: IComponentRuntime, storage: IChannelStorageService, path: string) {
    const handleTableChunk = await storage.read(path);
    const utf8 = fromBase64ToUtf8(handleTableChunk);

    const serializer = runtime.IComponentSerializer;
    const data = serializer !== undefined
        ? serializer.parse(utf8, runtime.IComponentHandleContext)
        : JSON.parse(utf8);

    return data;
}
