/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
    IWebSocketServer,
    ILogger,
    TokenGenerator,
} from "@fluidframework/server-services-core";
import { v4 as uuid } from "uuid";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

export class LocalNodeFactory implements IConcreteNodeFactory {
    constructor(
        private readonly hostname: string,
        private readonly address: string,
        private readonly storage: IDocumentStorage,
        private readonly databaseManager: IDatabaseManager,
        private readonly timeoutLength: number,
        private readonly webSocketServerFactory: () => IWebSocketServer,
        private readonly taskMessageSender: ITaskMessageSender,
        private readonly tenantManager: ITenantManager,
        private readonly permission: any,
        private readonly maxMessageSize: number,
        private readonly tokenGenerator: TokenGenerator,
        private readonly logger: ILogger) {
    }

    public async create(): Promise<LocalNode> {
        const node = LocalNode.connect(
            `${this.hostname}-${uuid()}`,
            this.address,
            this.storage,
            this.databaseManager,
            this.timeoutLength,
            this.webSocketServerFactory,
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            this.maxMessageSize,
            this.tokenGenerator,
            this.logger);

        return node;
    }
}
