/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalOrderer } from "@microsoft/fluid-server-memory-orderer";
import * as core from "@microsoft/fluid-server-services-core";
import {
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
} from "@microsoft/fluid-server-services-core";

export class OrdererManager implements core.IOrdererManager {
    private map = new Map<string, core.IOrderer>();

    constructor(
        private storage: IDocumentStorage,
        private databaseManager: IDatabaseManager,
        private tenantManager: ITenantManager,
        private taskMessageSender: ITaskMessageSender,
        private permission: any, // can probably remove
        private maxMessageSize: number,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
        const key = `${tenantId}/${documentId}`;

        if (!this.map.has(key)) {
            const orderer = await LocalOrderer.load(
                this.storage,
                this.databaseManager,
                tenantId,
                documentId,
                this.taskMessageSender,
                this.tenantManager,
                this.permission,
                this.maxMessageSize);
            this.map.set(key, orderer);
        }

        return this.map.get(key);
    }
}
