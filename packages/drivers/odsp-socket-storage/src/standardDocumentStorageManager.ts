import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { RestWrapper } from "@prague/services-client";
import { IDocumentStorageGetVersionsResponse } from "./contracts";
import { TokenProvider } from "./token";

export interface IDocumentStorageManager {
    createBlob(file: Buffer): Promise<resources.ICreateBlobResponse | undefined>;
    getBlob(blobid: string): Promise<resources.IBlob>;
    getContent(version: resources.ICommit, path: string): Promise<resources.IBlob>;
    getRawUrl(blobid: string): string;
    getTree(version?: resources.ICommit): Promise<resources.ITree | null>;
    getVersions(blobid: string, count: number): Promise<resources.ICommit[]>;
    write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit | undefined>;
}

export class StandardDocumentStorageManager implements IDocumentStorageManager {
    private readonly restWrapper: RestWrapper;

    constructor(
        private readonly documentId: string,
        private readonly snapshotUrl: string,
        tokenProvider: api.ITokenProvider) {
        const standardTokenProvider = tokenProvider as TokenProvider;

        this.restWrapper = new RestWrapper(
            snapshotUrl,
            standardTokenProvider.getStorageHeaders(),
            standardTokenProvider.getStorageQueryParams());
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse | undefined> {
        // TODO: Implement
        return undefined;
    }

    public async getTree(version?: resources.ICommit): Promise<resources.ITree | null> {
        // header-id is the id (or version) of the snapshot. To retrieve the latest version of the snapshot header, use the keyword "latest" as the header-id.
        const id = (version && version.sha) ? version.sha : "latest";
        const tree = await this.restWrapper.get<resources.ITree>(`/trees/${id}`)
            .catch((error) => (error === 400 || error === 404) ? error : Promise.reject(error));
        if (!tree || !tree.tree) {
            return null;
        }

        return tree;
    }

    public async getBlob(blobid: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>(`/blobs/${blobid}`);
    }

    // tslint:disable: no-non-null-assertion
    public async getVersions(blobid: string, count: number): Promise<resources.ICommit[]> {
        if (blobid && blobid !== this.documentId) {
            // each commit calls getVersions but odsp doesn't have a history for each version
            // return the blobid as is

            return [
                {
                    author: undefined!,
                    committer: undefined!,
                    message: "",
                    parents: undefined!,
                    sha: blobid,
                    tree: undefined!,
                    url: undefined!,
                },
            ];
        }

        // fetch the latest snapshot versions for the document
        const versionsResponse = await this.restWrapper
            .get<IDocumentStorageGetVersionsResponse>("/versions", { count })
            .catch<IDocumentStorageGetVersionsResponse>((error) => (error === 400 || error === 404) ? error : Promise.reject(error));
        if (versionsResponse && Array.isArray(versionsResponse.value)) {
            return versionsResponse.value.map((version) => {
                return {
                    author: undefined!,
                    committer: undefined!,
                    message: version.message,
                    parents: undefined!,
                    sha: version.sha,
                    tree: undefined!,
                    url: undefined!,
                };
            });
        }

        return [];
    }
    // tslint:enable: no-non-null-assertion

    public async getContent(version: resources.ICommit, path: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>("/contents", { ref: version.sha, path });
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit | undefined> {
        // TODO: Implement
        return undefined;
    }

    public getRawUrl(blobid: string): string {
        return `${this.snapshotUrl}/blobs/${blobid}`;
    }
}
