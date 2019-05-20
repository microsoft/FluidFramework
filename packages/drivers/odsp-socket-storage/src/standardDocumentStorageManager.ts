import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { RestWrapper } from "@prague/services-client";
import { IDocumentStorageGetVersionsResponse } from "./contracts";
import { TokenProvider } from "./token";

export interface IDocumentStorageManager {
    createBlob(file: Buffer): Promise<resources.ICreateBlobResponse>;
    getBlob(blobid: string): Promise<resources.IBlob>;
    getContent(version: api.IVersion, path: string): Promise<resources.IBlob>;
    getRawUrl(blobid: string): string;
    getTree(version?: api.IVersion): Promise<resources.ITree | null>;
    getVersions(blobid: string, count: number): Promise<api.IVersion[]>;
    write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion | undefined>;
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
        return Promise.reject(new Error("StandardDocumentStorageManager.createBlob() not implemented"));
    }

    public async getTree(version?: api.IVersion): Promise<resources.ITree | null> {
        // header-id is the id (or version) of the snapshot. To retrieve the latest version of the snapshot header, use the keyword "latest" as the header-id.
        const id = (version && version.id) ? version.id : "latest";
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
    public async getVersions(blobid: string, count: number): Promise<api.IVersion[]> {
        if (blobid && blobid !== this.documentId) {
            // each commit calls getVersions but odsp doesn't have a history for each version
            // return the blobid as is

            return [
                {
                    id: blobid,
                    treeId: undefined!,
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
                    id: version.sha,
                    treeId: undefined!,
                };
            });
        }

        return [];
    }
    // tslint:enable: no-non-null-assertion

    public async getContent(version: api.IVersion, path: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>("/contents", { ref: version.id, path });
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion | undefined> {
        // TODO: Implement
        return undefined;
    }

    public getRawUrl(blobid: string): string {
        return `${this.snapshotUrl}/blobs/${blobid}`;
    }
}
