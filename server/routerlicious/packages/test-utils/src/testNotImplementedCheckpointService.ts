/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ICheckpointService,
	IDeliState,
	IDocument,
	IScribe,
} from "@fluidframework/server-services-core";

const getDefaultErrorMsg = (methodName: string) =>
	`TestNotImplementedCheckpointService.${methodName}: Method not implemented. Provide your own mock.`;

/**
 * @internal
 */
export class TestNotImplementedCheckpointService implements ICheckpointService {
	getGlobalCheckpointFailed(): boolean {
		throw new Error(getDefaultErrorMsg("getGlobalCheckpointFailed"));
	}
	getLocalCheckpointEnabled(): boolean {
		throw new Error(getDefaultErrorMsg("getLocalCheckpointEnabled"));
	}
	async writeCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		checkpoint: IScribe | IDeliState,
		isLocal: boolean,
	): Promise<void> {
		throw new Error(getDefaultErrorMsg("writeCheckpoint"));
	}

	async clearCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		isLocal: boolean,
	): Promise<void> {
		throw new Error(getDefaultErrorMsg("clearCheckpoint"));
	}

	async restoreFromCheckpoint(
		documentId: string,
		tenantId: string,
		service: string,
		document: IDocument,
	): Promise<IScribe | IDeliState> {
		throw new Error(getDefaultErrorMsg("restoreFromCheckpoint"));
	}

	async getLatestCheckpoint(
		tenantId: string,
		documentId: string,
		activeClients?: boolean,
	): Promise<any> {
		throw new Error(getDefaultErrorMsg("getLatestCheckpoint"));
	}
}
