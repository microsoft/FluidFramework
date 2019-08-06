/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@prague/container-definitions";
import { ICommit, ICommitDetails } from "@prague/gitresources";
import { IGitCache } from "@prague/services-client";
import { ITenantManager } from "@prague/services-core";

export interface IAlfred {
    createFork(tenantId: string, id: string): Promise<string>;

    getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string | IFluidCodeDetails }>;

    getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]>;

    getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit>;

    getLatestVersion(tenantId: string, documentId: string): Promise<ICommit>;

    getTenantManager(): ITenantManager;
}

export interface IKeyValue {
    key: string;

    value: string;
}
