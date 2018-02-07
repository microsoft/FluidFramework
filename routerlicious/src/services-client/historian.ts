import * as git from "gitresources";
import * as querystring from "querystring";
import * as request from "request";

interface ITree {
    blobs: { [path: string]: string };
    trees: { [path: string]: ITree };
}

function buildHierarchy(flatTree: git.ITree): ITree {
    const lookup: { [path: string]: ITree } = {};
    const root: ITree = { blobs: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.tree) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex  + 1);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree = { blobs: {}, trees: {} };
            node.trees[entryPathBase] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[entryPathBase] = entry.sha;
        }
    }

    return root;
}

/**
 * Implementation of the IHistorian interface that calls out to a REST interface
 */
export class Historian implements git.IHistorian {
    private authorization: string;

    constructor(
        private endpoint: string,
        private historianApi: boolean,
        private disableCache: boolean,
        credentials?) {

        if (credentials) {
            this.authorization =
                `Basic ${new Buffer(`${credentials.user}:${credentials.password}`).toString("base64")}`;
        }
    }

    public getHeader(owner: string, repo: string, sha: string): Promise<any> {
        if (this.historianApi) {
            return this.get(`/repos/${this.getRepoPath(owner, repo)}/headers/${encodeURIComponent(sha)}`);
        } else {
            return this.getHeaderDirect(owner, repo, sha);
        }
    }

    public getBlob(owner: string, repo: string, sha: string): Promise<git.IBlob> {
        return this.get<git.IBlob>(`/repos/${this.getRepoPath(owner, repo)}/git/blobs/${encodeURIComponent(sha)}`);
    }

    public createBlob(owner: string, repo: string, blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        return this.post<git.ICreateBlobResponse>(`/repos/${this.getRepoPath(owner, repo)}/git/blobs`, blob);
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
        return this.get<git.ICommitDetails[]>(`/repos/${this.getRepoPath(owner, repo)}/commits?${query}`)
            .catch((error) => error === 400 ? [] as git.ICommitDetails[] : Promise.reject<git.ICommitDetails[]>(error));
    }

    public getCommit(owner: string, repo: string, sha: string): Promise<git.ICommit> {
        return this.get<git.ICommit>(`/repos/${this.getRepoPath(owner, repo)}/git/commits/${encodeURIComponent(sha)}`);
    }

    public createCommit(owner: string, repo: string, commit: git.ICreateCommitParams): Promise<git.ICommit> {
        return this.post<git.ICommit>(`/repos/${this.getRepoPath(owner, repo)}/git/commits`, commit);
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

    public async deleteRef(owner: string, repo: string, ref: string): Promise<void> {
        await this.delete(`/repos/${this.getRepoPath(owner, repo)}/git/refs/${ref}`);
    }

    public createRepo(owner: string, repo: git.ICreateRepoParams): Promise<any> {
        console.log(`Historian Create Repo: ${this.endpoint} ${owner}/${repo.name}`);
        return this.post(`/${owner}/repos`, repo);
    }

    public getRepo(owner: string, repo: string): Promise<any> {
        console.log(`Historian Get Repo: ${this.endpoint} ${owner}/${repo}`);
        return this.get(`/repos/${this.getRepoPath(owner, repo)}`)
            .catch((error) => error === 400 ? null : Promise.resolve(error));
    }

    public createTag(owner: string, repo: string, tag: git.ICreateTagParams): Promise<git.ITag> {
        return this.post(`/repos/${this.getRepoPath(owner, repo)}/git/tags`, tag);
    }

    public getTag(owner: string, repo: string, tag: string): Promise<git.ITag> {
        return this.get(`/repos/${this.getRepoPath(owner, repo)}/git/tags/${tag}`);
    }

    public createTree(owner: string, repo: string, tree: git.ICreateTreeParams): Promise<git.ITree> {
        return this.post<git.ITree>(`/repos/${this.getRepoPath(owner, repo)}/git/trees`, tree);
    }

    public getTree(owner: string, repo: string, sha: string, recursive: boolean): Promise<git.ITree> {
        const query = querystring.stringify({ recursive: recursive ? 1 : 0 });
        return this.get<git.ITree>(
            `/repos/${this.getRepoPath(owner, repo)}/git/trees/${encodeURIComponent(sha)}?${query}`);
    }

    private async getHeaderDirect(owner: string, repo: string, sha: string) {
        const version = await this.getCommit(owner, repo, sha);

        // NOTE we currently grab the entire repository. Should this ever become a bottleneck we can move to manually
        // walking and looking for entries. But this will requre more round trips.
        const rawTree = await this.getTree(owner, repo, version.tree.sha, true);
        const tree = buildHierarchy(rawTree);

        // Pull out the root attributes file
        const docAttributesSha = tree.blobs[".attributes"];
        const objectBlobs: Array<{ id: string, headerSha: string, attributesSha: string }> = [];
        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            const entry = tree.trees[path];
            objectBlobs.push({ id: path, headerSha: entry.blobs.header, attributesSha: entry.blobs[".attributes"] });
        }

        // Pull in transformed messages between the msn and the reference
        const messagesSha = tree.blobs[".messages"];
        const messagesP = this.getBlob(owner, repo, messagesSha).then((messages) => {
            const messagesJSON = Buffer.from(messages.content, "base64").toString();
            return JSON.parse(messagesJSON); // as api.ISequencedDocumentMessage[];
        });

        // Fetch the attributes and distirbuted object headers
        const docAttributesP = this.getBlob(owner, repo, docAttributesSha).then((docAttributes) => {
            const attributes = Buffer.from(docAttributes.content, "base64").toString();
            return JSON.parse(attributes); // as api.IDocumentAttributes;
        });

        const blobsP: Array<Promise<any>> = [];
        for (const blob of objectBlobs) {
            const headerP = this.getBlob(owner, repo, blob.headerSha).then((header) => header.content);
            const attributesP = this.getBlob(owner, repo, blob.attributesSha).then((objectType) => {
                const attributes = Buffer.from(objectType.content, "base64").toString();
                return JSON.parse(attributes); // as api.IObjectAttributes;
            });
            blobsP.push(Promise.all([Promise.resolve(blob.id), headerP, attributesP]));
        }

        const fetched = await Promise.all([docAttributesP, Promise.all(blobsP), messagesP]);
        const result = {
            attributes: fetched[0],
            distributedObjects: fetched[1].map((fetch) => ({
                    header: fetch[1],
                    id: fetch[0],
                    sequenceNumber: fetch[2].sequenceNumber,
                    type: fetch[2].type,
            })),
            transformedMessages: fetched[2],
            tree,
        }; // as api.IDocumentHeader

        return result;
    }

    private getRepoPath(owner: string, repo: string): string {
        return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    }

    private get<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            headers: {
            },
            json: true,
            method: "GET",
            url: `${this.endpoint}${url}`,
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
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 201);
    }

    private delete<T>(url: string): Promise<T> {
        const options: request.OptionsWithUrl = {
            headers: {
            },
            method: "DELETE",
            url: `${this.endpoint}${url}`,
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
            url: `${this.endpoint}${url}`,
        };
        return this.request(options, 200);
    }

    private request<T>(options: request.OptionsWithUrl, statusCode: number): Promise<T> {
        if (this.authorization) {
            options.headers.Authorization = this.authorization;
        }

        // Append cache param if requested
        if (this.disableCache && this.historianApi) {
            options.url = `${options.url}?disableCache`;
        } else if (this.disableCache) {
            options.url = `${options.url}?cacheBust=${Date.now()}`;
        }

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
}
