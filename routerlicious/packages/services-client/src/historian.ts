import * as git from "@prague/gitresources";
import { RestWrapper } from "./restWrapper";

function endsWith(value: string, endings: string[]): boolean {
    for (const ending of endings) {
        if (value.endsWith(ending)) {
            return true;
        }
    }

    return false;
}

/**
 * Interface to a generic Git provider
 */
export interface IGitService {
    getBlob(sha: string): Promise<git.IBlob>;
    createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse>;
    getContent(path: string, ref: string): Promise<any>;
    getCommits(sha: string, count: number): Promise<git.ICommitDetails[]>;
    getCommit(sha: string): Promise<git.ICommit>;
    createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit>;
    getRefs(): Promise<git.IRef[]>;
    getRef(ref: string): Promise<git.IRef>;
    createRef(params: git.ICreateRefParams): Promise<git.IRef>;
    updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef>;
    deleteRef(ref: string): Promise<void>;
    createTag(tag: git.ICreateTagParams): Promise<git.ITag>;
    getTag(tag: string): Promise<git.ITag>;
    createTree(tree: git.ICreateTreeParams): Promise<git.ITree>;
    getTree(sha: string, recursive: boolean): Promise<git.ITree>;
}
/**
 * The Historian extends the git service by providing access to document header information stored in
 * the repository
 */
export interface IHistorian extends IGitService {
    endpoint: string;

    /**
     * Retrieves the header for the given document
     */
    getHeader(sha: string): Promise<git.IHeader>;

}

export interface ICredentials {
    user: string;
    password: string;
}

/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 */
export class Historian implements IHistorian {
    private rw: RestWrapper;

    constructor(
        public endpoint: string,
        private historianApi: boolean,
        private disableCache: boolean,
        credentials?: ICredentials) {

        let defaultHeaders = {};
        if (credentials) {
            defaultHeaders = {
                Authorization:
                    `Basic ${new Buffer(`${credentials.user}:${credentials.password}`).toString("base64")}`,
            };
        }

        this.rw = new RestWrapper(this.endpoint, defaultHeaders);
    }

    /* tslint:disable:promise-function-async */
    public getHeader(sha: string): Promise<any> {
        if (this.historianApi) {
            return this.rw.get(`/headers/${encodeURIComponent(sha)}`, this.appendCacheQueryString());
        } else {
            return this.getHeaderDirect(sha);
        }
    }

    public getBlob(sha: string): Promise<git.IBlob> {
        return this.rw.get<git.IBlob>(`/git/blobs/${encodeURIComponent(sha)}`, this.appendCacheQueryString());
    }

    public createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.rw.post<git.ICreateBlobResponse>(`/git/blobs`, blob, this.appendCacheQueryString());
    }

    public getContent(path: string, ref: string): Promise<any> {
        return this.rw.get(`/contents/${path}`, { ...{ ref }, ...this.appendCacheQueryString() });
    }

    public getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        return this.rw.get<git.ICommitDetails[]>(`/commits`, { ...{ count, sha }, ...this.appendCacheQueryString() })
            .catch((error) => error === 400 ? [] as git.ICommitDetails[] : Promise.reject<git.ICommitDetails[]>(error));
    }

    public getCommit(sha: string): Promise<git.ICommit> {
        return this.rw.get<git.ICommit>(`/git/commits/${encodeURIComponent(sha)}`, this.appendCacheQueryString());
    }

    public createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.rw.post<git.ICommit>(`/git/commits`, commit, this.appendCacheQueryString());
    }

    public getRefs(): Promise<git.IRef[]> {
        return this.rw.get(`/git/refs`, this.appendCacheQueryString());
    }

    public getRef(ref: string): Promise<git.IRef> {
        return this.rw.get(`/git/refs/${ref}`, this.appendCacheQueryString());
    }

    public createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        return this.rw.post(`/git/refs`, params, this.appendCacheQueryString());
    }

    public updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.rw.patch(`/git/refs/${ref}`, params, this.appendCacheQueryString());
    }

    public async deleteRef(ref: string): Promise<void> {
        await this.rw.delete(`/git/refs/${ref}`, this.appendCacheQueryString());
    }

    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.rw.post(`/git/tags`, tag, this.appendCacheQueryString());
    }

    public getTag(tag: string): Promise<git.ITag> {
        return this.rw.get(`/git/tags/${tag}`, this.appendCacheQueryString());
    }

    public createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        return this.rw.post<git.ITree>(`/git/trees`, tree, this.appendCacheQueryString());
    }

    public getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        const queryString = { ...{ recursive: recursive ? 1 : 0 }, ...this.appendCacheQueryString() };
        return this.rw.get<git.ITree>(
            `/git/trees/${encodeURIComponent(sha)}`, queryString);
    }

    private async getHeaderDirect(sha: string): Promise<git.IHeader> {
        const tree = await this.getTree(sha, true) as any;

        const includeBlobs = [".attributes", ".blobs", ".messages", "header"];

        const blobsP: Array<Promise<git.IBlob>> = [];
        /* tslint:disable:no-unsafe-any */
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

    private appendCacheQueryString() {
        let queryString: {};
        if (this.disableCache && this.historianApi) {
            queryString = { disableCache: this.disableCache };
        } else if (this.disableCache) {
            queryString = { cacheBust: Date.now() };
        }

        return queryString;
    }
}
