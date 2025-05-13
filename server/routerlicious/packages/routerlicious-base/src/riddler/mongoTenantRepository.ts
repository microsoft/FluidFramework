/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection } from "@fluidframework/server-services-core";
import { ITenantDocument } from "./tenantManager";

/**
 * Abstract away ITenant collection logic
 * @internal
 */
export interface ITenantRepository {
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
	find(query: any, sort: any, limit?: number, skip?: number): Promise<ITenantDocument[]>;

	/**
	 * Finds one query in the database
	 *
	 * @param query - data we want to find
	 * @param options - optional. If set, provide customized options to the implementations
	 * @returns The value of the query in the database.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	findOne(query: any, options?: any): Promise<ITenantDocument | null>;

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
	 * Inserts an entry into the database.
	 * Throws if it would overwrite an existing entry
	 *
	 * @param value - data to insert to the database
	 */
	insertOne(value: ITenantDocument): Promise<any>;

	deleteOne(filter: any): Promise<any>;
}

/**
 * @internal
 */
export class MongoTenantRepository implements ITenantRepository {
	constructor(private readonly collection: ICollection<ITenantDocument>) {}
	async find(query: any, sort: any, limit?: number, skip?: number): Promise<ITenantDocument[]> {
		return this.collection.find(query, sort, limit, skip);
	}
	async findOne(query: any, options?: any): Promise<ITenantDocument | null> {
		return this.collection.findOne(query, options);
	}
	async update(filter: any, set: any, addToSet: any, options?: any): Promise<void> {
		return this.collection.update(filter, set, addToSet, options);
	}
	async insertOne(value: ITenantDocument): Promise<any> {
		return this.collection.insertOne(value);
	}
	async deleteOne(filter: any): Promise<any> {
		return this.collection.deleteOne(filter);
	}
}
