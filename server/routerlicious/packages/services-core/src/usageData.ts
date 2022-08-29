/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
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

export const signalUsageStorageId: string = "signalUsage";

export const clientConnectivityStorageId: string = "clientConnectivityUsage";
