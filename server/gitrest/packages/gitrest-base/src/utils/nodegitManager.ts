/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nodegit from "nodegit";
import winston from "winston";
import safeStringify from "json-stringify-safe";
import type * as resources from "@fluidframework/gitresources";
import { NetworkError } from "@fluidframework/server-services-client";
import { IExternalStorageManager } from "../externalStorageManager";
import * as helpers from "./helpers";
import * as conversions from "./nodegitConversions";
import {
    IRepositoryManagerFactory,
    GitObjectType,
    IExternalWriterConfig,
    IRepositoryManager,
    IFileSystemManagerFactory,
    IRepoManagerParams,
    IStorageDirectoryConfig,
} from "./definitions";

export class NodegitRepositoryManager implements IRepositoryManager {
    constructor(
        private readonly repoOwner: string,
        private readonly repoName: string,
        private readonly repo: nodegit.Repository,
        private readonly externalStorageManager: IExternalStorageManager,
    ) {}

    public get path(): string {
        return this.repo.path();
    }

    public async getCommit(sha: string): Promise<resources.ICommit> {
        const commit = await this.repo.getCommit(sha);
        return conversions.commitToICommit(commit);
    }

    public async getCommits(
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
            winston.info(`getCommits error: ${err}`);
            if (externalWriterConfig?.enabled) {
                try {
                    const result = await this.externalStorageManager.read(this.repoName, sha);
                    if (!result) {
                        return Promise.reject(err);
                    }
                    return this.getCommits(sha, count, externalWriterConfig);
                } catch (bridgeError) {
                    // If file does not exist or error trying to look up commit, return the original error.
                    winston.error(`BridgeError: ${bridgeError}`);
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

    public async getTree(rootSha: string, recursive: boolean): Promise<resources.ITree> {
        if (recursive) {
            return this.getTreeInternalRecursive(rootSha);
        }
        return this.getTreeInternal(rootSha);
    }

    public async getBlob(sha: string): Promise<resources.IBlob> {
        const blob = await this.repo.getBlob(sha);
        return conversions.blobToIBlob(blob, this.repoOwner, this.repoName);
    }

    public async getContent(commit: string, contentPath: string): Promise<resources.IBlob> {
        const revObj = await nodegit.Revparse.single(this.repo, `${commit}:${contentPath}`);

        // TODO switch on the type of object
        const blob = await this.repo.getBlob(revObj.id());
        return conversions.blobToIBlob(blob, this.repoOwner, this.repoName);
    }

    public async createBlob(createBlobParams: resources.ICreateBlobParams): Promise<resources.ICreateBlobResponse> {
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

    public async createTree(params: resources.ICreateTreeParams): Promise<resources.ITree> {
        const builder = await nodegit.Treebuilder.create(this.repo, null);

        // build up the tree
        for (const node of params.tree) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            builder.insert(node.path, nodegit.Oid.fromString(node.sha), parseInt(node.mode, 8));
        }

        const id = await builder.write();
        return this.getTreeInternal(id.tostrS());
    }

    public async createCommit(commit: resources.ICreateCommitParams): Promise<resources.ICommit> {
        const date = Date.parse(commit.author.date);
        if (isNaN(date)) {
            throw new NetworkError(400, "Invalid input");
        }

        const signature = nodegit.Signature.create(commit.author.name, commit.author.email, Math.floor(date), 0);
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

    public async getRefs(): Promise<resources.IRef[]> {
        const refIds = await nodegit.Reference.list(this.repo);
        const refsP = await Promise.all(refIds.map(
            async (refId) => nodegit.Reference.lookup(this.repo, refId, undefined),
        ));
        return refsP.map((ref) => conversions.refToIRef(ref));
    }

    public async getRef(refId: string, externalWriterConfig?: IExternalWriterConfig): Promise<resources.IRef> {
        try {
            const ref = await nodegit.Reference.lookup(this.repo, refId, undefined);
            return conversions.refToIRef(ref);
        } catch (err) {
            // Lookup external storage if commit does not exist.
            const fileName = refId.substring(refId.lastIndexOf("/") + 1);
            // If file does not exist or error trying to look up commit, return the original error.
            if (externalWriterConfig?.enabled) {
                try {
                    const result = await this.externalStorageManager.read(this.repoName, fileName);
                    if (!result) {
                        winston.error(`getRef error: ${
                            safeStringify(err, undefined, 2)} repo: ${this.repoName} ref: ${refId}`);
                        return Promise.reject(err);
                    }
                    return this.getRef(refId, externalWriterConfig);
                } catch (bridgeError) {
                    winston.error(`Giving up on creating ref. BridgeError: ${
                        safeStringify(bridgeError, undefined, 2)}`);
                    return Promise.reject(err);
                }
            }
            winston.error(`getRef error: ${safeStringify(err, undefined, 2)} repo: ${this.repoName} ref: ${refId}`);
            return Promise.reject(err);
        }
    }

    public async createRef(
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
                winston.error(`Error writing to file ${e}`);
            }
        }

        return conversions.refToIRef(ref);
    }

    public async patchRef(
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
                winston.error(`External storage write failed while trying to update file
                ${safeStringify(error, undefined, 2)}, ${this.repoName} / ${refId}`);
            }
        }

        return conversions.refToIRef(ref);
    }

