/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, ITenantRepository } from "./database";
import { ITenantDocument } from "./tenant";

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
