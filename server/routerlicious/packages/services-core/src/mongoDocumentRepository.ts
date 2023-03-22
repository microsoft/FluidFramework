/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDb, IDocumentRepository } from "./database";
import { IDocument } from "./document";

export class MongoDocumentRepository implements IDocumentRepository {
	constructor(private readonly collection: ICollection<IDocument>) {}

	public static create(database: IDb, collectionName: string): MongoDocumentRepository {
		return new MongoDocumentRepository(database.collection<IDocument>(collectionName));
	}

	async readOne(filter: any): Promise<IDocument> {
		return this.collection.findOne(filter);
	}

	async updateOne(filter: any, update: any, option: any): Promise<void> {
		const addToSet = undefined; // AddToSet is not used anywhere. Change the behavior in the future if things changed.
		await (option?.upsert
			? this.collection.upsert(filter, update, addToSet, option)
			: this.collection.update(filter, update, addToSet, option));
	}

	async findOneOrCreate(
		filter: any,
		value: any,
		option: any = undefined,
	): Promise<{ value: IDocument; existing: boolean }> {
		return this.collection.findOrCreate(filter, value, option);
	}

	async findOneAndUpdate(
		filter: any,
		value: any,
		option: any = undefined,
	): Promise<{ value: IDocument; existing: boolean }> {
		return this.collection.findAndUpdate(filter, value, option);
	}

	async create(document: IDocument): Promise<any> {
		return this.collection.insertOne(document);
	}
	
	async exists(filter: any): Promise<boolean> {
		return this.collection.findOne(filter, { projection: { _id: 1 } }).then((doc) => !!doc);
	}
}
