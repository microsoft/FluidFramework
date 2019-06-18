/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
    IWebSocketServer,
} from "@prague/services-core";

import * as uuid from "uuid/v4";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

export class LocalNodeFactory implements IConcreteNodeFactory {
    constructor(
        private hostname: string,
        private address: string,
        private storage: IDocumentStorage,
        private databaseManager: IDatabaseManager,
        private timeoutLength: number,
        private webSocketServerFactory: () => IWebSocketServer,
        private taskMessageSender: ITaskMessageSender,
        private tenantManager: ITenantManager,
        private permission: any,
        private maxMessageSize: number) {
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
            this.maxMessageSize);

        return node;
    }
}
