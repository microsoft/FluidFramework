import * as uuid from "uuid/v4";
import * as core from "../../core";
import { MongoManager } from "../../utils";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

export class LocalNodeFactory implements IConcreteNodeFactory {
    constructor(
        private hostname: string,
        private address: string,
        private storage: core.IDocumentStorage,
        private mongoManager: MongoManager,
        private nodeCollectionName: string,
        private documentsCollectionName: string,
        private deltasCollectionName: string,
        private timeoutLength: number,
        private taskMessageSender: core.ITaskMessageSender,
        private tenantManager: core.ITenantManager,
        private permission: any) {
    }

    public async create(): Promise<LocalNode> {
        const node = LocalNode.Connect(
            `${this.hostname}-${uuid()}`,
            this.address,
            this.storage,
            this.mongoManager,
            this.nodeCollectionName,
            this.documentsCollectionName,
            this.deltasCollectionName,
            this.timeoutLength,
            this.taskMessageSender,
            this.tenantManager,
            this.permission);

        return node;
    }
}
