/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument } from "./document";
import { ISequencedOperationMessage } from "./messages";
import { INode } from "./orderer";

/**
 * Interface to abstract the backend database
 */
export interface IDatabaseManager {
    /**
     * Retrieves the node collection
     */
    getNodeCollection(): Promise<ICollection<INode>>;

    /**
     * Retrieves the document collection
     */
    getDocumentCollection(): Promise<ICollection<IDocument>>;

    /**
     * Retrieves the delta collection
     */
    getDeltaCollection(tenantId: string, documentId: string): Promise<ICollection<ISequencedOperationMessage>>;

    /**
     * Scribe deltas collection
     */
    getScribeDeltaCollection(tenantId: string, documentId: string): Promise<ICollection<ISequencedOperationMessage>>;
}

export interface ICollection<T> {
    find(query: any, sort: any): Promise<T[]>;

    findOne(query: any): Promise<T>;

    findAll(): Promise<T[]>;

    findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }>;

    update(filter: any, set: any, addToSet: any): Promise<void>;

    upsert(filter: any, set: any, addToSet: any): Promise<void>;

    insertOne(value: T): Promise<any>;

    insertMany(values: T[], ordered: boolean): Promise<void>;

    deleteOne(filter: any): Promise<any>;

    deleteMany(filter: any): Promise<any>;

    createIndex(index: any, unique: boolean): Promise<void>;
}
