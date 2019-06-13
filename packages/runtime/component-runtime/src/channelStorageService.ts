import { IDocumentStorageService, ISnapshotTree } from "@prague/container-definitions";
import { IObjectStorageService } from "@prague/runtime-definitions";

export class ChannelStorageService implements IObjectStorageService {
    private static flattenTree(base: string, tree: ISnapshotTree, results: { [path: string]: string }) {
        // tslint:disable-next-line:forin
        for (const path in tree.trees) {
            ChannelStorageService.flattenTree(`${base}${path}/`, tree.trees[path], results);
        }

        // tslint:disable-next-line:forin
        for (const blob in tree.blobs) {
            results[`${base}${blob}`] = tree.blobs[blob];
        }
    }

    private readonly flattenedTree: { [path: string]: string } = {};

    constructor(tree: ISnapshotTree, private readonly storage: IDocumentStorageService) {
        // Create a map from paths to blobs
        /* tslint:disable:strict-boolean-expressions */
        if (tree) {
            ChannelStorageService.flattenTree("", tree, this.flattenedTree);
        }
    }

    /* tslint:disable:promise-function-async */
    public read(path: string): Promise<string> {
        const id = this.getIdForPath(path);
        return this.storage.read(id);
    }

    private getIdForPath(path: string): string {
        return this.flattenedTree[path];
    }
}
