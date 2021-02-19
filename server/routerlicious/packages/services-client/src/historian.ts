/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import * as git from "@fluidframework/gitresources";
import * as uuid from "uuid";
import { RestWrapper } from "./restWrapper";
import { IHistorian } from "./storage";

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

/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 */
export class Historian implements IHistorian {
    private restWrapperP: Promise<RestWrapper>;

    constructor(
        public endpoint: string,
        private readonly historianApi: boolean,
        private readonly disableCache: boolean,
        private readonly getCredentials?: () => Promise<ICredentials>,
        private readonly getCorrelationId?: () => string | undefined) {
        this.restWrapperP = this.createRestWrapper();
    }

    /* eslint-disable @typescript-eslint/promise-function-async */
    public getHeader(sha: string): Promise<any> {
        if (this.historianApi) {
            return this.restCallWithAuthRetry((restWrapper) => restWrapper.get(`/headers/${encodeURIComponent(sha)}`));
        } else {
            return this.getHeaderDirect(sha);
        }
    }

    public getFullTree(sha: string): Promise<any> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get(`/tree/${encodeURIComponent(sha)}`));
    }

    public getBlob(sha: string): Promise<git.IBlob> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get<git.IBlob>(
            `/git/blobs/${encodeURIComponent(sha)}`));
    }

    public createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.post<git.ICreateBlobResponse>(
            `/git/blobs`, blob));
    }

    public getContent(path: string, ref: string): Promise<any> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get(`/contents/${path}`, { ref }));
    }

    public getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get<git.ICommitDetails[]>(
            `/commits`, { count, sha }))
                .catch((error) => (error === 400 || error === 404) ?
                    [] as git.ICommitDetails[] : Promise.reject<git.ICommitDetails[]>(error));
    }

    public getCommit(sha: string): Promise<git.ICommit> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get<git.ICommit>(
            `/git/commits/${encodeURIComponent(sha)}`));
    }

    public createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.post<git.ICommit>(`/git/commits`, commit));
    }

    public getRefs(): Promise<git.IRef[]> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get(`/git/refs`));
    }

    public getRef(ref: string): Promise<git.IRef> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get(`/git/refs/${ref}`));
    }

    public createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.post(`/git/refs`, params));
    }

    public updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.patch(`/git/refs/${ref}`, params));
    }
    /* eslint-enable @typescript-eslint/promise-function-async */

    public async deleteRef(ref: string): Promise<void> {
        await this.restCallWithAuthRetry(async (restWrapper) => restWrapper.delete(`/git/refs/${ref}`));
    }

    /* eslint-disable @typescript-eslint/promise-function-async */
    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.post(`/git/tags`, tag));
    }

    public getTag(tag: string): Promise<git.ITag> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get(`/git/tags/${tag}`));
    }

    public createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.post<git.ITree>(`/git/trees`, tree));
    }

    public getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        return this.restCallWithAuthRetry((restWrapper) => restWrapper.get<git.ITree>(
            `/git/trees/${encodeURIComponent(sha)}`, { recursive: recursive ? 1 : 0 }));
    }
    /* eslint-enable @typescript-eslint/promise-function-async */

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

    private async createRestWrapper(): Promise<RestWrapper> {
        const queryString: { token?; disableCache?} = {};
        let cacheBust = false;
        if (this.disableCache && this.historianApi) {
            queryString.disableCache = this.disableCache;
        } else if (this.disableCache) {
            cacheBust = true;
        }

        const headers: any = {};
        if (typeof this.getCredentials === "function") {
            const credentials = await this.getCredentials();
            queryString.token = fromUtf8ToBase64(`${credentials.user}`);
            headers.Authorization = `Basic ${fromUtf8ToBase64(`${credentials.user}:${credentials.password}`)}`;
        }

        if (this.getCorrelationId) {
            headers["x-correlation-id"] = this.getCorrelationId() || uuid.v4();
        }

        return new RestWrapper(this.endpoint, headers, queryString, cacheBust);
    }

    private async restCallWithAuthRetry<T>(restCall: (restWrapper: RestWrapper) => Promise<T>): Promise<T> {
        let restWrapper = await this.restWrapperP;
        if (this.getCredentials === undefined) {
            return restCall(restWrapper);
        }
        return restCall(restWrapper).catch(async (error) => {
            if (error === 401 || error?.response?.status === 401) {
                this.restWrapperP = this.createRestWrapper();
                restWrapper = await this.restWrapperP;
                return restCall(restWrapper);
            }
            return Promise.reject(error);
        });
    }
}
