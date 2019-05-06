import {
    IDocumentStorageService,
    ISnapshotTree,
    ITree,
} from "@prague/container-definitions";
import {
    ICommit,
    ICreateBlobResponse,
} from "@prague/gitresources";

export class ComponentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return this.storageService.repositoryUrl;
    }

    constructor(private storageService: IDocumentStorageService, private blobs: Map<string, string>) {
    }

    // TODO Will a subcomponent ever need this? Or we can probably restrict the ref to itself
    public getSnapshotTree(version: ICommit): Promise<ISnapshotTree> {
        return this.storageService.getSnapshotTree(version);
    }

    public getVersions(commitId: string, count: number): Promise<ICommit[]> {
        return this.storageService.getVersions(commitId, count);
    }

    public getContent(version: ICommit, path: string): Promise<string> {
        return this.storageService.getContent(version, path);
    }

    public async read(id: string): Promise<string> {
        if (this.blobs.has(id)) {
            return this.blobs.get(id);
        }

        return this.storageService.read(id);
    }

    // TODO the write as well potentially doesn't seem necessary
    public write(root: ITree, parents: string[], message: string, ref: string): Promise<ICommit> {
        return this.storageService.write(root, parents, message, ref);
    }

    public createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storageService.createBlob(file);
    }

    public getRawUrl(blobId: string): string {
        return this.storageService.getRawUrl(blobId);
    }
}
