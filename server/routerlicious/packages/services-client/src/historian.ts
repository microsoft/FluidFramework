/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import { RestWrapper, BasicRestWrapper } from "./restWrapper";
import { IHistorian } from "./storage";
import { IWholeFlatSummary, IWholeSummaryPayload, IWriteSummaryResponse } from "./storageContracts";

function endsWith(value: string, endings: string[]): boolean {
    for (const ending of endings) {
        if (value.endsWith(ending)) {
            return true;
        }
    }

    return false;
}

export interface ICredentials {
    user: string;
    password: string;
}

export const getAuthorizationTokenFromCredentials = (credentials: ICredentials): string =>
    `Basic ${fromUtf8ToBase64(`${credentials.user}:${credentials.password}`)}`;

/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 */
export class Historian implements IHistorian {
    private readonly defaultQueryString: Record<string, unknown> = {};
    private readonly cacheBust: boolean;

    constructor(
        public endpoint: string,
        private readonly historianApi: boolean,
        disableCache: boolean,
        private readonly restWrapper?: RestWrapper,
    ) {
        if (disableCache && this.historianApi) {
            this.defaultQueryString.disableCache = disableCache;
            this.cacheBust = false;
        } else {
            this.cacheBust = disableCache;
        }

        if (this.restWrapper === undefined) {
            this.restWrapper = new BasicRestWrapper(this.endpoint);
        }
    }

    public async getHeader(sha: string): Promise<any> {
        return this.historianApi
            ? this.restWrapper.get(`/headers/${encodeURIComponent(sha)}`, this.getQueryString())
            : this.getHeaderDirect(sha);
    }

    public async getFullTree(sha: string): Promise<any> {
        return this.restWrapper.get(`/tree/${encodeURIComponent(sha)}`, this.getQueryString());
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        return this.restWrapper.get<git.IBlob>(
            `/git/blobs/${encodeURIComponent(sha)}`, this.getQueryString());
    }

    public async createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.restWrapper.post<git.ICreateBlobResponse>(
            `/git/blobs`, blob, this.getQueryString());
    }

    public async getContent(path: string, ref: string): Promise<any> {
        return this.restWrapper.get(`/contents/${path}`, this.getQueryString({ ref }));
    }

    public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        return this.restWrapper.get<git.ICommitDetails[]>(
            `/commits`, this.getQueryString({ count, sha }))
                .catch((error) => (error === 400 || error === 404) ?
                    [] as git.ICommitDetails[] : Promise.reject<git.ICommitDetails[]>(error));
    }

    public async getCommit(sha: string): Promise<git.ICommit> {
        return this.restWrapper.get<git.ICommit>(
            `/git/commits/${encodeURIComponent(sha)}`, this.getQueryString());
    }

    public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.restWrapper.post<git.ICommit>(`/git/commits`, commit, this.getQueryString());
    }

    public async getRefs(): Promise<git.IRef[]> {
        return this.restWrapper.get(`/git/refs`, this.getQueryString());
    }

    public async getRef(ref: string): Promise<git.IRef> {
        return this.restWrapper.get(`/git/refs/${ref}`, this.getQueryString());
    }

    public async createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        return this.restWrapper.post(`/git/refs`, params, this.getQueryString());
    }

    public async updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.restWrapper.patch(`/git/refs/${ref}`, params, this.getQueryString());
    }

    public async deleteRef(ref: string): Promise<void> {
        await this.restWrapper.delete(`/git/refs/${ref}`, this.getQueryString());
    }

    public async createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.restWrapper.post(`/git/tags`, tag, this.getQueryString());
    }

    public async getTag(tag: string): Promise<git.ITag> {
        return this.restWrapper.get(`/git/tags/${tag}`, this.getQueryString());
    }

    public async createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        return this.restWrapper.post<git.ITree>(`/git/trees`, tree, this.getQueryString());
    }

    public async getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        return this.restWrapper.get<git.ITree>(
            `/git/trees/${encodeURIComponent(sha)}`,
            this.getQueryString({ recursive: recursive ? 1 : 0 }));
    }
    public async createSummary(summary: IWholeSummaryPayload): Promise<IWriteSummaryResponse> {
        return this.restWrapper.post<IWriteSummaryResponse>(`/git/summaries`, summary, this.getQueryString());
    }
    public async deleteSummary(softDelete: boolean): Promise<void> {
        const headers = { "Soft-Delete": softDelete };
        return this.restWrapper.delete(`/git/summaries`, this.getQueryString(), headers);
    }
    public async getSummary(sha: string): Promise<IWholeFlatSummary> {
        return this.restWrapper.get<IWholeFlatSummary>(`/git/summaries/${sha}`, this.getQueryString());
    }

    private async getHeaderDirect(sha: string): Promise<git.IHeader> {
        const tree = await this.getTree(sha, true);

        const includeBlobs = [".attributes", ".blobs", ".messages", "header"];

        const blobsP: Promise<git.IBlob>[] = [];
        for (const entry of tree.tree) {
            if (entry.type === "blob" && endsWith(entry.path, includeBlobs)) {
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

    private getQueryString(queryString?: Record<string, unknown>): Record<string, unknown> {
        if (this.cacheBust) {
            return {
                cacheBust: Date.now(),
                ...this.defaultQueryString,
                ...queryString,
            };
        }
        return {
            ...this.defaultQueryString,
            ...queryString,
        };
    }
}
