/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, ICheckpointRepository } from "./database";
import { ICheckpoint } from "./document";

export class MongoCheckpointRepository implements ICheckpointRepository {
	constructor(private readonly collection: ICollection<ICheckpoint>) {}

	async readOne(filter: any): Promise<ICheckpoint> {
		return this.collection.findOne(filter);
	}

	async deleteOne(filter: any): Promise<any> {
		return this.collection.deleteOne(filter);
	}

	async updateOne(filter: any, update: any, options: any): Promise<void> {
		const addToSet = undefined; // AddToSet is not used anywhere. Change the behavior in the future if things changed.
		await (options?.upsert
			? this.collection.upsert(filter, update, addToSet, options)
			: this.collection.update(filter, update, addToSet, options));
	}

	async findOneOrCreate(
		filter: any,
		value: any,
		options: any = undefined,
	): Promise<{ value: ICheckpoint; existing: boolean }> {
		return this.collection.findOrCreate(filter, value, options);
	}

	async findOneAndUpdate(
		filter: any,
		value: any,
		options: any = undefined,
	): Promise<{ value: ICheckpoint; existing: boolean }> {
		return this.collection.findAndUpdate(filter, value, options);
	}

	async create(checkpoint: ICheckpoint): Promise<any> {
		return this.collection.insertOne(checkpoint);
	}

	async exists(filter: any): Promise<boolean> {
		return this.collection
			.findOne(filter, { projection: { _id: 1 } })
			.then((checkpoint) => !!checkpoint);
	}
}
