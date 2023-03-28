/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICheckpoint, ICheckpointRepository } from "@fluidframework/server-services-core";

const defaultErrorMsg = "Method not implemented. Provide your own mock.";
export class TestNotImplementedCheckpointRepository implements ICheckpointRepository {
	async create(document: ICheckpoint): Promise<any> {
		throw new Error(defaultErrorMsg);
	}

	async readOne(filter: any): Promise<ICheckpoint> {
		throw new Error(defaultErrorMsg);
	}

	async updateOne(filter: any, update: any, options?: any): Promise<void> {
		throw new Error(defaultErrorMsg);
	}

	async deleteOne(filter: any): Promise<void> {
		throw new Error(defaultErrorMsg);
	}

	async findOneOrCreate(
		filter: any,
		value: any,
		options: any,
	): Promise<{ value: ICheckpoint; existing: boolean }> {
		throw new Error(defaultErrorMsg);
	}

	async findOneAndUpdate(
		filter: any,
		value: any,
		options: any,
	): Promise<{ value: ICheckpoint; existing: boolean }> {
		throw new Error(defaultErrorMsg);
	}

	async exists(filter: any): Promise<boolean> {
		throw new Error(defaultErrorMsg);
	}
}
