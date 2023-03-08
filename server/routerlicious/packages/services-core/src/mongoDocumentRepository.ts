/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDb, IDocumentRepository } from "./database";
import { IDocument } from "./document";

export class MongoDocumentRepository implements IDocumentRepository {
    constructor(private readonly collection: ICollection<IDocument>) {
    }

    public static create(
        database: IDb,
        collectionName: string,
    ): MongoDocumentRepository {
        return new MongoDocumentRepository(database.collection<IDocument>(collectionName));
    }

    async readDocument(filter: any): Promise<IDocument> {
        return this.collection.findOne(filter);
    }

    async updateDocument(
        filter: any,
        update: any,
        option: any,
    ): Promise<void> {
        const addToSet = undefined; // AddToSet is not used anywhere. Change the behavior in the future if things changed.
        await (option.upsert
            ? this.collection.upsert(filter, update, addToSet, option)
            : this.collection.update(filter, update, addToSet, option));
    }

    async findAndCreateDocument(filter: any, value: any, option: any = undefined): Promise<{ value: IDocument; existing: boolean; }> {
        return this.collection.findOrCreate(filter, value, option);
    }

    async findAndUpdateDocument(filter: any, value: any, option: any = undefined): Promise<{ value: IDocument; existing: boolean; }> {
        return this.collection.findAndUpdate(filter, value, option);
    }

    async createDocument(document: IDocument): Promise<any> {
        return this.collection.insertOne(document);
    }
}
