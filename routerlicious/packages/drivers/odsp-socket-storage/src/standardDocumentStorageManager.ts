import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { RestWrapper } from "@prague/services-client";
import { IDocumentStorageGetVersionsResponse } from "./contracts";
import { TokenProvider } from "./token";

export interface IDocumentStorageManager {
    createBlob(file: Buffer): Promise<resources.ICreateBlobResponse>;
    getBlob(blobid: string): Promise<resources.IBlob>;
    getContent(version: resources.ICommit, path: string): Promise<resources.IBlob>;
    getRawUrl(blobid: string): string;
    getTree(version?: resources.ICommit): Promise<resources.ITree>;
    getVersions(blobid: string, count: number): Promise<resources.ICommit[]>;
    write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit>;
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

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        // TODO: Implement
        return undefined;
    }

    public async getTree(version?: resources.ICommit): Promise<resources.ITree> {
        // header-id is the id (or version) of the snapshot. To retrieve the latest version of the snapshot header, use the keyword "latest" as the header-id.
        const id = (version && version.sha) ? version.sha : "latest";
        const tree = this.restWrapper.get<resources.ITree>(`/trees/${id}`)
            .catch((error) => (error === 400 || error === 404) ? undefined : Promise.reject(error));
        if (!tree) {
            return null;
        }

        return tree;
    }

    public async getBlob(blobid: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>(`/blobs/${blobid}`);
    }

    public async getVersions(blobid: string, count: number): Promise<resources.ICommit[]> {
        if (blobid && blobid !== this.documentId) {
            // each commit calls getVersions but odsp doesn't have a history for each version
            // return the blobid as is
            return [
                {
                    message: "",
                    sha: blobid,
                } as any,
            ];
        }

        // fetch the latest snapshot versions for the document
        const versionsResponse = await this.restWrapper
            .get<IDocumentStorageGetVersionsResponse>("/versions", { count })
            .catch((error) => (error === 400 || error === 404) ? undefined : Promise.reject(error));
        if (versionsResponse && Array.isArray(versionsResponse.value)) {
            return versionsResponse.value;
        }

        return [];
    }

    public async getContent(version: resources.ICommit, path: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>("/contents", { ref: version.sha, path });
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit> {
        // TODO: Implement
        return undefined;
    }

    public getRawUrl(blobid: string): string {
        return `${this.snapshotUrl}/blobs/${blobid}`;
    }
}
