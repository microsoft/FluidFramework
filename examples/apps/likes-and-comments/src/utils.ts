/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SyncedDataObject } from "@fluid-experimental/react";

export function getAuthorName(syncedDataObject: SyncedDataObject) {
    const quorum = syncedDataObject.dataProps.runtime.getQuorum();
    const clientId = syncedDataObject.dataProps.runtime.clientId ?? "";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return (quorum.getMember(clientId)?.client.user as any).name ?? "";
}