    public async deleteRef(refId: string): Promise<void> {
        const code = nodegit.Reference.remove(this.repo, refId);
        if (code !== 0) {
            throw new NetworkError(500, `Failed to delete ref. Code: ${code}`);
        }
    }

    public async getTag(tagId: string): Promise<resources.ITag> {
        const tag = await nodegit.Tag.lookup(this.repo, tagId);
        return conversions.tagToITag(tag);
    }

    public async createTag(tagParams: resources.ICreateTagParams): Promise<resources.ITag> {
        const date = Date.parse(tagParams.tagger.date);
        if (isNaN(date)) {
            throw new NetworkError(400, "Invalid input");
        }

        const signature = nodegit.Signature.create(tagParams.tagger.name, tagParams.tagger.email, Math.floor(date), 0);
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

export class NodegitRepositoryManagerFactory implements IRepositoryManagerFactory {
    // Cache repositories to allow for reuse
    private repositoryPCache: { [key: string]: Promise<nodegit.Repository> } = {};

    constructor(
        private readonly storageDirectoryConfig: IStorageDirectoryConfig,
        private readonly fileSystemManagerFactory: IFileSystemManagerFactory,
        private readonly externalStorageManager: IExternalStorageManager,
    ) {
    }

    public async create(params: IRepoManagerParams): Promise<NodegitRepositoryManager> {
        // Verify that both inputs are valid folder names
        const repoPath = helpers.getRepoPath(
            params.repoName,
            this.storageDirectoryConfig.useRepoOwner ? params.repoOwner : undefined);
        // Create and then cache the repository
        const isBare = 1;

        const repositoryP = nodegit.Repository.init(
            helpers.getGitDirectory(
                repoPath,
                this.storageDirectoryConfig.baseDir),
            isBare);
        this.repositoryPCache[repoPath] = repositoryP;

        const repository = await this.repositoryPCache[repoPath];
        const repoManager = new NodegitRepositoryManager(
            params.repoOwner,
            params.repoName,
            repository,
            this.externalStorageManager);
        winston.info(`Created a new repo for owner ${params.repoOwner} reponame: ${params.repoName}`);

        return repoManager;
    }

    public async open(params: IRepoManagerParams): Promise<NodegitRepositoryManager> {
        const repoPath = helpers.getRepoPath(
            params.repoName,
            this.storageDirectoryConfig.useRepoOwner ? params.repoOwner : undefined);

        if (!(repoPath in this.repositoryPCache)) {
            const directory = helpers.getGitDirectory(
                repoPath,
                this.storageDirectoryConfig.baseDir);

            const repoExists = await helpers.exists(
                this.fileSystemManagerFactory.create(params.fileSystemManagerParams), directory);
            if (!repoExists) {
                winston.info(`Repo does not exist ${directory}`);
                // services-client/getOrCreateRepository depends on a 400 response code
                throw new NetworkError(400, `Repo does not exist ${directory}`);
            }

            this.repositoryPCache[repoPath] = nodegit.Repository.open(directory);
        }

        const repository = await this.repositoryPCache[repoPath];
        const repoManager = new NodegitRepositoryManager(
            params.repoOwner,
            params.repoName,
            repository,
            this.externalStorageManager);
        return repoManager;
    }
}
