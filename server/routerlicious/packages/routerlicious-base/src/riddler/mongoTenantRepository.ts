/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection } from "@fluidframework/server-services-core";
import { ITenantDocument } from "./tenantManager";

/**
 * Abstract away ITenant collection logic
 */
export interface ITenantRepository {
	/**
	 * Finds one query in the database
	 *
	 * @param query - data we want to find
	 * @param options - optional. If set, provide customized options to the implementations
	 * @returns The value of the query in the database.
	 */
	findOne(query: any, options?: any): Promise<ITenantDocument>;

	/**
	 * @returns All values in the database.
	 */
	findAll(): Promise<ITenantDocument[]>;

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

export class MongoTenantRepository implements ITenantRepository {
	constructor(private readonly collection: ICollection<ITenantDocument>) {}
	async findOne(query: any, options?: any): Promise<ITenantDocument> {
		return this.collection.findOne(query, options);
	}
	async findAll(): Promise<ITenantDocument[]> {
		return this.collection.findAll();
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
