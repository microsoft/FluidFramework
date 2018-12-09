import * as core from "@prague/services-core";
import * as uuid from "uuid/v4";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

export class LocalNodeFactory implements IConcreteNodeFactory {
    constructor(
        private hostname: string,
        private address: string,
        private storage: core.IDocumentStorage,
        private databaseManager: core.IDatabaseManager,
        private timeoutLength: number,
        private taskMessageSender: core.ITaskMessageSender,
        private tenantManager: core.ITenantManager,
        private permission: any,
        private maxMessageSize: number) {
    }

    public async create(): Promise<LocalNode> {
        const node = LocalNode.Connect(
            `${this.hostname}-${uuid()}`,
            this.address,
            this.storage,
            this.databaseManager,
            this.timeoutLength,
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            this.maxMessageSize);

        return node;
    }
}
