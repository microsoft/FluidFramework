import * as git from "gitresources";
import * as querystring from "querystring";
import * as request from "request";
import * as winston from "winston";
import { ICache, IGitService } from "./definitions";

export class RestGitService implements IGitService {
    constructor(private gitServerUrl: string, private cache: ICache) {
    }

    public getBlob(repo: string, sha: string): Promise<git.IBlob> {
        return this.resolveFromCache(
            sha,
            () => this.get<git.IBlob>(`/repos/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`));
    }

    public async createBlob(repo: string, blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        const createResults = await this.post<git.ICreateBlobResponse>(
            `/repos/${encodeURIComponent(repo)}/git/blobs`,
            blob);

        // Fetch the full blob so we can have it in cache
        this.getBlob(repo, createResults.sha).catch((error) => {
            winston.error(`Error fetching blob ${createResults.sha}`);
        });

        return createResults;
    }

    public getContent(repo: string, path: string, ref: string): Promise<any> {
        const query = querystring.stringify({ ref });
        return this.get(`/repos/${encodeURIComponent(repo)}/contents/${path}?${query}`);
    }

    public getCommits(repo: string, sha: string, count: number): Promise<git.ICommit[]> {
        const query = querystring.stringify({
            count,
            sha,
        });
        return this.get(`/repos/${encodeURIComponent(repo)}/commits?${query}`);
    }

    public async getCommit(repo: string, sha: string): Promise<git.ICommit> {
        return this.resolveFromCache(
            sha,
            () => this.get<git.ICommit>(`/repos/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`));
    }

    public async createCommit(repo: string, commitParams: git.ICreateCommitParams): Promise<git.ICommit> {
        const commit = await this.post<git.ICommit>(`/repos/${encodeURIComponent(repo)}/git/commits`, commitParams);

        this.setCache(commit.sha, commit);
        // Also fetch the tree for the commit to have it in cache
        this.getTree(repo, commit.tree.sha, true).catch((error) => {
            winston.error(`Error fetching commit tree ${commit.tree.sha}`);
        });

        return commit;
    }

    public getRefs(repo: string): Promise<git.IRef[]> {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/refs`);
    }

    public getRef(repo: string, ref: string): Promise<git.IRef> {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/refs/${ref}`);
    }

    public createRef(repo: string, params: git.ICreateRefParams): Promise<git.IRef> {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/refs`, params);
    }

    public updateRef(repo: string, ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.patch(`/repos/${encodeURIComponent(repo)}/git/refs/${ref}`, params);
    }

    public deleteRef(repo: string, ref: string): Promise<void> {
        return this.delete(`/repos/${encodeURIComponent(repo)}/git/refs/${ref}`);
    }

    public createRepo(repo: git.ICreateRepoParams): Promise<any> {
        winston.info(`Create ${repo.name}`);
        return this.post(`/repos`, repo);
    }

    public getRepo(repo: string): Promise<any> {
        return this.get(`/repos/${encodeURIComponent(repo)}`);
    }

    public createTag(repo: string, tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.post(`/repos/${encodeURIComponent(repo)}/git/tags`, tag);
    }

    public getTag(repo: string, tag: string): Promise<git.ITag> {
        return this.get(`/repos/${encodeURIComponent(repo)}/git/tags/${tag}`);
    }

    public async createTree(repo: string, treeParams: git.ICreateTreeParams): Promise<git.ITree> {
        const tree = await this.post<git.ITree>(`/repos/${encodeURIComponent(repo)}/git/trees`, treeParams);

        this.setCache(tree.sha, tree);

        return tree;
    }

    public getTree(repo: string, sha: string, recursive: boolean): Promise<git.ITree> {
        const key = recursive ? `${sha}:recursive` : sha;
        return this.resolveFromCache(
            key,
            () => {
                const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
                return this.get<git.ITree>(
                    `/repos/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?${query}`);
            });
    }

    private get<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            json: true,
            method: "GET",
            url: `${this.gitServerUrl}${url}`,
        };
        return this.request(options, 200);
    }

    private post<T>(url: string, requestBody: any): Promise<T> {
        const options: request.OptionsWithUrl = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
            },
            json: true,
            method: "POST",
            url: `${this.gitServerUrl}${url}`,
        };
        return this.request(options, 201);
    }

    private delete<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            method: "DELETE",
            url: `${this.gitServerUrl}${url}`,
        };
        return this.request(options, 204);
    }

    private patch<T>(url: string, requestBody: any): Promise<T> {
        const options: request.OptionsWithUrl = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
            },
            json: true,
            method: "PATCH",
            url: `${this.gitServerUrl}${url}`,
        };
        return this.request(options, 200);
    }

    private request<T>(options: request.OptionsWithUrl, statusCode: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            request(
                options,
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== statusCode) {
                        return reject(response.statusCode);
                    } else {
                        return resolve(response.body);
                    }
                });
        });
    }

    /**
     * Caches the given key/value pair. Will log any errors with the cache.
     */
    private setCache<T>(key: string, value: T) {
        // Attempt to cache to Redis - log any errors but don't fail
        this.cache.set(key, value).catch((error) => {
            winston.error(`Error caching ${key} to redis`, error);
        });
    }

    private async resolveFromCache<T>(key: string, fetch: () => Promise<T>): Promise<T> {
        // Attempt to grab the value from the cache. Log any errors but don't fail the request
        const cachedValue = await this.cache.get<T>(key).catch((error) => {
            winston.error(`Error fetching ${key} from cache`, error);
            return null;
        });

        if (cachedValue) {
            winston.info(`Resolving ${key} from cache`);
            return cachedValue;
        }

        // Value is not cached - fetch it with the provided function and then cache the value
        winston.info(`Fetching ${key}`);
        const value = await fetch();
        this.setCache(key, value);

        return value;
    }
}
