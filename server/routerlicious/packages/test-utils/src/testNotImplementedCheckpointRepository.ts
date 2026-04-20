/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICheckpoint,
	ICheckpointRepository,
	IDeliState,
	IScribe,
} from "@fluidframework/server-services-core";

const getDefaultErrorMsg = (methodName: string) =>
	`TestNotImplementedCheckpointRepository.${methodName}: Method not implemented. Provide your own mock.`;

/**
 * @internal
 */
export class TestNotImplementedCheckpointRepository implements ICheckpointRepository {
	async writeCheckpoint(
		tenantId: string,
		documentId: string,
		checkpoint: IDeliState | IScribe,
	): Promise<void> {
		throw new Error(getDefaultErrorMsg("writeCheckpoint"));
	}
	async deleteCheckpoint(documentId: string, tenantId: string): Promise<void> {
		throw new Error(getDefaultErrorMsg("deleteCheckpoint"));
	}
	async getCheckpoint(filter: any): Promise<ICheckpoint> {
		throw new Error(getDefaultErrorMsg("getCheckpoint"));
	}

	async removeServiceCheckpoint(documentId: string, tenantId: string): Promise<void> {
		throw new Error(getDefaultErrorMsg("removeServiceCheckpoint"));
	}
}
