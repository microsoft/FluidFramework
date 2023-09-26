/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocument, IDocumentRepository } from "@fluidframework/server-services-core";

const defaultErrorMsg = "Method not implemented. Provide your own mock.";
export class TestNotImplementedDocumentRepository implements IDocumentRepository {
	async create(document: IDocument): Promise<any> {
		throw new Error(defaultErrorMsg);
	}

	async readOne(filter: any): Promise<IDocument> {
		throw new Error(defaultErrorMsg);
	}

	async updateOne(filter: any, update: any, options?: any): Promise<void> {
		throw new Error(defaultErrorMsg);
	}

	async deleteOne(filter: any): Promise<any> {
		throw new Error(defaultErrorMsg);
	}

	async findOneOrCreate(
		filter: any,
		value: any,
		options: any,
	): Promise<{ value: IDocument; existing: boolean }> {
		throw new Error(defaultErrorMsg);
	}

	async findOneAndUpdate(
		filter: any,
		value: any,
		options: any,
	): Promise<{ value: IDocument; existing: boolean }> {
		throw new Error(defaultErrorMsg);
	}

	async exists(filter: any): Promise<boolean> {
		throw new Error(defaultErrorMsg);
	}
}
