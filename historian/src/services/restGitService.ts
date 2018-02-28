import * as git from "gitresources";
import * as _ from "lodash";
import * as pathApi from "path";
import * as querystring from "querystring";
import * as request from "request";
import * as winston from "winston";
import { ICache, ICredentials } from "./definitions";

export interface IDocument {
    existing: boolean;
    docPrivateKey: string;
    docPublicKey: string;
}

/**
 * Interface used to go from the flat tree structure returned by the git manager to a hierarchy for easier
 * processing
 */
interface ITree {
    blobs: { [path: string]: string };
    trees: { [path: string]: ITree };
}

function buildHierarchy(flatTree: git.ITree): ITree {
    const lookup: { [path: string]: ITree } = {};
    const root: ITree = { blobs: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.tree) {
        const entryPath = pathApi.parse(entry.path);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPath.dir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree = { blobs: {}, trees: {} };
            node.trees[entryPath.base] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[entryPath.base] = entry.sha;
        }
    }

    return root;
}

function endsWith(value: string, endings: string[]): boolean {
    for (const ending of endings) {
        if (value.endsWith(ending)) {
            return true;
        }
    }

    return false;
}

export class RestGitService {
    private authHeader: string;

    constructor(
        private gitServerUrl: string,
        credentials: ICredentials,
        private cache: ICache,
        private userAgent: string,
        private defaultOwner: string) {

        if (credentials) {
            this.authHeader = `Basic ${new Buffer(`${credentials.user}:${credentials.password}`).toString("base64")}`;
        }
    }

    public getBlob(owner: string, repo: string, sha: string, useCache: boolean): Promise<git.IBlob> {
        return this.resolve(
            sha,
            () => this.get<git.IBlob>(`/repos/${this.getRepoPath(owner, repo)}/git/blobs/${encodeURIComponent(sha)}`),
            useCache);
    }

