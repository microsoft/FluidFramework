/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalOrderer } from "@fluidframework/server-memory-orderer";
import {
    GitManager,
    IHistorian,
} from "@fluidframework/server-services-client";
import {
    IOrderer,
    IOrdererManager,
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
    ILogger,
} from "@fluidframework/server-services-core";

export class MemoryOrdererManager implements IOrdererManager {
    private readonly map = new Map<string, Promise<IOrderer>>();

    constructor(
        private readonly storage: IDocumentStorage,
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly taskMessageSender: ITaskMessageSender,
        private readonly permission: any, // Can probably remove
        private readonly maxMessageSize: number,
        private readonly createHistorian: (tenant: string) => Promise<IHistorian>,
        private readonly logger: ILogger,
    ) {
    }

    /**
     * Returns true if there are any received ops that are not yet ordered.
     */
    public async hasPendingWork(): Promise<boolean> {
        return Promise.all(this.map.values()).then((orderers) => {
            for (const orderer of orderers) {
                // We know that it ia LocalOrderer, break the abstraction
                if ((orderer as LocalOrderer).hasPendingWork()) {
                    return true;
                }
            }
            return false;
        });
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
            this.logger,
            gitManager);

        const lambdas = [
            orderer.broadcasterLambda,
            orderer.deliLambda,
            orderer.foremanLambda,
            orderer.scribeLambda,
            orderer.scriptoriumLambda,
        ];
        await Promise.all(lambdas.map(async (l) => {
            if (l.state === "created") {
                return new Promise((resolve) => l.once("started", () => resolve()));
            }
        }));

        return orderer;
    }
}
