import * as resources from "gitresources";
import * as api from "../../api-core";

export class TestBlobStorageService implements api.IBlobStorageService  {
    public getSnapshotTree(id: string, version: resources.ICommit): Promise<api.ISnapshotTree> {
        return Promise.resolve(null);
    }

    public async read(sha: string): Promise<string> {
        return Promise.resolve("");
    }

    public write(id: string, tree: api.ITree, message: string): Promise<resources.ICommit> {
        const commit: resources.ICommit = {
            author: { date: "", email: "", name: ""},
            committer: { date: "", email: "", name: ""},
            message: "",
            parents: [],
            sha: "test",
            tree: {
                sha: "test",
                url: "test",
            },
            url: "test",
        };
        return Promise.resolve(commit);
    }
}