    public async createBlob(
        owner: string,
        repo: string,
        blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {

        const createResults = await this.post<git.ICreateBlobResponse>(
            `/repos/${this.getRepoPath(owner, repo)}/git/blobs`,
            blob);

        // Fetch the full blob so we can have it in cache
        this.getBlob(owner, repo, createResults.sha, true).catch((error) => {
            winston.error(`Error fetching blob ${createResults.sha}`);
        });

        return createResults;
    }

    public getContent(owner: string, repo: string, path: string, ref: string): Promise<any> {
        const query = querystring.stringify({ ref });
        return this.get(`/repos/${this.getRepoPath(owner, repo)}/contents/${path}?${query}`);
    }

    public getCommits(owner: string, repo: string, sha: string, count: number): Promise<git.ICommitDetails[]> {
        const query = querystring.stringify({
            count,
            sha,
        });
        return this.get(`/repos/${this.getRepoPath(owner, repo)}/commits?${query}`);
    }

    public async getCommit(owner: string, repo: string, sha: string, useCache: boolean): Promise<git.ICommit> {
        return this.resolve(
            sha,
            () => this.get<git.ICommit>(
                `/repos/${this.getRepoPath(owner, repo)}/git/commits/${encodeURIComponent(sha)}`),
            useCache);
    }

    public async createCommit(
        owner: string,
        repo: string,
        commitParams: git.ICreateCommitParams): Promise<git.ICommit> {

        const commit = await this.post<git.ICommit>(
            `/repos/${this.getRepoPath(owner, repo)}/git/commits`,
            commitParams);

        this.setCache(commit.sha, commit);

        // Also fetch the tree for the commit to have it in cache
        this.getTree(owner, repo, commit.tree.sha, true, true).catch((error) => {
            winston.error(`Error fetching commit tree ${commit.tree.sha}`);
        });
        // ... as well as pull in the header for it
        this.getHeader(owner, repo, commit.sha, true).catch((error) => {
            winston.error(`Error fetching header ${commit.sha}`);
        });

        return commit;
    }

    public getRefs(owner: string, repo: string): Promise<git.IRef[]> {
        return this.get(`/repos/${this.getRepoPath(owner, repo)}/git/refs`);
    }

    public getRef(owner: string, repo: string, ref: string): Promise<git.IRef> {
        return this.get(`/repos/${this.getRepoPath(owner, repo)}/git/refs/${ref}`);
    }

    public createRef(owner: string, repo: string, params: git.ICreateRefParams): Promise<git.IRef> {
        return this.post(`/repos/${this.getRepoPath(owner, repo)}/git/refs`, params);
    }

    public updateRef(owner: string, repo: string, ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        return this.patch(`/repos/${this.getRepoPath(owner, repo)}/git/refs/${ref}`, params);
    }

    public deleteRef(owner: string, repo: string, ref: string): Promise<void> {
        return this.delete(`/repos/${this.getRepoPath(owner, repo)}/git/refs/${ref}`);
    }

    public createRepo(owner: string, repo: git.ICreateRepoParams): Promise<any> {
        return this.post(`${owner ? `/${owner}` : ""}/repos`, repo);
    }

    public getRepo(owner: string, repo: string): Promise<any> {
        return this.get(`/repos/${this.getRepoPath(owner, repo)}`);
    }

    public createTag(owner: string, repo: string, tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.post(`/repos/${this.getRepoPath(owner, repo)}/git/tags`, tag);
    }

    public getTag(owner: string, repo: string, tag: string): Promise<git.ITag> {
        return this.get(`/repos/${this.getRepoPath(owner, repo)}/git/tags/${tag}`);
    }

    public async createTree(owner: string, repo: string, treeParams: git.ICreateTreeParams): Promise<git.ITree> {
        const tree = await this.post<git.ITree>(`/repos/${this.getRepoPath(owner, repo)}/git/trees`, treeParams);

        this.setCache(tree.sha, tree);

        return tree;
    }

    public getTree(
        owner: string,
        repo: string,
        sha: string,
        recursive: boolean,
        useCache: boolean): Promise<git.ITree> {

        const key = recursive ? `${sha}:recursive` : sha;
        return this.resolve(
            key,
            () => {
                const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
                return this.get<git.ITree>(
                    `/repos/${this.getRepoPath(owner, repo)}/git/trees/${encodeURIComponent(sha)}?${query}`);
            },
            useCache);
    }

    public async getHeader(owner: string, repo: string, sha: string, useCache: boolean): Promise<git.IHeader> {
        const version = await this.getCommit(owner, repo, sha, useCache);

        const key = `${version.sha}:header`;
        return this.resolve(
            key,
            async () => {
                const rawTree = await this.getTree(owner, repo, version.tree.sha, true, useCache);
                const legacyHeaderP = this.getLegacyHeader(owner, repo, rawTree, useCache);
                const blobsP = this.getHeaderBlobs(owner, repo, rawTree, useCache);

                const [legacyHeader, blobs] = await Promise.all([legacyHeaderP, blobsP]);
                return {
                    attributes: legacyHeader.attributes,
                    blobs,
                    distributedObjects: legacyHeader.distributedObjects,
                    transformedMessages: legacyHeader.transformedMessages,
                    tree: _.extend(rawTree, legacyHeader.tree),
                };
            },
            useCache);
    }

    /**
     * Helper method to translate from an owner repo pair to the URL component for it. In the future we will require
     * the owner parameter. But for back compat we allow it to be optional.
     */
    private getRepoPath(owner: string, repo: string): string {
        owner = owner ? owner : this.defaultOwner;
        return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    }

    private async getLegacyHeader(owner: string, repo: string, rawTree: git.ITree, useCache: boolean) {
        const tree = buildHierarchy(rawTree);

        // Pull out the root attributes file
        const objectBlobs: Array<{ id: string, attributesSha: string }> = [];
        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            const entry = tree.trees[path];
            objectBlobs.push({ id: path, attributesSha: entry.blobs[".attributes"] });
        }

        // Pull in transformed messages between the msn and the reference
        const messagesSha = tree.blobs[".messages"];
        const messagesP = this.getBlob(owner, repo, messagesSha, useCache).then((messages) => {
            const messagesJSON = Buffer.from(messages.content, "base64").toString();
            return JSON.parse(messagesJSON);
        });

        // Fetch the attributes and distirbuted object headers
        const docAttributesSha = tree.blobs[".attributes"];
        const docAttributesP = this.getBlob(owner, repo, docAttributesSha, useCache).then((docAttributes) => {
            const attributes = Buffer.from(docAttributes.content, "base64").toString();
            return JSON.parse(attributes);
        });

        const blobsP: Array<Promise<[string, any]>> = [];
        for (const blob of objectBlobs) {
            const attributesP = this.getBlob(owner, repo, blob.attributesSha, useCache).then((objectType) => {
                const attributes = Buffer.from(objectType.content, "base64").toString();
                return JSON.parse(attributes); // as api.IObjectAttributes;
            });
            blobsP.push(Promise.all([Promise.resolve(blob.id), attributesP]));
        }

        const fetched = await Promise.all([docAttributesP, Promise.all(blobsP), messagesP]);
        return {
            attributes: fetched[0],
            distributedObjects: fetched[1].map((fetch) => {
                const distributedObject = {
                    id: fetch[0],
                    sequenceNumber: fetch[1].sequenceNumber,
                    type: fetch[1].type,
                };
                return distributedObject;
            }),
            transformedMessages: fetched[2],
            tree,
        };
    }

