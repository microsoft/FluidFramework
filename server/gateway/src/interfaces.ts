/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { ICommit, ICommitDetails } from "@microsoft/fluid-gitresources";
import { IGitCache } from "@microsoft/fluid-server-services-client";
import { ITenantManager } from "@microsoft/fluid-server-services-core";

export interface IAlfred {
    createFork(tenantId: string, id: string): Promise<string>;

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
