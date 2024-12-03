/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICheckpoint, IDeliState, IDocument, IScribe } from "./document";
import { ISequencedOperationMessage } from "./messages";
import { INode } from "./orderer";

/**
 * Interface to abstract the backend database
 * @alpha
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
	 * Retrieves the document collection
	 */
	getCheckpointCollection(): Promise<ICollection<ICheckpoint>>;

	/**
	 * Retrieves the delta collection
	 */
	getDeltaCollection(
		tenantId: string | undefined,
		documentId: string | undefined,
	): Promise<ICollection<ISequencedOperationMessage>>;

	/**
	 * Scribe deltas collection
	 */
	getScribeDeltaCollection(
		tenantId: string | undefined,
		documentId: string | undefined,
	): Promise<ICollection<ISequencedOperationMessage>>;
}

/**
 * Abstract away IDocument collection logics
 * @internal
 */
export interface IDocumentRepository {
	/**
	 * Retrieves a document from the database
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	readOne(filter: any): Promise<IDocument | null>;

	/**
	 * Update one document in the database
	 */
	updateOne(filter: any, update: any, options?: any): Promise<void>;

	/**
	 * Delete one document in the database
	 */
	deleteOne(filter: any): Promise<any>;

	/**
	 * Find and create a document in the database by following option behavior
	 */
	findOneOrCreate(
		filter: any,
		value: any,
		options?: any,
	): Promise<{ value: IDocument; existing: boolean }>;

	/**
	 * Find and update a document in the database by following option behavior
	 */
	findOneAndUpdate(
		filter: any,
		value: any,
		options?: any,
	): Promise<{ value: IDocument; existing: boolean }>;

	create(document: IDocument): Promise<any>;

	/**
	 * Find if any document exists in the database by given filter
	 * @param filter - filter to check the existence of document
	 */
	exists(filter: any): Promise<boolean>;
}

/**
 * Abstract away ICheckpoint collection logic
 * @internal
 */
export interface ICheckpointRepository {
	/**
	 * Retrieves a checkpoint from the database
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	getCheckpoint(documentId: string, tenantId: string): Promise<ICheckpoint | null>;

	/**
	 * Writes a checkpoint to the database
	 */
	writeCheckpoint(
		documentId: string,
		tenantId: string,
		checkpoint: IDeliState | IScribe,
	): Promise<void>;

	/**
	 * Removes checkpoint for one service from the checkpoint's schema
	 */
	removeServiceCheckpoint(documentId: string, tenantId: string): Promise<void>;

	/**
	 * Deletes a checkpoint from the database
	 */
	deleteCheckpoint(documentId: string, tenantId: string): Promise<void>;
}

/**
 * Interface for a database of values that have type T.
 * In some implementations, T should have a member "_id" which is a string used
 * when adding or finding value in the database.
 * @internal
 */
export interface ICollection<T> {
	/**
	 * Executes an aggregration framework pipeline against the collection
	 *
	 * @param pipeline - array containing the aggregation framework commands for the execution
	 * @param options - optional settings
	 * @returns A cursor you can use to iterate over aggregated results.
	 */
	aggregate(pipeline: any, options?: any): any;
	/**
	 * Finds queries in the database
	 *
	 * @param query - data we want to find
	 * @param sort - object with property we use to sort on, whose value is 0 for descending order and 1 for ascending
	 * @param limit - optional. if set, limits the number of documents/records the cursor will return.
	 * Our mongo layer internally used 2000 by default.
	 * @param skip - optional. If set, defines the number of documents to skip in the results set.
	 * @returns The sorted results of the query.
	 */
	find(query: any, sort: any, limit?: number, skip?: number): Promise<T[]>;

	/**
	 * Finds one query in the database
	 *
	 * @param query - data we want to find
	 * @param options - optional. If set, provide customized options to the implementations
	 * @returns The value of the query in the database.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	findOne(query: any, options?: any): Promise<T | null>;

	/**
	 * @returns All values in the database.
	 */
	findAll(): Promise<T[]>;

