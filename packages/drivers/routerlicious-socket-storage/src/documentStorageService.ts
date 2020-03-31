/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { gitHashFile } from "@microsoft/fluid-common-utils";
import { IDocumentStorageService, ISummaryContext } from "@microsoft/fluid-driver-definitions";
import * as resources from "@microsoft/fluid-gitresources";
import { buildHierarchy } from "@microsoft/fluid-protocol-base";
import {
    FileMode,
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
    SummaryObject,
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import * as gitStorage from "@microsoft/fluid-server-services-client";

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class DocumentStorageService implements IDocumentStorageService {
    // The values of this cache is useless. We only need the keys. So we are always putting
    // empty strings as values.
    private readonly blobsShaCache = new Map<string, string>();
    public get repositoryUrl(): string {
        return "";
    }

    constructor(public readonly id: string, public manager: gitStorage.GitManager) {
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        let requestVersion = version;
        if (!requestVersion) {
            const versions = await this.getVersions(this.id, 1);
            if (versions.length === 0) {
                return null;
            }

            requestVersion = versions[0];
        }

        const tree = await this.manager.getTree(requestVersion.treeId);
        return buildHierarchy(tree, this.blobsShaCache);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const commits = await this.manager.getCommits(versionId ? versionId : this.id, count);
        return commits.map((commit) => ({
            date: commit.commit.author.date,
            id: commit.sha,
            treeId: commit.commit.tree.sha,
        }));
    }

    public async read(blobId: string): Promise<string> {
        const value = await this.manager.getBlob(blobId);
        this.blobsShaCache.set(value.sha, "");
        return value.content;
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        const value = await this.manager.getContent(version.id, path);
        return value.content;
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        const branch = ref ? `components/${this.id}/${ref}` : this.id;
        const commit = await this.manager.write(branch, tree, parents, message);
        return { date: commit.committer.date, id: commit.sha, treeId: commit.tree.sha };
    }

    // back-compat: 0.14 uploadSummary
    public async uploadSummary(commit: ISummaryTree): Promise<ISummaryHandle> {
        const handle = await this.writeSummaryObject(commit, [], "");
        return {
            handle,
            handleType: SummaryType.Tree,
            type: SummaryType.Handle,
        };
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const snapshot = context.ackHandle
            ? await this.getVersions(context.ackHandle, 1).then(async (versions) => this.getSnapshotTree(versions[0]))
            : undefined;
        return this.writeSummaryTree(summary, snapshot ?? undefined);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        throw new Error("NOT IMPLEMENTED!");
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        const response = this.manager.createBlob(file.toString("base64"), "base64");
        return response.then((r) => ({ id: r.sha, url: r.url }));
    }

    public getRawUrl(blobId: string): string {
        return this.manager.getRawUrl(blobId);
    }

    // back-compat: 0.14 uploadSummary
    private async writeSummaryObject(
        value: SummaryObject,
        submodule: { path: string; sha: string }[],
        path: string,
    ): Promise<string> {
        switch (value.type) {
            case SummaryType.Blob:
                return this.writeSummaryBlob(value.content);
            case SummaryType.Commit:
                const commitTreeHandle = await this.writeSummaryObject(
                    value.tree,
                    submodule,
                    path);
                const newCommit = await this.manager.createCommit({
                    author: value.author,
                    message: value.message,
                    parents: value.parents,
                    tree: commitTreeHandle,
                });

                submodule.push({ path, sha: newCommit.sha });

                return newCommit.sha;

            case SummaryType.Handle:
                return value.handle;

            case SummaryType.Tree:
                const fullTree = value.tree;
                const entries = await Promise.all(Object.keys(fullTree).map(async (key) => {
                    const entry = fullTree[key];
                    const pathHandle = await this.writeSummaryObject(
                        entry,
                        submodule,
                        `${path}/${encodeURIComponent(key)}`);
                    const treeEntry: resources.ICreateTreeEntry = {
                        mode: this.getGitMode(entry),
                        path: encodeURIComponent(key),
                        sha: pathHandle,
                        type: this.getGitType(entry),
                    };
                    return treeEntry;
                }));

                const treeHandle = await this.manager.createGitTree({ tree: entries });
                return treeHandle.sha;

            default:
                return Promise.reject();
        }
    }

    private async writeSummaryTree(
        summaryTree: ISummaryTree,
        snapshot: ISnapshotTree | undefined,
    ): Promise<string> {
        const entries = await Promise.all(Object.keys(summaryTree.tree).map(async (key) => {
            const entry = summaryTree.tree[key];
            const pathHandle = await this.writeSummaryTreeObject(key, entry, snapshot);
            const treeEntry: resources.ICreateTreeEntry = {
                mode: this.getGitMode(entry),
                path: encodeURIComponent(key),
                sha: pathHandle,
                type: this.getGitType(entry),
            };
            return treeEntry;
        }));

        const treeHandle = await this.manager.createGitTree({ tree: entries });
        return treeHandle.sha;
    }

    private async writeSummaryTreeObject(
        key: string,
        object: SummaryObject,
        snapshot: ISnapshotTree | undefined,
        currentPath = "",
    ): Promise<string> {
        switch (object.type) {
            case SummaryType.Blob: {
                return this.writeSummaryBlob(object.content);
            }
            case SummaryType.Handle: {
                if (snapshot === undefined) {
                    throw Error("Parent summary does not exist to reference by handle.");
                }
                return this.getIdFromPath(object.handleType, object.handle, snapshot);
            }
            case SummaryType.Tree: {
                return this.writeSummaryTree(object, snapshot?.trees[key]);
            }

            default:
                throw Error(`Unexpected summary object type: "${object.type}".`);
        }
    }

    private getIdFromPath(
        handleType: SummaryType,
        handlePath: string,
        fullSnapshot: ISnapshotTree,
    ): string {
        const path = handlePath.split("/").map((part) => decodeURIComponent(part));
        if (path[0] === "") {
            // root of tree should be unnamed
            path.shift();
        }

        return this.getIdFromPathCore(handleType, path, fullSnapshot);
    }

    private getIdFromPathCore(
        handleType: SummaryType,
        path: string[],
        snapshot: ISnapshotTree,
    ): string {
        const key = path[0];
        if (path.length === 1) {
            switch (handleType) {
                case SummaryType.Blob: {
                    const tryId = snapshot.blobs[key];
                    if (!tryId) {
                        throw Error("Parent summary does not have blob handle for specified path.");
                    }
                    return tryId;
                }
                case SummaryType.Tree: {
                    const tryId = snapshot.trees[key]?.id;
                    if (!tryId) {
                        throw Error("Parent summary does not have tree handle for specified path.");
                    }
                    return tryId;
                }
                default:
                    throw Error(`Unexpected handle summary object type: "${handleType}".`);
            }
        }
        return this.getIdFromPathCore(handleType, path.slice(1), snapshot);
    }

    private async writeSummaryBlob(content: string | Buffer): Promise<string> {
        const { parsedContent, encoding } = typeof content === "string"
            ? { parsedContent: content, encoding: "utf-8" }
            : { parsedContent: content.toString("base64"), encoding: "base64" };

        // The gitHashFile would return the same hash as returned by the server as blob.sha
        const hash = gitHashFile(Buffer.from(parsedContent, encoding));
        if (!this.blobsShaCache.has(hash)) {
            const blob = await this.manager.createBlob(parsedContent, encoding);
            assert.strictEqual(hash, blob.sha, "Blob.sha and hash do not match!!");
            this.blobsShaCache.set(blob.sha, "");
        }
        return hash;
    }

    private getGitMode(value: SummaryObject): string {
        const type = value.type === SummaryType.Handle ? value.handleType : value.type;
        switch (type) {
            case SummaryType.Blob:
                return FileMode.File;
            case SummaryType.Commit:
                return FileMode.Commit;
            case SummaryType.Tree:
                return FileMode.Directory;
            default:
                throw new Error();
        }
    }

    private getGitType(value: SummaryObject): string {
        const type = value.type === SummaryType.Handle ? value.handleType : value.type;

        switch (type) {
            case SummaryType.Blob:
                return "blob";
            case SummaryType.Commit:
                return "commit";
            case SummaryType.Tree:
                return "tree";
            default:
                throw new Error();
        }
    }
}
