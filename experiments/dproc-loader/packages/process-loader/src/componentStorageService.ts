import {
    ICommit,
    ICreateBlobResponse,
} from "@prague/gitresources";
import {
    IDocumentStorageService,
    ISnapshotTree,
    ITree,
} from "@prague/runtime-definitions";

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

    public getVersions(sha: string, count: number): Promise<ICommit[]> {
        return this.storageService.getVersions(sha, count);
    }

    public getContent(version: ICommit, path: string): Promise<string> {
        return this.storageService.getContent(version, path);
    }

    public async read(sha: string): Promise<string> {
        if (this.blobs.has(sha)) {
            return this.blobs.get(sha);
        }

        return this.storageService.read(sha);
    }

    // TODO the write as well potentially doesn't seem necessary
    public write(root: ITree, parents: string[], message: string, ref: string): Promise<ICommit> {
        return this.storageService.write(root, parents, message, ref);
    }

    public createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storageService.createBlob(file);
    }

    public getRawUrl(sha: string): string {
        return this.storageService.getRawUrl(sha);
    }
}
