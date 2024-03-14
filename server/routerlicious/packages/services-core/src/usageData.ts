/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @internal
 */
export interface IUsageData {
	value: number;
	tenantId: string;
	documentId: string;
	clientId?: string;
	startTime?: number;
	endTime?: number;
	opType?: string;
}

/**
 * @internal
 */
export const signalUsageStorageId: string = "signalUsage";

/**
 * @internal
 */
export const clientConnectivityStorageId: string = "clientConnectivityUsage";
