/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nodegit from "nodegit";
import type * as resources from "@fluidframework/gitresources";
import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IExternalStorageManager } from "../externalStorageManager";
import * as helpers from "./helpers";
import * as conversions from "./nodegitConversions";
import {
    GitObjectType,
    IExternalWriterConfig,
    IRepositoryManager,
    IFileSystemManagerFactory,
    IStorageDirectoryConfig,
    IFileSystemManager,
} from "./definitions";
import { BaseGitRestTelemetryProperties } from "./gitrestTelemetryDefinitions";
import { RepositoryManagerBase } from "./repositoryManagerBase";
import { RepositoryManagerFactoryBase } from "./repositoryManagerFactoryBase";

export class NodegitRepositoryManager extends RepositoryManagerBase {
    constructor(
        private readonly repoOwner: string,
        private readonly repoName: string,
        private readonly repo: nodegit.Repository,
        directory: string,
        private readonly externalStorageManager: IExternalStorageManager,
        lumberjackBaseProperties: Record<string, any>,
        enableRepositoryManagerMetrics: boolean = false,
    ) {
        super(directory, lumberjackBaseProperties, enableRepositoryManagerMetrics);
    }

    protected async getCommitCore(sha: string): Promise<resources.ICommit> {
        const commit = await this.repo.getCommit(sha);
        return conversions.commitToICommit(commit);
    }

    protected async getCommitsCore(
        sha: string,
        count: number,
        externalWriterConfig?: IExternalWriterConfig,
    ): Promise<resources.ICommitDetails[]> {
        try {
            const walker = nodegit.Revwalk.create(this.repo);

            // eslint-disable-next-line no-bitwise
            walker.sorting(nodegit.Revwalk.SORT.TOPOLOGICAL | nodegit.Revwalk.SORT.TIME);

            // Lookup the commits specified from the given revision
            const revObj = await nodegit.Revparse.single(this.repo, sha);
            walker.push(revObj.id());
            const commits = await walker.getCommits(count);

            const detailedCommits = commits.map(async (rawCommit) => {
                const gitCommit = await conversions.commitToICommit(rawCommit);
                const result: resources.ICommitDetails =
                {
                    commit: {
                        author: gitCommit.author,
                        committer: gitCommit.committer,
                        message: gitCommit.message,
                        tree: gitCommit.tree,
                        url: gitCommit.url,
                    },
                    parents: gitCommit.parents,
                    sha: gitCommit.sha,
                    url: "",

                };
                return result;
            });

            return Promise.all(detailedCommits);
        } catch (err) {
            const lumberjackProperties = {
                ...this.lumberjackBaseProperties,
                [BaseGitRestTelemetryProperties.sha]: sha,
                count,
            };
            Lumberjack.error("getCommits error", lumberjackProperties, err);
            if (externalWriterConfig?.enabled) {
                try {
                    const result = await this.externalStorageManager.read(this.repoName, sha);
                    if (!result) {
                        return Promise.reject(err);
                    }
                    return this.getCommits(sha, count, externalWriterConfig);
                } catch (bridgeError) {
                    // If file does not exist or error trying to look up commit, return the original error.
                    Lumberjack.error("BridgeError", lumberjackProperties, bridgeError);
                    return Promise.reject(err);
                }
            }
            return Promise.reject(err);
        }
    }

    private async getTreeInternal(sha: string): Promise<resources.ITree> {
        const tree = await this.repo.getTree(sha);

        const entries = tree.entries();
        const outputEntries: resources.ITreeEntry[] = [];
        for (const entry of entries) {
            const output = conversions.treeEntryToITreeEntry(entry);
            outputEntries.push(output);
        }

        return {
            sha,
            tree: outputEntries,
            url: "",
        };
    }

    private async getTreeInternalRecursive(sha: string): Promise<resources.ITree> {
        const root = await this.repo.getTree(sha);

        const walker = root.walk(false);
        return new Promise<resources.ITree>((resolve, reject) => {
            walker.on("end", (entries: nodegit.TreeEntry[]) => {
                const tree: resources.ITree = {
                    sha,
                    tree: entries.map((entry) => conversions.treeEntryToITreeEntry(entry)),
                    url: "",
                };
                resolve(tree);
            });

            walker.on("error", (error) => {
                reject(error);
            });

            (walker as any).start();
        });
    }

