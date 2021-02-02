/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    assert,
    gitHashFile,
    IsoBuffer,
    stringToBuffer,
    Uint8ArrayToString,
    unreachableCase,
} from "@fluidframework/common-utils";
import {
    IDocumentStorageService,
    ISummaryContext,
    IDocumentStorageServicePolicies,
 } from "@fluidframework/driver-definitions";
import { ICreateTreeEntry } from "@fluidframework/gitresources";
import { buildHierarchy, getGitType, getGitMode } from "@fluidframework/protocol-base";
import {
    ICreateBlobResponse,
    ISnapshotTreeEx,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
    SummaryObject,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { GitManager } from "@fluidframework/server-services-client";
import { isStatusRetriable, throwR11sNetworkError } from "./r11sError";

/**
 * Document access to underlying storage for routerlicious driver.
 */
export class DocumentStorageService implements IDocumentStorageService {
    // The values of this cache is useless. We only need the keys. So we are always putting
    // empty strings as values.
    private readonly blobsShaCache = new Map<string, string>();
    private _logTailSha: string | undefined = undefined;

    public get repositoryUrl(): string {
        return "";
    }

    public get logTailSha(): string | undefined {
        return this._logTailSha;
    }

    constructor(
        public readonly id: string,
        public manager: GitManager,
        public readonly policies?: IDocumentStorageServicePolicies) {
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTreeEx | null> {
        let requestVersion = version;
        if (!requestVersion) {
            const versions = await this.getVersions(this.id, 1);
            if (versions.length === 0) {
                return null;
            }

            requestVersion = versions[0];
        }

        const rawTree = await this.manager.getTree(requestVersion.treeId)
            .catch(DocumentStorageService.enhanceGitServiceError);
        const tree = buildHierarchy(rawTree, this.blobsShaCache);

        this._logTailSha = ".logTail" in tree.trees ? tree.trees[".logTail"].blobs.logTail : undefined;
        return tree;
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const commits = await this.manager.getCommits(versionId ? versionId : this.id, count)
            .catch(DocumentStorageService.enhanceGitServiceError);
        return commits.map((commit) => ({
            date: commit.commit.author.date,
            id: commit.sha,
            treeId: commit.commit.tree.sha,
        }));
    }

    public async read(blobId: string): Promise<string> {
        const value = await this.manager.getBlob(blobId)
            .catch(DocumentStorageService.enhanceGitServiceError);
        this.blobsShaCache.set(value.sha, "");
        return value.content;
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        const branch = ref ? `datastores/${this.id}/${ref}` : this.id;
        const commit = await this.manager.write(branch, tree, parents, message)
            .catch(DocumentStorageService.enhanceGitServiceError);
        return { date: commit.committer.date, id: commit.sha, treeId: commit.tree.sha };
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const snapshot = context.ackHandle
            ? await this.getVersions(context.ackHandle, 1)
                .then(async (versions) => {
                    // Clear the cache as the getSnapshotTree call will fill the cache.
                    this.blobsShaCache.clear();
                    return this.getSnapshotTree(versions[0]);
                })
            : undefined;
        return this.writeSummaryTree(summary, snapshot ?? undefined);
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        throw new Error("NOT IMPLEMENTED!");
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        const response = this.manager.createBlob(Uint8ArrayToString(new Uint8Array(file), "base64"), "base64")
            .catch(DocumentStorageService.enhanceGitServiceError);

        return response.then((r) => ({ id: r.sha, url: r.url }));
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const value = await this.manager.getBlob(blobId)
            .catch(DocumentStorageService.enhanceGitServiceError);
        this.blobsShaCache.set(value.sha, "");
        return stringToBuffer(value.content, value.encoding);
    }

    private async writeSummaryTree(
        summaryTree: ISummaryTree,
        /** Entire previous snapshot, not subtree */
        previousFullSnapshot: ISnapshotTreeEx | undefined,
    ): Promise<string> {
        const entries = await Promise.all(Object.keys(summaryTree.tree).map(async (key) => {
            const entry = summaryTree.tree[key];
            const pathHandle = await this.writeSummaryTreeObject(key, entry, previousFullSnapshot);
            const treeEntry: ICreateTreeEntry = {
                mode: getGitMode(entry),
                path: encodeURIComponent(key),
                sha: pathHandle,
                type: getGitType(entry),
            };
            return treeEntry;
        }));

        const treeHandle = await this.manager.createGitTree({ tree: entries })
            .catch(DocumentStorageService.enhanceGitServiceError);
        return treeHandle.sha;
    }

    private async writeSummaryTreeObject(
        key: string,
        object: SummaryObject,
        previousFullSnapshot: ISnapshotTreeEx | undefined,
        currentPath = "",
    ): Promise<string> {
        switch (object.type) {
            case SummaryType.Blob: {
                return this.writeSummaryBlob(object.content);
            }
            case SummaryType.Handle: {
                if (previousFullSnapshot === undefined) {
                    throw Error("Parent summary does not exist to reference by handle.");
                }
                return this.getIdFromPath(object.handleType, object.handle, previousFullSnapshot);
            }
            case SummaryType.Tree: {
                return this.writeSummaryTree(object, previousFullSnapshot);
            }
            case SummaryType.Attachment: {
                return object.id;
            }

            default:
                unreachableCase(object, `Unknown type: ${(object as any).type}`);
        }
    }

    private getIdFromPath(
        handleType: SummaryType,
        handlePath: string,
        previousFullSnapshot: ISnapshotTreeEx,
    ): string {
        const path = handlePath.split("/").map((part) => decodeURIComponent(part));
        if (path[0] === "") {
            // root of tree should be unnamed
            path.shift();
        }
        if (path.length === 0) {
            return previousFullSnapshot.id;
        }

        return this.getIdFromPathCore(handleType, path, previousFullSnapshot);
    }

    private getIdFromPathCore(
        handleType: SummaryType,
        path: string[],
        /** Previous snapshot, subtree relative to this path part */
        previousSnapshot: ISnapshotTreeEx,
    ): string {
        assert(path.length > 0, "Expected at least 1 path part");
        const key = path[0];
        if (path.length === 1) {
            switch (handleType) {
                case SummaryType.Blob: {
                    const tryId = previousSnapshot.blobs[key];
                    assert(!!tryId, "Parent summary does not have blob handle for specified path.");
                    return tryId;
                }
                case SummaryType.Tree: {
                    const tryId = previousSnapshot.trees[key]?.id;
                    assert(!!tryId, "Parent summary does not have tree handle for specified path.");
                    return tryId;
                }
                default:
                    throw Error(`Unexpected handle summary object type: "${handleType}".`);
            }
        }
        return this.getIdFromPathCore(handleType, path.slice(1), previousSnapshot.trees[key]);
    }

    private async writeSummaryBlob(content: string | Uint8Array): Promise<string> {
        const { parsedContent, encoding } = typeof content === "string"
            ? { parsedContent: content, encoding: "utf-8" }
            : { parsedContent: Uint8ArrayToString(content, "base64"), encoding: "base64" };

        // The gitHashFile would return the same hash as returned by the server as blob.sha
        const hash = await gitHashFile(IsoBuffer.from(parsedContent, encoding));
        if (!this.blobsShaCache.has(hash)) {
            this.blobsShaCache.set(hash, "");
            const blob = await this.manager.createBlob(parsedContent, encoding)
                .catch(DocumentStorageService.enhanceGitServiceError);
            assert(hash === blob.sha, "Blob.sha and hash do not match!!");
        }
        return hash;
    }

    public static async enhanceGitServiceError(error: any): Promise<never> {
        const messageFallback = "GitManager call failed";
        // GitManager's Historian's RestWrapper only throws status code when response is available
        if (typeof error === "number") {
            // RestWrapper handles 1 429 retry but does not pass along retryAfter, and Historian handles 401 retries.
            // Anything else can be retried.
            throwR11sNetworkError(messageFallback, isStatusRetriable(error), error);
        }
        // In case response is not available, throw a more generic error
        throwR11sNetworkError(error?.toString() ?? messageFallback);
    }
}
