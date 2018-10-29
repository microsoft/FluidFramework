import * as git from "@prague/gitresources";
import { AxiosRequestConfig, default as axios } from "axios";
import * as querystring from "querystring";

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
    private authorization: string;

    constructor(
        public endpoint: string,
        private historianApi: boolean,
        private disableCache: boolean,
        credentials?: ICredentials) {

        if (credentials) {
            this.authorization =
                `Basic ${new Buffer(`${credentials.user}:${credentials.password}`).toString("base64")}`;
        }
    }

    /* tslint:disable:promise-function-async */
    public getHeader(sha: string): Promise<any> {
        if (this.historianApi) {
            return this.get(`/headers/${encodeURIComponent(sha)}`);
        } else {
            return this.getHeaderDirect(sha);
        }
    }

    public getBlob(sha: string): Promise<git.IBlob> {
        return this.get<git.IBlob>(`/git/blobs/${encodeURIComponent(sha)}`);
    }

    public createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.post<git.ICreateBlobResponse>(`/git/blobs`, blob);
    }

    public getContent(path: string, ref: string): Promise<any> {
        const query = querystring.stringify({ ref });
        return this.get(`/contents/${path}?${query}`);
    }

    public getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        const query = querystring.stringify({
            count,
            sha,
        });
        return this.get<git.ICommitDetails[]>(`/commits?${query}`)
            .catch((error) => error === 400 ? [] as git.ICommitDetails[] : Promise.reject<git.ICommitDetails[]>(error));
    }

    public getCommit(sha: string): Promise<git.ICommit> {
        return this.get<git.ICommit>(`/git/commits/${encodeURIComponent(sha)}`);
    }

    public createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.post<git.ICommit>(`/git/commits`, commit);
    }

    public getRefs(): Promise<git.IRef[]> {
        return this.get(`/git/refs`);
    }

    public getRef(ref: string): Promise<git.IRef> {
        return this.get(`/git/refs/${ref}`);
    }

    public createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        return this.post(`/git/refs`, params);
    }

    public updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.patch(`/git/refs/${ref}`, params);
    }

    public async deleteRef(ref: string): Promise<void> {
        await this.delete(`/git/refs/${ref}`);
    }

    public createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.post(`/git/tags`, tag);
    }

    public getTag(tag: string): Promise<git.ITag> {
        return this.get(`/git/tags/${tag}`);
    }

    public createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        return this.post<git.ITree>(`/git/trees`, tree);
    }

    public getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
        return this.get<git.ITree>(
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

    private get<T>(url: string): Promise<T> {
        const options: AxiosRequestConfig = {
            headers: {
            },
            maxContentLength: 1000 * 1024 * 1024,
            method: "GET",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 200);
    }

    private post<T>(url: string, requestBody: any): Promise<T> {
        const options: AxiosRequestConfig = {
            data: requestBody,
            headers: {
            },
            maxContentLength: 1000 * 1024 * 1024,
            method: "POST",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 201);
    }

    private delete<T>(url: string): Promise<T> {
        const options: AxiosRequestConfig = {
            headers: {
            },
            maxContentLength: 1000 * 1024 * 1024,
            method: "DELETE",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 204);
    }

    private patch<T>(url: string, requestBody: any): Promise<T> {
        const options: AxiosRequestConfig = {
            data: requestBody,
            headers: {
            },
            maxContentLength: 1000 * 1024 * 1024,
            method: "PATCH",
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 200);
    }

    private async request<T>(options: AxiosRequestConfig, statusCode: number): Promise<T> {
        if (this.authorization) {
            options.headers.Authorization = this.authorization;
        }

        // Append cache param if requested
        if (this.disableCache && this.historianApi) {
            options.url = `${options.url}?disableCache`;
        } else if (this.disableCache) {
            options.url = `${options.url}?cacheBust=${Date.now()}`;
        }

        const response = await axios.request<T>(options)
            .catch((error) => error.response && error.response.status !== statusCode
                ? Promise.reject(error.response.status)
                : Promise.reject(error));
        return response.data;
    }
}
