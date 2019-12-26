/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentAttributes } from "@microsoft/fluid-protocol-definitions";
import { ILocalOrdererSetup, IPubSub, ISubscriber, LocalOrderer } from "@microsoft/fluid-server-memory-orderer";
import {
    GitManager,
    Historian,
    IGitManager,
} from "@microsoft/fluid-server-services-client";
import {
    ICollection,
    IDocument,
    IDocumentDetails,
    IOrderer,
    IOrdererManager,
    ISequencedOperationMessage,
} from "@microsoft/fluid-server-services-core";
import {
    IDatabaseManager,
    IDocumentStorage,
    ITaskMessageSender,
    ITenantManager,
} from "@microsoft/fluid-server-services-core";
import { normalizePort } from "@microsoft/fluid-server-services-utils";
import { Server } from "socket.io";

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

class LocalPubSub implements IPubSub {
    constructor(private io: Server) {
    }

    public subscribe(topic: string, subscriber: ISubscriber) {
    }

    public unsubscribe(topic: string, subscriber: ISubscriber) {
    }

    public publish(topic: string, ...args: any[]): void {
        const event = args.shift();
        this.io.to(topic).emit(event, ...args);
    }
}

class WrappedLocalOrdererSetup implements ILocalOrdererSetup {
    constructor(
        private readonly wrapped: ILocalOrdererSetup,
        private readonly tenantId: string,
        private readonly documentId: string,
    ) {
    }

    public async documentP(): Promise<IDocumentDetails> {
        const details = await this.wrapped.documentP();

        // TODO can remove wrapper once fix bug in local orderer scribe setup which assumes tenantId/documentId
        // come from saved scribe data rather than on outer document itself.
        const scribe = JSON.parse(details.value.scribe);
        scribe.tenantId = this.tenantId;
        scribe.documentId = this.documentId;
        details.value.scribe = JSON.stringify(scribe);

        return details;
    }

    public documentCollectionP(): Promise<ICollection<IDocument>> {
        return this.wrapped.documentCollectionP();
    }

    public deltaCollectionP(): Promise<ICollection<any>> {
        return this.wrapped.deltaCollectionP();
    }

    public scribeDeltaCollectionP(): Promise<ICollection<ISequencedOperationMessage>> {
        return this.wrapped.scribeDeltaCollectionP();
    }

    public protocolHeadP(): Promise<number> {
        return this.wrapped.protocolHeadP();
    }

    public scribeMessagesP(): Promise<ISequencedOperationMessage[]> {
        return this.wrapped.scribeMessagesP();
    }
}

export class OrdererManager implements IOrdererManager {
    private map = new Map<string, Promise<IOrderer>>();

    constructor(
        private storage: IDocumentStorage,
        private databaseManager: IDatabaseManager,
        private tenantManager: ITenantManager,
        private taskMessageSender: ITaskMessageSender,
        private permission: any, // can probably remove
        private maxMessageSize: number,
        private io: Server,
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
        const port = normalizePort(process.env.PORT || "3000");
        const url = `http://localhost:${port}/repos/${encodeURIComponent(tenantId)}`;

        const historian = new Historian(url, false, false);
        const gitManager = new GitManager(historian);

        const localOrdererSetup = new LocalOrdererSetup(
            tenantId,
            documentId,
            this.storage,
            this.databaseManager,
            gitManager);
        const wrapped = new WrappedLocalOrdererSetup(localOrdererSetup, tenantId, documentId);

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
            wrapped,
            new LocalPubSub(this.io));

        // This is a temporary hack to work around promise bugs in the LocalOrderer load. The LocalOrderer does not
        // wait on dependant promises in lambda startup. So we give it time to prepare these before actually resolving
        // the promise.
        // tslint:disable-next-line:no-string-based-set-timeout
        await new Promise((resolve) => { setTimeout(resolve, 1000); });

        return orderer;
    }
}