	/**
	 * Finds query in the database and returns its value.
	 * Insert the value if query was not found.
	 *
	 * @param query - data we want to find
	 * @param value - data to insert to the database if we cannot find query
	 * @param options - optional. If set, provide customized options to the implementations
	 */
	findOrCreate(query: any, value: any, options?: any): Promise<{ value: T; existing: boolean }>;

	/**
	 * Finds query in the database and replace its value.
	 * Do nothing if query was not found.
	 *
	 * @param query - data we want to find
	 * @param value - data to update to the database
	 * @param options - optional. If set, provide customized options to the implementations
	 */
	findAndUpdate(
		query: any,
		value: any,
		options?: any,
	): Promise<{
		value: T;
		existing: boolean;
	}>;

	/**
	 * Finds the query in the database. If it exists, update the value to set.
	 * Throws if query cannot be found.
	 *
	 * @param filter - data we want to find
	 * @param set - new values to change to
	 * @param addToSet - an operator that insert a value to array unless the value already exists;
	 * @param options - optional. If set, provide customized options to the implementations
	 * only used in mongodb.ts
	 */
	update(filter: any, set: any, addToSet: any, options?: any): Promise<void>;

	/**
	 * Finds the query in the database. If it exists, update all the values to set.
	 * Throws if query cannot be found.
	 *
	 * @param filter - data we want to find
	 * @param set - new values to change to
	 * @param addToSet - an operator that insert a value to array unless the value already exists;
	 * only used in mongodb.ts
	 * @param options - optional. If set, provide customized options to the implementations
	 */
	updateMany(filter: any, set: any, addToSet: any, options?: any): Promise<void>;

	/**
	 * Finds the value that satisfies query. If it exists, update the value to new set.
	 * Otherwise inserts the set to the datbase.
	 *
	 * @param filter - data we want to find
	 * @param set - new values to change to
	 * @param addToSet - an operator that insert a value to array unless the value already exists;
	 * only used in mongodb.ts
	 * @param options - optional. If set, provide customized options to the implementations
	 */
	upsert(filter: any, set: any, addToSet: any, options?: any): Promise<void>;

	/**
	 * Inserts an entry into the database.
	 * Throws if it would overwrite an existing entry
	 *
	 * @param value - data to insert to the database
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

	distinct(key: any, query: any): Promise<any>;

	createIndex(index: any, unique: boolean): Promise<void>;

	createTTLIndex?(index: any, mongoExpireAfterSeconds?: number): Promise<void>;
}

/**
 * @internal
 */
export interface IRetryable {
	retryEnabled: boolean;
}

/**
 * @internal
 */
export function isRetryEnabled<T>(collection: ICollection<T>): boolean {
	return (collection as unknown as IRetryable).retryEnabled === true;
}

/**
 * @alpha
 */
export type IDbEvents = "close" | "reconnect" | "error" | "reconnectFailed";

/**
 * @alpha
 */
export interface IDb {
	close(): Promise<void>;

	on(event: IDbEvents, listener: (...args: any[]) => void);

	/**
	 * Get a reference to a MongoDB collection, or create one if it doesn't exist.
	 * @param name - collection name
	 * @param dbName - database name where collection located
	 */
	collection<T extends { [key: string]: any }>(name: string, dbName?: string): ICollection<T>;

	/**
	 * Removes a collection or view from the database.
	 * The method also removes any indexes associated with the dropped collection.
	 */
	dropCollection?(name: string): Promise<boolean>;

	/**
	 * Send a ping command to the database to check its health.
	 * @param dbName - database name
	 */
	healthCheck?(dbName?: string): Promise<void>;
}

/**
 * @alpha
 */
export interface IDbFactory {
	connect(global: boolean): Promise<IDb>;
}
