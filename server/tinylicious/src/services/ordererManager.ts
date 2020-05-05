/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalOrderer } from "@microsoft/fluid-server-memory-orderer";
import {
    GitManager,
    IHistorian,
} from "@microsoft/fluid-server-services-client";
import {
    IOrderer,
    IOrdererManager,
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
} from "@microsoft/fluid-server-services-core";
import * as winston from "winston";

export class OrdererManager implements IOrdererManager {
    private readonly map = new Map<string, Promise<IOrderer>>();

    constructor(
        private readonly storage: IDocumentStorage,
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly taskMessageSender: ITaskMessageSender,
        private readonly permission: any, // Can probably remove
        private readonly maxMessageSize: number,
        private readonly createHistorian: (tenant: string) => Promise<IHistorian>,
    ) {
    }

    public async getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        const key = `${tenantId}/${documentId}`;

        if (!this.map.has(key)) {
            const orderer = this.createLocalOrderer(tenantId, documentId);
            this.map.set(key, orderer);
        }

        return this.map.get(key);
    }

    private async createLocalOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
        const historian = await this.createHistorian(tenantId);
        const gitManager = new GitManager(historian);

        const orderer = await LocalOrderer.load(
            this.storage,
            this.databaseManager,
            tenantId,
            documentId,
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            this.maxMessageSize,
            winston,
            gitManager);

        // This is a temporary hack to work around promise bugs in the LocalOrderer load. The LocalOrderer does not
        // wait on dependant promises in lambda startup. So we give it time to prepare these before actually resolving
        // the promise.
        // tslint:disable-next-line:no-string-based-set-timeout
        await new Promise((resolve) => { setTimeout(resolve, 1000); });

        return orderer;
    }
}
