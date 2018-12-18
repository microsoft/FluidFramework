import * as resources from "@prague/gitresources";
import * as api from "@prague/runtime-definitions";
import { RestWrapper } from "@prague/services-client";
import { TokenProvider } from "./token";

export interface IDocumentStorageManager {
    createBlob(file: Buffer): Promise<resources.ICreateBlobResponse>;
    getBlob(blobid: string): Promise<resources.IBlob>;
    getContent(version: resources.ICommit, path: string): Promise<resources.IBlob>;
    getRawUrl(blobid: string): string;
    getTree(version: resources.ICommit): Promise<resources.ITree>;
    getVersions(blobid: string, count: number): Promise<resources.ICommit[]>;
    write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit>;
}

export class StandardDocumentStorageManager implements IDocumentStorageManager {
    private readonly restWrapper: RestWrapper;

    constructor(private readonly snapshotUrl: string, tokenProvider?: api.ITokenProvider) {
        let defaultHeaders: {};
        const token = (tokenProvider as TokenProvider);
        if (token && token.storageToken) {
            defaultHeaders = {
                Authorization: `Bearer ${token.storageToken}`,
            };
        }

        this.restWrapper = new RestWrapper(snapshotUrl, defaultHeaders);
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        // TODO: Implement
        return undefined;
    }

    public async getTree(version?: resources.ICommit): Promise<resources.ITree> {
        // header-id is the id( or version) of the snapshot. To retrieve the latest version of the snapshot header, use the keyword "latest" as the header-id.
        let id = "latest";
        if (!version && !version.sha) {
            id = version.sha;
        }

        // TODO: update this to call /trees/ when SPO implements that over headers
        return this.restWrapper.get<resources.ITree>(`/headers/${id}`);
    }

    public async getBlob(blobid: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>(`/blobs/${blobid}`);
    }

    public async getVersions(blobid: string, count: number): Promise<resources.ICommit[]> {
        return this.restWrapper.get<resources.ICommit[]>("/versions", { count });
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
