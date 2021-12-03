/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDataStoreAliasMessage {
    readonly id: string;
    readonly alias: string;
}

export interface IDataStoreAliasMapping {
    readonly suppliedInternalId: string;
    readonly alias: string;
    readonly aliasedInternalId: string;
}
