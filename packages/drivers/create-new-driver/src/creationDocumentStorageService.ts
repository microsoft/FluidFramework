/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import * as api from "@microsoft/fluid-protocol-definitions";

/**
 * Document storage service for the faux driver.
 */
export class CreationDocumentStorageService implements IDocumentStorageService {
    repositoryUrl: string;

    constructor() {
        this.repositoryUrl = "";
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return null;
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        return [];
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        assert("Flow should never reach here.");
        return "";
    }

    public async read(sha: string): Promise<string> {
        assert("Flow should never reach here.");
        return "";
    }

    public async write(root: api.ITree, parents: string[], message: string, ref: string): Promise<api.IVersion> {
        assert("Flow should never reach here.");
        return {
            id: "",
            treeId: "",
        };
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        assert("Flow should never reach here.");
        const blob: api.ICreateBlobResponse = {
            id: "",
            url: "",
        };
        return blob;
    }

    public getRawUrl(blobId: string): string {
        return "";
    }

    public async uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        assert("Flow should never reach here.");
        const handle: api.ISummaryHandle = {
            handle: "",
            handleType: api.SummaryType.Handle,
            type: api.SummaryType.Handle,
        };
        return handle;
    }

    public async downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        assert("Flow should never reach here.");
        const tree: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {},
        };
        return tree;
    }
}
