import { readFileSync } from "fs";
import { ReadDocumentStorageServiceBase, IFileSnapshot } from "@fluidframework/replay-driver";
import { IVersion, ISnapshotTree, ITree, TreeEntry, IBlob } from "@fluidframework/protocol-definitions";
import { FileSnapshotWriterClassFactory } from "@fluidframework/file-driver";

export class ReplaySnapshotReader extends ReadDocumentStorageServiceBase {
    private readonly snapshot: IFileSnapshot;
    private readonly snapshotTree: ISnapshotTree;
    private readonly blobs = new Map<string, string>();
    private readonly trees = new Map<string, ISnapshotTree>();

    constructor(snapshotPath: string) {
        super();

        this.snapshot = JSON.parse(readFileSync(snapshotPath).toString()) as IFileSnapshot;

        this.snapshotTree = this.buildSnapshotTree(this.snapshot.tree);
    }

    private buildSnapshotTree(tree: ITree): ISnapshotTree {
        const snapshotTree: ISnapshotTree = {
            blobs: {},
            commits: {},
            id: tree.id,
            trees: {},
        };

        tree.entries.forEach((e) => {
            switch (e.type) {
                case TreeEntry[TreeEntry.Blob]:
                    const blob = e.value as IBlob;
                    const blobId = (this.trees.size + this.blobs.size).toString();
                    this.blobs.set(blobId, Buffer.from(blob.contents).toString("base64"));
                    snapshotTree.blobs[e.path] = blobId;
                    break;

                case TreeEntry[TreeEntry.Tree]:
                    const subTree = e.value as ITree;
                    const subSnapshotTree = this.buildSnapshotTree(subTree);
                    const treeId = (this.trees.size + this.blobs.size).toString();
                    this.trees.set(treeId, subSnapshotTree);
                    snapshotTree.trees[e.path] = subSnapshotTree;
                    break;

                default:
                    throw new Error(`unknown type ${e.type}`);
            }
        });

        return snapshotTree;
    }

    async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return [{ id: "latest", treeId: "ReplaySnapshotReaderTreeId" }];
    }
    async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree> {
        return this.snapshotTree;
    }
    async read(blobId: string): Promise<string> {
        return this.blobs.get(blobId);
    }
}

export const ReplaySnapshotReaderFileSnapshotWriter = FileSnapshotWriterClassFactory(ReplaySnapshotReader);
