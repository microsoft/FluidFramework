/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { buildHierarchy } from "@microsoft/fluid-core-utils";
import * as resources from "@microsoft/fluid-gitresources";
import {
    FileMode,
    ICreateBlobResponse,
    IDocumentStorageService,
    ISnapshotTree,
    ISummaryContext,
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
export class DocumentStorageService implements IDocumentStorageService  {

    // map of summary handles to maps of paths to hashes
    private readonly cache = new Map<string, Promise<Map<string, string>>>();

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
        const snapshotTree = buildHierarchy(tree);
        this.cache.set(requestVersion.id, this.formCacheFromSnapshot(snapshotTree));
        return snapshotTree;
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
        return value.content;
    }

    public async getContent(version: IVersion, path: string): Promise<string> {
        const value = await this.manager.getContent(version.id, path);
        return value.content;
    }

    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        const branch = ref ? `components/${this.id}/${ref}` : this.id;
        const commit = this.manager.write(branch, tree, parents, message);
        return commit.then((c) => ({date: c.committer.date, id: c.sha, treeId: c.tree.sha}));
    }

    public async uploadSummary(commit: ISummaryTree, context: ISummaryContext): Promise<ISummaryHandle> {
        const cacheKey = context.proposedParentHandle || context.ackedParentHandle;
        const parentMap = cacheKey ? (await this.cache.get(cacheKey)) : undefined;
        const newCache = new Map<string, string>();
        const handle = await this.writeSummaryObject(commit, parentMap, newCache, [], "");
        this.cache.set(handle, Promise.resolve(newCache));
        return {
            handle,
            handleType: SummaryType.Tree,
            type: SummaryType.Handle,
        };
    }

    public downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return Promise.reject("NOT IMPLEMENTED!");
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        const response = this.manager.createBlob(file.toString("base64"), "base64");
        return response.then((r) => ({id: r.sha, url: r.url}));
    }

    public getRawUrl(blobId: string): string {
        return this.manager.getRawUrl(blobId);
    }

    private async writeSummaryObject(
        value: SummaryObject,
        parentCache: Map<string, string> | undefined,
        newCache: Map<string, string>,
        submodule: { path: string; sha: string }[],
        path: string,
    ): Promise<string> {
        switch (value.type) {
            case SummaryType.Blob:
                const content = typeof value.content === "string" ? value.content : value.content.toString("base64");
                const encoding = typeof value.content === "string" ? "utf-8" : "base64";
                const blob = await this.manager.createBlob(content, encoding);
                return blob.sha;

            case SummaryType.Commit:
                const commitTreeHandle = await this.writeSummaryObject(
                    value.tree,
                    parentCache,
                    newCache,
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
                const parentHash = parentCache ? parentCache.get(path) : undefined;
                if (!parentHash) {
                    throw Error("Parent summary should be cached if handle is provided.");
                }
                newCache.set(path, parentHash);
                return value.handle;

            case SummaryType.Tree:
                const fullTree = value.tree;
                const entries = await Promise.all(Object.keys(fullTree).map(async (key) => {
                    const entry = fullTree[key];
                    const pathHandle = await this.writeSummaryObject(
                        entry,
                        parentCache,
                        newCache,
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
                newCache.set(path, treeHandle.sha);
                return treeHandle.sha;

            default:
                return Promise.reject();
        }
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

    private async formCacheFromSnapshot(snapshotTree: ISnapshotTree): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        this.formCacheFromSnapshotCore(snapshotTree, map, "");
        return map;
    }

    private formCacheFromSnapshotCore(snapshotTree: ISnapshotTree, map: Map<string, string>, path: string) {
        map.set(path, snapshotTree.id!); // non-null assert correct?
        for (const [key, value] of Object.entries(snapshotTree.trees)) {
            this.formCacheFromSnapshotCore(value, map, this.formCachePath(path, key));
        }
        for (const [key, value] of Object.entries(snapshotTree.commits)) {
            map.set(this.formCachePath(path, key), value);
        }
    }

    private formCachePath(part1: string, part2: string) {
        return `${part1}/${encodeURIComponent(part2)}`;
    }
}
