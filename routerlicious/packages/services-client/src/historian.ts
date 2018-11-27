import * as git from "@prague/gitresources";
import * as querystring from "querystring";
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
        disableCache: boolean,
        credentials?: ICredentials) {

        let defaultHeaders = {};
        if (credentials) {
            defaultHeaders = {
                Authorization:
                    `Basic ${new Buffer(`${credentials.user}:${credentials.password}`).toString("base64")}`,
            };
        }

        let defaultQueryString = {};
        if (disableCache && this.historianApi) {
            defaultQueryString = { disableCache };
        } else if (disableCache) {
            defaultQueryString = { cacheBust: () => Date.now() };
        }

        this.rw = new RestWrapper(this.endpoint, defaultHeaders, defaultQueryString);
    }

    /* tslint:disable:promise-function-async */
    public getHeader(sha: string): Promise<any> {
        if (this.historianApi) {
            return this.rw.get(`/headers/${encodeURIComponent(sha)}`);
        } else {
            return this.getHeaderDirect(sha);
        }
    }

    public getBlob(sha: string): Promise<git.IBlob> {
        return this.rw.get<git.IBlob>(`/git/blobs/${encodeURIComponent(sha)}`);
    }

    public createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.rw.post<git.ICreateBlobResponse>(`/git/blobs`, blob);
    }

    public getContent(path: string, ref: string): Promise<any> {
        const query = querystring.stringify({ ref });
        return this.rw.get(`/contents/${path}?${query}`);
    }

    public getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        const query = querystring.stringify({
            count,
            sha,
        });
        return this.rw.get<git.ICommitDetails[]>(`/commits?${query}`)
            .catch((error) => error === 400 ? [] as git.ICommitDetails[] : Promise.reject<git.ICommitDetails[]>(error));
    }

    public getCommit(sha: string): Promise<git.ICommit> {
        return this.rw.get<git.ICommit>(`/git/commits/${encodeURIComponent(sha)}`);
    }

    public createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.rw.post<git.ICommit>(`/git/commits`, commit);
    }

    public getRefs(): Promise<git.IRef[]> {
        return this.rw.get(`/git/refs`);
    }

    public getRef(ref: string): Promise<git.IRef> {
        return this.rw.get(`/git/refs/${ref}`);
    }

    public createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        return this.rw.post(`/git/refs`, params);
    }

    public updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.rw.patch(`/git/refs/${ref}`, params);
    }

    public async deleteRef(ref: string): Promise<void> {
        await this.rw.delete(`/git/refs/${ref}`);
    }

    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.rw.post(`/git/tags`, tag);
    }

    public getTag(tag: string): Promise<git.ITag> {
        return this.rw.get(`/git/tags/${tag}`);
    }

    public createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        return this.rw.post<git.ITree>(`/git/trees`, tree);
    }

    public getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
        return this.rw.get<git.ITree>(
            `/git/trees/${encodeURIComponent(sha)}?${query}`);
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
}
