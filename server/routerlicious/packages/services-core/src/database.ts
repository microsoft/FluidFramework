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
    /**
     * Finds queries in the database and returns sorted result.
     *
     * @param query - data we want to find
     * @param sort - the value used to sort data.
     *
     */
    find(query: any, sort: any): Promise<T[]>;

    /**
     * Finds one query in the database, returns its value
     *
     *  @param query - data we want to find
     */
    findOne(query: any): Promise<T>;

    /**
     * Returns all values in the database
     */
    findAll(): Promise<T[]>;

    /**
     * Finds query in the database and returns its value.
     * Insert the value if query was not found.
     *
     * @param query - data we want to find
     * @param value - data to insert to the database if we cannot find query
     */
    findOrCreate(query: any, value: T): Promise<{ value: T, existing: boolean }>;

    /**
     *
     * Finds the query in the db. If it exists, update the value to set.
     * Throws if query cannot be found.
     *
     *  @param filter - data we want to find
     *  @param set - new values to change to
     *  @param addToSet
     */
    update(filter: any, set: any, addToSet: any): Promise<void>;

    /**
     *
     * Finds the value that satisfies query. If it exists, update the value to new set.
     * Otherwise inserts the set to the datbase.
     *
     *  @param filter - data we want to find
     *  @param set - new values to change to
     *  @param addToSet - unused
     */
    upsert(filter: any, set: any, addToSet: any): Promise<void>;

    /**
     * Inserts an entry into the database.
     * Throws if it would overwrite an existing entry
     *
     *  @param value - data to insert to the database
     *
     */
    insertOne(value: T): Promise<any>;

    /**
     * Insert multiple values in the database
     *
     * @param values - data to insert to the database
     * @param ordered - unused
     */
    insertMany(values: T[], ordered: boolean): Promise<void>;

    deleteOne(filter: any): Promise<any>;

    deleteMany(filter: any): Promise<any>;

    createIndex(index: any, unique: boolean): Promise<void>;
}
