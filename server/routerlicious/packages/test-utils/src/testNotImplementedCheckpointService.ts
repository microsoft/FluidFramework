/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICheckpointService,
	IDeliState,
	IDocument,
	IScribe,
} from "@fluidframework/server-services-core";

const defaultErrorMsg = "Method not implemented. Provide your own mock.";

export class TestNotImplementedCheckpointService implements ICheckpointService {
	localCheckpointEnabled: boolean = false;

	async writeCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		checkpoint: IScribe | IDeliState,
		isLocal: boolean,
	): Promise<void> {
		throw new Error(defaultErrorMsg);
	}

	async clearCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		isLocal: boolean,
	): Promise<void> {
		throw new Error(defaultErrorMsg);
	}

	async restoreFromCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		document: IDocument,
	): Promise<IScribe | IDeliState> {
		throw new Error(defaultErrorMsg);
	}

	async getLatestCheckpoint(
		tenantId: string,
		documentId: string,
		activeClients?: boolean,
	): Promise<any> {
		throw new Error(defaultErrorMsg);
	}
}
