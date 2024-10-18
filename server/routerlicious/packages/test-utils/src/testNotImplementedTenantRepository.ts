/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITenantRepository } from "./mongoTenantRepository";
import type { ITenantDocument } from "./tenantManager";

const getDefaultErrorMsg = (methodName: string) =>
	`TestNotImplementedTenantRepository.${methodName}: Method not implemented. Provide your own mock.`;
/**
 * @internal
 */
export class TestNotImplementedTenantRepository implements ITenantRepository {
	async find(query: any, sort: any, limit?: number, skip?: number): Promise<ITenantDocument[]> {
		throw new Error(getDefaultErrorMsg("find"));
	}
	async findOne(query: any, options?: any): Promise<ITenantDocument> {
		throw new Error(getDefaultErrorMsg("findOne"));
	}
	async update(filter: any, set: any, addToSet: any, options?: any): Promise<void> {
		throw new Error(getDefaultErrorMsg("update"));
	}
	async insertOne(value: ITenantDocument): Promise<any> {
		throw new Error(getDefaultErrorMsg("insertOne"));
	}
	async deleteOne(filter: any): Promise<any> {
		throw new Error(getDefaultErrorMsg("deleteOne"));
	}
}
