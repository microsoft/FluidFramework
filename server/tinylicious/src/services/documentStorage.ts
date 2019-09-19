/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGitCache } from "@microsoft/fluid-server-services-client";
import { IDocumentDetails, IDocumentStorage } from "@microsoft/fluid-server-services-core";
import { ICommit, ICommitDetails } from "@microsoft/fluid-gitresources";

export class DocumentStorage implements IDocumentStorage {
    public getDocument(tenantId: string, documentId: string): Promise<any> {
        throw new Error("Method not implemented.");
    }

    public getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        throw new Error("Method not implemented.");
    }

    public getLatestVersion(tenantId: string, documentId: string): Promise<ICommit> {
        throw new Error("Method not implemented.");
    }

    public getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]> {
        throw new Error("Method not implemented.");
    }

    public getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
        throw new Error("Method not implemented.");
    }

    public getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache; code: string; }> {
        throw new Error("Method not implemented.");
    }

    public getForks(tenantId: string, documentId: string): Promise<string[]> {
        throw new Error("Method not implemented.");
    }

    public createFork(tenantId: string, id: string): Promise<string> {
        throw new Error("Method not implemented.");
    }
}
