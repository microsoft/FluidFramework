/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IUsageEmitter {
    emit(usageData: UsageData): void;
    getUsageCounts(): void;
 } 
 
 export enum MeterType {
     OpsIn,
     OpsOut,
     ClientConnectivityMinutes,
     StorageSpaceUsedInGB
 }

 export interface UsageData {
     type: MeterType,
     value: number,
     tenantId: string,
     documentId: string
 }