    private getHeaderBlobs(
        owner: string,
        repo: string,
        tree: git.ITree,
        useCache: boolean): Promise<git.IBlob[]> {

        // List of blobs that will be included within the cached list of headers
        const includeBlobs = [".attributes", ".messages", "header"];

        const blobsP: Array<Promise<git.IBlob>> = [];
        for (const entry of tree.tree) {
            if (entry.type === "blob" && endsWith(entry.path, includeBlobs)) {
                const blobP = this.getBlob(owner, repo, entry.sha, useCache);
                blobsP.push(blobP);
            }
        }

        return Promise.all(blobsP);
    }

    private get<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            headers: {
                "User-Agent": this.userAgent,
            },
            json: true,
            method: "GET",
            url: `${this.gitServerUrl}${url}`,
        };
        this.authorize(options);

        return this.request(options, 200);
    }

    private post<T>(url: string, requestBody: any): Promise<T> {
        const options: request.OptionsWithUrl = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.userAgent,
            },
            json: true,
            method: "POST",
            url: `${this.gitServerUrl}${url}`,
        };
        this.authorize(options);

        return this.request(options, 201);
    }

    private delete<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            headers: {
                "User-Agent": this.userAgent,
            },
            method: "DELETE",
            url: `${this.gitServerUrl}${url}`,
        };
        this.authorize(options);

        return this.request(options, 204);
    }

    private patch<T>(url: string, requestBody: any): Promise<T> {
        const options: request.OptionsWithUrl = {
            body: requestBody,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": this.userAgent,
            },
            json: true,
            method: "PATCH",
            url: `${this.gitServerUrl}${url}`,
        };
        this.authorize(options);

        return this.request(options, 200);
    }

    /**
     * Updates the provided options with authorization information
     */
    private authorize(options: request.OptionsWithUrl) {
        if (this.authHeader) {
            options.headers.Authorization = this.authHeader;
        }
    }

    private request<T>(options: request.OptionsWithUrl, statusCode: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            request(
                options,
                (error, response, body) => {
                    if (error) {
                        return reject(error);
                    } else if (response.statusCode !== statusCode) {
                        winston.info(response.body);
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

    private async resolve<T>(key: string, fetch: () => Promise<T>, useCache: boolean): Promise<T> {
        if (useCache) {
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
        } else {
            return fetch();
        }
    }
}