    protected async getTreeCore(rootSha: string, recursive: boolean): Promise<resources.ITree> {
        if (recursive) {
            return this.getTreeInternalRecursive(rootSha);
        }
        return this.getTreeInternal(rootSha);
    }

    protected async getBlobCore(sha: string): Promise<resources.IBlob> {
        const blob = await this.repo.getBlob(sha);
        return conversions.blobToIBlob(blob, this.repoOwner, this.repoName);
    }

    protected async getContentCore(commit: string, contentPath: string): Promise<resources.IBlob> {
        const revObj = await nodegit.Revparse.single(this.repo, `${commit}:${contentPath}`);

        // TODO switch on the type of object
        const blob = await this.repo.getBlob(revObj.id());
        return conversions.blobToIBlob(blob, this.repoOwner, this.repoName);
    }

    protected async createBlobCore(
        createBlobParams: resources.ICreateBlobParams): Promise<resources.ICreateBlobResponse> {
        if (!helpers.validateBlobContent(createBlobParams.content) ||
            !helpers.validateBlobEncoding(createBlobParams.encoding)) {
            throw new NetworkError(400, "Invalid blob");
        }
        const blobOid = await this.repo.createBlobFromBuffer(
            Buffer.from(createBlobParams.content, createBlobParams.encoding),
        );
        const sha = blobOid.tostrS();

        return {
            sha,
            url: `/repos/${this.repoOwner}/${this.repoName}/git/blobs/${sha}`,
        };
    }

    protected async createTreeCore(params: resources.ICreateTreeParams): Promise<resources.ITree> {
        const builder = await nodegit.Treebuilder.create(this.repo, null);

        // build up the tree
        for (const node of params.tree) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            builder.insert(node.path, nodegit.Oid.fromString(node.sha), parseInt(node.mode, 8));
        }

