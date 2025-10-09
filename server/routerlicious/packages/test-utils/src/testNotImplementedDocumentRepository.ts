/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDocument, IDocumentRepository } from "@fluidframework/server-services-core";

const getDefaultErrorMsg = (methodName: string) =>
	`TestNotImplementedDocumentRepository.${methodName}: Method not implemented. Provide your own mock.`;
/**
 * @internal
 */
export class TestNotImplementedDocumentRepository implements IDocumentRepository {
	async create(document: IDocument): Promise<any> {
		throw new Error(getDefaultErrorMsg("create"));
	}

	async readOne(filter: any): Promise<IDocument> {
		throw new Error(getDefaultErrorMsg("readOne"));
	}

	async updateOne(filter: any, update: any, options?: any): Promise<void> {
		throw new Error(getDefaultErrorMsg("updateOne"));
	}

	async deleteOne(filter: any): Promise<any> {
		throw new Error(getDefaultErrorMsg("deleteOne"));
	}

	async findOneOrCreate(
		filter: any,
		value: any,
		options: any,
	): Promise<{ value: IDocument; existing: boolean }> {
		throw new Error(getDefaultErrorMsg("findOneOrCreate"));
	}

	async findOneAndUpdate(
		filter: any,
		value: any,
		options: any,
	): Promise<{ value: IDocument; existing: boolean }> {
		throw new Error(getDefaultErrorMsg("findOneAndUpdate"));
	}

	async exists(filter: any): Promise<boolean> {
		throw new Error(getDefaultErrorMsg("exists"));
	}
}
