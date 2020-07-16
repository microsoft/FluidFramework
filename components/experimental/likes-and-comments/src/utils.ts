/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SyncedComponent } from "@fluidframework/react";

export function getAuthorName(syncedComponent: SyncedComponent) {
    const quorum = syncedComponent.dataProps.runtime.getQuorum();
    const clientId = syncedComponent.dataProps.runtime.clientId ?? "";
    return (quorum.getMember(clientId)?.client.user as any).name ?? "";
}
