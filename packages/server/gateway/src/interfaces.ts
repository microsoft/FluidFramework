/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails } from "@prague/gitresources";
import { IGitCache } from "@prague/services-client";

export interface IAlfred {
    createFork(tenantId: string, id: string): Promise<string>;

    getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }>;

    getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]>;

    getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit>;

    getLatestVersion(tenantId: string, documentId: string): Promise<ICommit>;
}

export interface IKeyValue {
    key: string;

    value: string;
}
