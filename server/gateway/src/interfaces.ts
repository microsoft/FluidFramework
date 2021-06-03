/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { ICommit, ICommitDetails } from "@fluidframework/gitresources";
import { IGitCache } from "@fluidframework/server-services-client";
import { ITenantManager } from "@fluidframework/server-services-core";

export interface IAlfred {
    getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache; code: IFluidCodeDetails | null }>;

    getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]>;

    getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit>;

    getLatestVersion(tenantId: string, documentId: string): Promise<ICommit | null>;

    getTenantManager(): ITenantManager;
}

export interface IKeyValue {
    key: string;

    value: string;
}

export interface IKeyValueWrapper {
    get(key: string): Promise<any>;
}
