/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICheckpoint,
	ICheckpointRepository,
	IDeliState,
	IScribe,
} from "@fluidframework/server-services-core";

const defaultErrorMsg = "Method not implemented. Provide your own mock.";

export class TestNotImplementedCheckpointRepository implements ICheckpointRepository {
	async writeCheckpoint(
		tenantId: string,
		documentId: string,
		checkpoint: IDeliState | IScribe,
	): Promise<void> {
		throw new Error(defaultErrorMsg);
	}
	async deleteCheckpoint(documentId: string, tenantId: string): Promise<void> {
		throw new Error(defaultErrorMsg);
	}
	async getCheckpoint(filter: any): Promise<ICheckpoint> {
		throw new Error(defaultErrorMsg);
	}

	async removeServiceCheckpoint(documentId: string, tenantId: string): Promise<void> {
		throw new Error(defaultErrorMsg);
	}
}
