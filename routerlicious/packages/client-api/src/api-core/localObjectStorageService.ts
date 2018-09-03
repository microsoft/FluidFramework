import * as storage from "@prague/runtime-definitions";
import { IObjectStorageService } from "./document";

export class LocalObjectStorageService implements IObjectStorageService {
    constructor(private tree: storage.ITree) {
    }

    public read(path: string): Promise<string> {
        const contents = this.readSync(path);
        return contents !== undefined ? Promise.resolve(contents) : Promise.reject("Not found");
    }

    /**
     * Provides a synchronous access point to locally stored data
     */
    public readSync(path: string): string {
        return this.readSyncInternal(path, this.tree);
    }

    private readSyncInternal(path: string, tree: storage.ITree): string {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case storage.TreeEntry[storage.TreeEntry.Blob]:
                    if (path === entry.path) {
                        const blob = entry.value as storage.IBlob;
                        return blob.encoding === "utf-8"
                            ? new Buffer(blob.contents).toString("base64")
                            : blob.contents;
                    }
                    break;

                case storage.TreeEntry[storage.TreeEntry.Tree]:
                    if (path.indexOf(entry.path) === 0) {
                        return this.readSyncInternal(path.substr(entry.path.length + 1), entry.value as storage.ITree);
                    }
                    break;

                default:
                    break;
            }
        }

        return undefined;
    }
}
