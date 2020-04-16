/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { FileMode, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";

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

export async function deserializeBlob(runtime: IComponentRuntime, storage: IObjectStorageService, path: string) {
    const handleTableChunk = await storage.read(path);
    const utf8 = fromBase64ToUtf8(handleTableChunk);

    const serializer = runtime.IComponentSerializer;
    const data = serializer !== undefined
        ? serializer.parse(utf8, runtime.IComponentHandleContext)
        : JSON.parse(utf8);

    return data;
}
