/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentAttributes } from "@microsoft/fluid-protocol-definitions";
import { ILocalOrdererSetup, LocalOrderer } from "@microsoft/fluid-server-memory-orderer";
import {
    GitManager,
    IGitManager,
    IHistorian,
} from "@microsoft/fluid-server-services-client";
import {
    ICollection,
    IDocument,
    IDocumentDetails,
    IOrderer,
    IOrdererManager,
    ISequencedOperationMessage,
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
} from "@microsoft/fluid-server-services-core";

export class LocalOrdererSetup implements ILocalOrdererSetup {
    constructor(
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly storage: IDocumentStorage,
        private readonly databaseManager: IDatabaseManager,
        private readonly gitManager?: IGitManager,
    ) {
    }

    public documentP(): Promise<IDocumentDetails> {
        return this.storage.getOrCreateDocument(this.tenantId, this.documentId);
    }

    public documentCollectionP(): Promise<ICollection<IDocument>> {
        return this.databaseManager.getDocumentCollection();
    }

    public deltaCollectionP(): Promise<ICollection<any>> {
        return this.databaseManager.getDeltaCollection(this.tenantId, this.documentId);
    }

    public scribeDeltaCollectionP(): Promise<ICollection<ISequencedOperationMessage>> {
        return this.databaseManager.getScribeDeltaCollection(this.tenantId, this.documentId);
    }

    public async protocolHeadP(): Promise<number> {
        if (!this.gitManager) {
            return 0;
        }

        const existingRef = await this.gitManager.getRef(encodeURIComponent(this.documentId));
        if (!existingRef) {
            return -1;
        }

        const content = await this.gitManager.getContent(existingRef.object.sha, ".protocol/attributes");
        const attributes = JSON.parse(Buffer.from(content.content, content.encoding).toString()) as IDocumentAttributes;

        return attributes.sequenceNumber;
    }

    public async scribeMessagesP(): Promise<ISequencedOperationMessage[]> {
        const scribeDeltaCollection = await this.scribeDeltaCollectionP();
        return scribeDeltaCollection.find({
            documentId: this.documentId,
            tenantId: this.tenantId,
        }, { "operation.sequenceNumber": 1 });
    }
}

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

        const localOrdererSetup = new LocalOrdererSetup(
            tenantId,
            documentId,
            this.storage,
            this.databaseManager,
            gitManager);

        const orderer = await LocalOrderer.load(
            this.storage,
            this.databaseManager,
            tenantId,
            documentId,
            this.taskMessageSender,
            this.tenantManager,
            this.permission,
            this.maxMessageSize,
            gitManager,
            localOrdererSetup);

        // This is a temporary hack to work around promise bugs in the LocalOrderer load. The LocalOrderer does not
        // wait on dependant promises in lambda startup. So we give it time to prepare these before actually resolving
        // the promise.
        // tslint:disable-next-line:no-string-based-set-timeout
        await new Promise((resolve) => { setTimeout(resolve, 1000); });

        return orderer;
    }
}
