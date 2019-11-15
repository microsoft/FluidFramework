/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { buildHierarchy } from "@microsoft/fluid-core-utils";
import {
    ICreateBlobResponse,
    IDocumentStorageService,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { DocumentStorageService } from "@microsoft/fluid-routerlicious-driver";

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class OuterDocumentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return "";
    }

    constructor(private readonly storageService: DocumentStorageService) {
    }

    public getOuterDocumentStorageServiceProxy(): IDocumentStorageService {

        const getVersions = async (versionId: string, count: number) => {
            console.log("getVersions");
            const commits = await this.storageService.manager.getCommits(versionId ?
                versionId : this.storageService.id, count);
            return commits.map((commit) => ({ id: commit.sha, treeId: commit.commit.tree.sha }));

        };

        const getSnapshotTree = async (version?: IVersion) => {
            console.log("getSnapshotTree");
            let requestVersion = version;
            if (!requestVersion) {
                const versions = await getVersions(this.storageService.id, 1);
                if (versions === undefined || versions.length === 0) {
                    return null;
                }

                requestVersion = versions[0];
            }

            const tree = await this.storageService.manager.getTree(requestVersion.treeId);
            return buildHierarchy(tree);
        };

        const read = async (blobId: string) => {
            const value = await this.storageService.manager.getBlob(blobId);
            return value.content;
        };

        const getContent = async (version: IVersion, path: string) => {
            const value = await this.storageService.manager.getContent(version.id, path);
            return value.content;
        };

        const uploadSummary = async (commit: ISummaryTree) => {
            return this.storageService.uploadSummary(commit);
        };

        const write = async (tree: ITree, parents: string[], message: string, ref: string) => {
            const branch = ref ? `components/${this.storageService.id}/${ref}` : this.storageService.id;
            const commit = this.storageService.manager.write(branch, tree, parents, message);
            return commit.then((c) => ({ id: c.sha, treeId: c.tree.sha }));
        };

        const downloadSummary = async (handle: ISummaryHandle) => {
            return this.storageService.downloadSummary(handle);
        };

        const createBlob = async (file: Buffer) => {
            return this.storageService.createBlob(file);
        };

        const getRawUrl = (blobId: string) => {
            return this.storageService.getRawUrl(blobId);
        };

        const documentStorageProxy = {
            repositoryUrl: "Not Implemented",
            getSnapshotTree,
            getVersions,
            read,
            getContent,
            write,
            uploadSummary,
            downloadSummary,
            createBlob,
            getRawUrl,
        };

        return documentStorageProxy;
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return Promise.reject(new Error("OuterDocumentStorageService: getSnapshotTree not implemented on outer frame"));
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        // return this.documentStorageService.getVersions(versionId, count);
        return Promise.reject(new Error("OuterDocumentStorageService: getVersions not implemented on outer frame"));
    }

    public async read(blobId: string): Promise<string> {
        return Promise.reject(new Error("OuterDocumentStorageService: read not implemented on outer frame"));
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        return Promise.reject(new Error("OuterDocumentStorageService: getContent not implemented on outer frame"));
    }

    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return Promise.reject(new Error("OuterDocumentStorageService: write not implemented on outer frame"));
    }

    public async uploadSummary(commit: ISummaryTree): Promise<string> {
        return Promise.reject(new Error("OuterDocumentStorageService: uploadSummary not implemented on outer frame"));
    }

    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return Promise.reject("NOT IMPLEMENTED!");
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return Promise.reject(new Error("OuterDocumentStorageService: createBlob not implemented on outer frame"));
    }

    public getRawUrl(blobId: string): string {
        throw new Error("OuterDocumentStorageService: getRawUrl not implemented on outer frame");
    }
}
