/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { gitHashFile, IsoBuffer } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import {
    IHistorian,
    IWholeFlatSummary,
    IWholeSummaryPayload,
    IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { ICollection, IDb } from "@fluidframework/server-services-core";
import { v4 as uuid } from "uuid";
import { TestDb } from "./testCollection";

export class TestHistorian implements IHistorian {
    public readonly endpoint = "";

    // back-compat 0.1010 old-collection-format
    private readonly blobs: ICollection<
        { _id: string; content: string; encoding: string; value?: git.ICreateBlobParams; }>;
    private readonly commits: ICollection<{
        _id: string;
        message: string;
        tree: string;
        parents: string[];
        author: git.IAuthor;
        value?: git.ICreateCommitParams; }>;
    private readonly trees: ICollection<
        { _id: string; tree: git.ICreateTreeEntry[]; base_tree?: string; value?: git.ICreateTreeParams; }>;
    private readonly refs: ICollection<{ _id: string; ref: string; sha: string; value?: git.ICreateRefParams; }>;

    constructor(db: IDb = new TestDb({})) {
        this.blobs = db.collection("blobs");
        this.commits = db.collection("commits");
        this.trees = db.collection("trees");
        this.refs = db.collection("refs");
    }

    public async getHeader(sha: string): Promise<any> {
        const tree = await this.getTree(sha, true);

        const includeBlobs = [".attributes", ".blobs", ".messages", "header"];

        const blobsP: Promise<git.IBlob>[] = [];
        for (const entry of tree.tree) {
            if (entry.type === "blob" && includeBlobs.reduce((pv, cv) => pv || entry.path.endsWith(cv), false)) {
                const blobP = this.getBlob(entry.sha);
                blobsP.push(blobP);
            }
        }
        const blobs = await Promise.all(blobsP);

        return {
            blobs,
            tree,
        };
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getFullTree(sha: string): Promise<any> {
        throw new Error("Not Supported");
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        const blob = await this.blobs.findOne({ _id: sha });
        return {
            content: IsoBuffer.from(
                blob.content ?? blob.value?.content,
                blob.encoding ?? blob.value?.encoding).toString("base64"),
            encoding: "base64",
            sha: blob._id,
            size: blob.content !== undefined ? blob.content.length : blob.value?.content.length,
            url: "",
        };
    }

    public async createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        const _id = await gitHashFile(IsoBuffer.from(blob.content, blob.encoding));
        await this.blobs.findOrCreate({ _id }, {
            _id,
            ...blob,
            value: blob,
        });
        return {
            sha: _id,
            url: "",
        };
    }

    public async getContent(path: string, ref: string): Promise<any> {
        const tree = await this.getTree(ref, true);
        for (const entry of tree.tree) {
            if (entry.path === path) {
                return this.getBlob(entry.sha);
            }
        }
    }

    public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        const commit = await this.getCommit(sha);
        return commit ? [{
            commit: {
                author: commit.author,
                committer: commit.committer,
                message: commit.message,
                tree: commit.tree,
                url: commit.url,
            },
            parents: commit.parents,
            sha: commit.sha,
            url: commit.url,
        }] : [];
    }

    public async getCommit(sha: string): Promise<git.ICommit> {
        let commit = await this.commits.findOne({ _id: sha });
        if (!commit) {
            const ref = await this.getRef(`refs/heads/${sha}`);
            if (ref !== undefined) {
                commit = await this.commits.findOne({ _id: ref.object.sha });
            }
        }
        if (commit) {
            return {
                author: {} as Partial<git.IAuthor> as git.IAuthor,
                committer: {} as Partial<git.ICommitter> as git.ICommitter,
                message: commit.message ?? commit.value?.message,
                parents: commit.parents !== undefined ?
                    commit.parents.map<git.ICommitHash>((p) => ({ sha: p, url: "" })) :
                    commit.value?.parents.map<git.ICommitHash>((p) => ({ sha: p, url: "" })),
                sha: commit._id,
                tree: {
                    sha: commit.tree ?? commit.value?.tree,
                    url: "",
                },
                url: "",
            };
        }
    }

    public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        const _id = commit.tree;
        await this.commits.insertOne({ _id, ...commit, value: commit });
        return this.getCommit(_id);
    }

    public async createSummary(summary: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
        throw new Error("Not Supported");
    }

    public async deleteSummary(softDelete: boolean): Promise<void> {
        throw new Error("Not Supported");
    }

    public async getSummary(sha: string): Promise<IWholeFlatSummary> {
        throw new Error("Not Supported");
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getRefs(): Promise<git.IRef[]> {
        throw new Error("Not Supported");
    }

    public async getRef(ref: string): Promise<git.IRef> {
        const _id = ref.startsWith("refs/") ? ref.substr(5) : ref;
        const val = await this.refs.findOne({ _id });
        if (val) {
            return {
                ref: val.ref ?? val.value?.ref,
                url: "",
                object: {
                    sha: val.sha ?? val.value?.sha,
                    url: "",
                    type: "",
                },
            };
        }
    }

    public async createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        const _id = params.ref.startsWith("refs/") ? params.ref.substr(5) : params.ref;
        await this.refs.insertOne({ _id, ...params, value: params });
        return this.getRef(params.ref);
    }

    public async updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        const _id = ref.startsWith("refs/") ? ref.substr(5) : ref;
        if (params.force) {
            await this.refs.upsert({ _id }, { sha: params.sha, ref }, {});
        } else {
            await this.refs.update({ _id }, { sha: params.sha, ref }, {});
        }
        return this.getRef(ref);
    }

    public async deleteRef(ref: string): Promise<void> {
        throw new Error("Not Supported");
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        throw new Error("Not Supported");
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getTag(tag: string): Promise<git.ITag> {
        throw new Error("Not Supported");
    }

    public async createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        const _id = uuid();
        await this.trees.insertOne({
            _id,
            ...tree,
            value: tree,
        });
        return this.getTree(_id, false);
    }

    public async getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        return this.getTreeHelper(sha, recursive);
    }

    public async getTreeHelper(sha: string, recursive: boolean, path: string = ""): Promise<git.ITree> {
        const tree = await this.trees.findOne({ _id: sha });
        if (tree) {
            const finalTree: git.ITree = {
                sha: tree._id,
                url: "",
                tree: [],
            };
            for (const entry of tree.tree ?? tree.value?.tree ?? []) {
                const entryPath: string = path === "" ? entry.path : `${path}/${entry.path}`;
                const treeEntry: git.ITreeEntry = {
                    mode: entry.mode,
                    path: entryPath,
                    sha: entry.sha,
                    size: 0,
                    type: entry.type,
                    url: "",
                };
                finalTree.tree.push(treeEntry);
                if (entry.type === "tree" && recursive) {
                    const childTree = await this.getTreeHelper(entry.sha, recursive, entryPath);
                    if (childTree) {
                        finalTree.tree = finalTree.tree.concat(childTree.tree);
                    }
                }
            }
            return finalTree;
        }
    }
}
