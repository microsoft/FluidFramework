/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { buildHierarchy, gitHashFile } from "@microsoft/fluid-core-utils";
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
        const newCacheP = this.formCacheFromSummary(commit, parentMap);
        await newCacheP;
        const handle = await this.writeSummaryObject(commit, [], "");
        this.cache.set(handle, newCacheP);
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
        for (const [key, value] of Object.entries(snapshotTree.blobs)) {
            map.set(this.formCachePath(path, key), value);
        }
        for (const [key, value] of Object.entries(snapshotTree.trees)) {
            this.formCacheFromSnapshotCore(value, map, this.formCachePath(path, key));
        }
        for (const [key, value] of Object.entries(snapshotTree.commits)) {
            map.set(this.formCachePath(path, key), value);
        }
    }

    /**
     * Forms a map of path to hashes for nodes in a summary tree being uploaded.
     * It has a side-effect of hydrating the passed in summary tree's handles.
     * @param summaryTree - summary tree to hydrate and form cache for
     * @param parentMap - cache of parent summary
     */
    private async formCacheFromSummary(
        summaryTree: ISummaryTree,
        parentMap: Map<string, string> | undefined,
    ): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        this.formCacheFromSummaryCore(summaryTree, map, "", parentMap);
        return map;
    }

    private formCacheFromSummaryCore(
        summaryTree: ISummaryTree,
        map: Map<string, string>,
        path: string,
        parentMap: Map<string, string> | undefined,
    ) {
        for (const [key, value] of Object.entries(summaryTree.tree)) {
            switch (value.type) {
                case SummaryType.Blob: {
                    const buffer = typeof value.content === "string"
                        ? Buffer.from(value.content, "utf-8")
                        : value.content;
                    const hash = gitHashFile(buffer);
                    map.set(this.formCachePath(path, key), hash);
                    break;
                }
                case SummaryType.Handle: {
                    const childPath = this.formCachePath(path, key);
                    const parentHash = parentMap ? parentMap.get(childPath) : undefined;
                    if (!parentHash) {
                        // parentMap must be provided if handle is passed
                        throw Error("Parent summary should be cached if handle is provided.");
                    }

                    // also responsible for hydrating the current passed summary tree
                    value.handle = parentHash;

                    map.set(childPath, parentHash);
                    break;
                }
                case SummaryType.Tree: {
                    this.formCacheFromSummaryCore(value, map, this.formCachePath(path, key), parentMap);
                    break;
                }
                default: {
                    throw Error("Unexpected summary type");
                }
            }
        }
        // TODO: compute hashes for directory (tree)
        // this probably will be at end, because it will depend on hashes of child nodes
        // map.set(path, gitHashDirectory(...));
    }

    private formCachePath(part1: string, part2: string) {
        // TODO: may need to encode?
        return `${part1}/${part2}`;
    }
}
