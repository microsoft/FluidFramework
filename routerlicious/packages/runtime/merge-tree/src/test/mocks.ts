import {
    IBlob,
    ITree,
} from "@prague/container-definitions";
import {
    IObjectStorageService,
} from "@prague/runtime-definitions";
import * as assert from "assert";

// An implementtion of IObjectStorageService based on ITree input.
export class MockStorage implements IObjectStorageService {
    public static readCore(tree: ITree, paths: string[]): string {
        for (const entry of tree.entries) {
            if (entry.path === paths[0]) {
                if (entry.type === "Blob") {
                    assert (paths.length === 1);
                    const blob = entry.value as IBlob;
                    return Buffer.from(blob.contents, blob.encoding)
                        .toString("base64");
                }
                if (entry.type === "Tree") {
                    return MockStorage.readCore(entry.value as ITree, paths.slice(1));
                }
                assert(false);
            }
        }
        assert(false);
    }

    constructor(protected tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        return MockStorage.readCore(this.tree, path.split("/"));
    }
}
