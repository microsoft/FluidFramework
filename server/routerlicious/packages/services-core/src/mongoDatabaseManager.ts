/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDatabaseManager } from "./database";
import { IDocument } from "./document";
import { ISequencedOperationMessage } from "./messages";
import { MongoManager } from "./mongo";
import { INode } from "./orderer";

/**
 * MongoDB implementation of IDatabaseManager
 */
export class MongoDatabaseManager implements IDatabaseManager {
    constructor(
        private readonly globalDbEnabled: boolean,
        private readonly operationsDbMongoManager: MongoManager,
        private readonly globalDbMongoManager: MongoManager,
        private readonly nodeCollectionName: string,
        private readonly documentsCollectionName: string,
        private readonly deltasCollectionName: string,
        private readonly scribeDeltasCollectionName: string) {
    }

    public async getNodeCollection(): Promise<ICollection<INode>> {
        return this.getCollection<INode>(this.nodeCollectionName);
    }

    public async getDocumentCollection(): Promise<ICollection<IDocument>> {
        return this.getCollection<IDocument>(this.documentsCollectionName);
    }

    public async getDeltaCollection(
        tenantId: string,
        documentId: string): Promise<ICollection<ISequencedOperationMessage>> {
        return this.getCollection<ISequencedOperationMessage>(this.deltasCollectionName);
    }

    public async getScribeDeltaCollection(
        tenantId: string,
        documentId: string,
    ): Promise<ICollection<ISequencedOperationMessage>> {
        return this.getCollection<ISequencedOperationMessage>(this.scribeDeltasCollectionName);
    }

    private async getCollection<T>(name: string) {
        const db = name === this.documentsCollectionName && this.globalDbEnabled ?
            await this.globalDbMongoManager.getDatabase() :
            await this.operationsDbMongoManager.getDatabase();

        return db.collection<T>(name);
    }
}
