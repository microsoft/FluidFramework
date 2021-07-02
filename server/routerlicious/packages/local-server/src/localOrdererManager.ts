/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPubSub, LocalOrderer } from "@fluidframework/server-memory-orderer";
import { GitManager, IHistorian } from "@fluidframework/server-services-client";
import {
    IDatabaseManager,
    IDocumentStorage,
    ILogger,
    IOrderer,
    IOrdererManager,
    IServiceConfiguration,
    ITaskMessageSender,
    ITenantManager,
    TokenGenerator,
} from "@fluidframework/server-services-core";

export class LocalOrdererManager implements IOrdererManager {
    private readonly map = new Map<string, Promise<IOrderer>>();

    constructor(
        private readonly storage: IDocumentStorage,
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly taskMessageSender: ITaskMessageSender,
        private readonly permission: any, // Can probably remove
        private readonly tokenGenerator: TokenGenerator,
        private readonly createHistorian: (tenant: string) => Promise<IHistorian>,
        private readonly logger: ILogger,
        private readonly serviceConfiguration?: Partial<IServiceConfiguration>,
        private readonly pubsub?: IPubSub,
    ) {
    }

    /**
     * Closes all local orderers
     */
    public async close() {
        await Promise.all(Array.from(this.map.values()).map(async (orderer) => (await orderer).close()));
        this.map.clear();
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
            this.tokenGenerator,
            this.logger,
            gitManager,
            undefined /* ILocalOrdererSetup */,
            this.pubsub,
            undefined /* broadcasterContext */,
            undefined /* scriptoriumContext */,
            undefined /* foremanContext */,
            undefined /* scribeContext */,
            undefined /* deliContext */,
            undefined /* moiraContext */,
            this.serviceConfiguration);

        const lambdas = [
            orderer.broadcasterLambda,
            orderer.deliLambda,
            orderer.foremanLambda,
            orderer.scribeLambda,
            orderer.scriptoriumLambda,
        ];
        await Promise.all(lambdas.map(async (l) => {
            if (l.state === "created") {
                return new Promise<void>((resolve) => l.once("started", () => resolve()));
            }
        }));

        return orderer;
    }
}
