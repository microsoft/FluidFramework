/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDocumentRepository } from "./database";
import { IDocument } from "./document";

/**
 * @internal
 */
export class MongoDocumentRepository implements IDocumentRepository {
	constructor(private readonly collection: ICollection<IDocument>) {}

	// eslint-disable-next-line @rushstack/no-new-null
	async readOne(filter: any): Promise<IDocument | null> {
		return this.collection.findOne(filter);
	}

	async updateOne(filter: any, update: any, options: any): Promise<void> {
		const addToSet = undefined; // AddToSet is not used anywhere. Change the behavior in the future if things changed.
		await (options?.upsert
			? this.collection.upsert(filter, update, addToSet, options)
			: this.collection.update(filter, update, addToSet, options));
	}

	async deleteOne(filter: any): Promise<any> {
		return this.collection.deleteOne(filter);
	}

	async findOneOrCreate(
		filter: any,
		value: any,
		options: any = undefined,
	): Promise<{ value: IDocument; existing: boolean }> {
		return this.collection.findOrCreate(filter, value, options);
	}

	async findOneAndUpdate(
		filter: any,
		value: any,
		options: any = undefined,
	): Promise<{ value: IDocument; existing: boolean }> {
		return this.collection.findAndUpdate(filter, value, options);
	}

	async create(document: IDocument): Promise<any> {
		return this.collection.insertOne(document);
	}

	async exists(filter: any): Promise<boolean> {
		return this.collection.findOne(filter, { projection: { _id: 1 } }).then((doc) => !!doc);
	}
}