        const id = await builder.write();
        return this.getTreeInternal(id.tostrS());
    }

    protected async createCommitCore(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
        const date = Date.parse(commit.author.date);
        if (isNaN(date)) {
            throw new NetworkError(400, "Invalid input");
        }

        const signature = nodegit.Signature.create(
            commit.author.name,
            commit.author.email,
            Math.floor(date / 1000), // date represents time in milliseconds. NodeGit expects a timestamp in seconds.
            0);
        const parents = commit.parents && commit.parents.length > 0 ? commit.parents : null;
        const commitOid = await this.repo.createCommit(
            null,
            signature,
            signature,
            commit.message,
            commit.tree,
            parents);

        return {
            author: commit.author,
            committer: commit.author,
            message: commit.message,
            parents: parents ? commit.parents.map((parent) => ({ sha: parent, url: "" })) : [],
            sha: commitOid.tostrS(),
            tree: {
                sha: commit.tree,
                url: "",
            },
            url: "",
        };
    }

    protected async getRefsCore(): Promise<resources.IRef[]> {
        const refIds = await nodegit.Reference.list(this.repo);
        const refsP = await Promise.all(refIds.map(
            async (refId) => nodegit.Reference.lookup(this.repo, refId, undefined),
        ));
        return refsP.map((ref) => conversions.refToIRef(ref));
    }

    protected async getRefCore(refId: string, externalWriterConfig?: IExternalWriterConfig): Promise<resources.IRef> {
        try {
            const ref = await nodegit.Reference.lookup(this.repo, refId, undefined);
            return conversions.refToIRef(ref);
        } catch (err) {
            const lumberjackProperties = {
                ...this.lumberjackBaseProperties,
                [BaseGitRestTelemetryProperties.ref]: refId,
            };
            Lumberjack.error("getRef error", lumberjackProperties, err);
            // Lookup external storage if commit does not exist.
            const fileName = refId.substring(refId.lastIndexOf("/") + 1);
            // If file does not exist or error trying to look up commit, return the original error.
            if (externalWriterConfig?.enabled) {
                try {
                    const result = await this.externalStorageManager.read(this.repoName, fileName);
                    if (!result) {
                        return Promise.reject(err);
                    }
                    return this.getRef(refId, externalWriterConfig);
                } catch (bridgeError) {
                    Lumberjack.error("Giving up on creating ref. BridgeError", lumberjackProperties, bridgeError);
                    return Promise.reject(err);
                }
            }
            return Promise.reject(err);
        }
    }

    protected async createRefCore(
        createRefParams: resources.ICreateRefParams,
        externalWriterConfig?: IExternalWriterConfig,
    ): Promise<resources.IRef> {
        const ref = await nodegit.Reference.create(
            this.repo,
            createRefParams.ref,
            nodegit.Oid.fromString(createRefParams.sha),
            0,
            "");

        if (externalWriterConfig?.enabled) {
            try {
                await this.externalStorageManager.write(this.repoName, createRefParams.ref, createRefParams.sha, false);
            } catch (e) {
                Lumberjack.error("Error writing to file", this.lumberjackBaseProperties, e);
            }
        }

        return conversions.refToIRef(ref);
    }

    protected async patchRefCore(
        refId: string,
        patchRefParams: resources.IPatchRefParams,
        externalWriterConfig?: IExternalWriterConfig,
    ): Promise<resources.IRef> {
        const ref = await nodegit.Reference.create(
            this.repo,
            refId,
            nodegit.Oid.fromString(patchRefParams.sha),
            patchRefParams.force ? 1 : 0,
            "");

        if (externalWriterConfig?.enabled) {
            try {
                await this.externalStorageManager.write(this.repoName, refId, patchRefParams.sha, true);
            } catch (error) {
                Lumberjack.error(
                    "External storage write failed while trying to update file",
                    {
                        ...this.lumberjackBaseProperties,
                        [BaseGitRestTelemetryProperties.ref]: refId,
                    },
                    error);
            }
        }

        return conversions.refToIRef(ref);
    }

    protected async deleteRefCore(refId: string): Promise<void> {
        const code = nodegit.Reference.remove(this.repo, refId);
        if (code !== 0) {
            throw new NetworkError(500, `Failed to delete ref. Code: ${code}`);
        }
    }

    protected async getTagCore(tagId: string): Promise<resources.ITag> {
        const tag = await nodegit.Tag.lookup(this.repo, tagId);
        return conversions.tagToITag(tag);
    }

    protected async createTagCore(tagParams: resources.ICreateTagParams): Promise<resources.ITag> {
        const date = Date.parse(tagParams.tagger.date);
        if (isNaN(date)) {
            throw new NetworkError(400, "Invalid input");
        }

        const signature = nodegit.Signature.create(
            tagParams.tagger.name,
            tagParams.tagger.email,
            Math.floor(date / 1000), // date represents time in milliseconds. NodeGit expects a timestamp in seconds.
            0);
        const object = await nodegit.Object.lookup(
            this.repo,
            nodegit.Oid.fromString(tagParams.object),
            GitObjectType[tagParams.type]);

        const tagOid = await nodegit.Tag.annotationCreate(
            this.repo,
            tagParams.tag,
            object,
            signature,
            tagParams.message,
        );
        return conversions.tagToITag(await nodegit.Tag.lookup(this.repo, tagOid));
    }
}

export class NodegitRepositoryManagerFactory extends RepositoryManagerFactoryBase<nodegit.Repository> {
    constructor(
        storageDirectoryConfig: IStorageDirectoryConfig,
        fileSystemManagerFactory: IFileSystemManagerFactory,
        externalStorageManager: IExternalStorageManager,
        repoPerDocEnabled: boolean,
        enableRepositoryManagerMetrics: boolean = false,
    ) {
        super(
            storageDirectoryConfig,
            fileSystemManagerFactory,
            externalStorageManager,
            repoPerDocEnabled,
            enableRepositoryManagerMetrics);
    }

    protected async initGitRepo(fs: IFileSystemManager, gitdir: string): Promise<nodegit.Repository> {
        const isBare = 1;
        return nodegit.Repository.init(
            gitdir,
            isBare);
    }

    protected async openGitRepo(gitdir: string): Promise<nodegit.Repository> {
        return nodegit.Repository.open(gitdir);
    }

    protected createRepoManager(
        fileSystemManager: IFileSystemManager,
        repoOwner: string,
        repoName: string,
        repo: nodegit.Repository,
        gitdir: string,
        externalStorageManager: IExternalStorageManager,
        lumberjackBaseProperties: Record<string, any>,
        enableRepositoryManagerMetrics: boolean): IRepositoryManager {
            return new NodegitRepositoryManager(
                repoOwner,
                repoName,
                repo,
                gitdir,
                externalStorageManager,
                lumberjackBaseProperties,
                enableRepositoryManagerMetrics);
    }
}
