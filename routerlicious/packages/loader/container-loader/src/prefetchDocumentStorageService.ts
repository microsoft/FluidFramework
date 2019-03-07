import { IDocumentStorageService, ISnapshotTree, ITree } from "@prague/container-definitions";
import { ICommit, ICreateBlobResponse } from "@prague/gitresources";
import { debug } from "./debug";

export class PrefetchDocumentStorageService implements IDocumentStorageService {
    // SHA -> blob prefetchCache cache
    private prefetchCache = new Map<string, Promise<string>>();
    private prefetchEnabled = true;

    constructor(private storage: IDocumentStorageService) {
    }

    public get repositoryUrl(): string {
        return this.storage.repositoryUrl;
    }

    public getSnapshotTree(version?: ICommit): Promise<ISnapshotTree> {
        const p = this.storage.getSnapshotTree(version);
        if (p && this.prefetchEnabled) {
            // We don't care if the prefetch succeed
            // tslint:disable-next-line:no-floating-promises
            p.then((tree: ISnapshotTree) => {
                if (!tree) { return; }
                this.prefetchTree(tree);
            });
        }
        return p;
    }

    public async getVersions(sha: string, count: number): Promise<ICommit[]> {
        return this.storage.getVersions(sha, count);
    }

    public async read(sha: string): Promise<string> {
        return this.cachedRead(sha);
    }

    public async getContent(version: ICommit, path: string): Promise<string> {
        return this.storage.getContent(version, path);
    }

    public write(tree: ITree, parents: string[], message: string, ref: string): Promise<ICommit> {
        return this.storage.write(tree, parents, message, ref);
    }

    public async createBlob(file: Buffer): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }

    public getRawUrl(sha: string): string {
        return this.storage.getRawUrl(sha);
    }

    public stopPrefetch() {
        this.prefetchEnabled = false;
        this.prefetchCache.clear();
    }

    private cachedRead(sha: string): Promise<string> {
        if (this.prefetchEnabled) {
            let prefetchedBlobP = this.prefetchCache.get(sha);
            if (prefetchedBlobP) {
                return prefetchedBlobP;
            }
            prefetchedBlobP = this.storage.read(sha);
            this.prefetchCache.set(sha, prefetchedBlobP);
            return prefetchedBlobP;
        }
        return this.storage.read(sha);
    }

    private prefetchTree(tree: ISnapshotTree) {
        const secondary = new Array<string>();
        this.prefetchTreeCore(tree, secondary);

        for (const blob of secondary) {
            // We don't care if the prefetch succeed
            // tslint:disable-next-line:no-floating-promises
            this.cachedRead(blob);
        }
    }

    private prefetchTreeCore(tree: ISnapshotTree, secondary: string[]) {
        for (const blobKey of Object.keys(tree.blobs)) {
            if (blobKey[0] === "." || blobKey === "header" || blobKey.indexOf("quorum") === 0) {
                // We don't care if the prefetch succeed
                // tslint:disable-next-line:no-floating-promises
                this.cachedRead(tree.blobs[blobKey]);
            } else if (blobKey[0] !== "deltas") {
                secondary.push(tree.blobs[blobKey]);
            }
        }

        for (const commit of Object.keys(tree.commits)) {
            this.getVersions(tree.commits[commit], 1)
                .then((moduleCommit) => this.getSnapshotTree(moduleCommit[0]))
                .catch((error) => debug("Ignored cached read error", error));
        }

        for (const subTree of Object.keys(tree.trees)) {
            this.prefetchTreeCore(tree.trees[subTree], secondary);
        }
    }
}
