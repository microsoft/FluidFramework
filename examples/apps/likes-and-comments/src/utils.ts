/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SyncedDataObject } from "@fluidframework/react";

export function getAuthorName(syncedDataObject: SyncedDataObject) {
    const quorum = syncedDataObject.dataProps.runtime.getQuorum();
    const clientId = syncedDataObject.dataProps.runtime.clientId ?? "";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return (quorum.getMember(clientId)?.client.user as any).name ?? "";
}
