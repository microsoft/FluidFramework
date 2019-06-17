/* tslint:disable:no-unsafe-any*/
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@prague/container-definitions";
import { ISharedMap, SharedMap } from "@prague/map";
import {
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { debug } from "./debug";

const snapshotFileName = "header";
const ownerPath = "owner";
const contentPath = "content";

/**
 * Implementation of a map shared object
 */
export class OwnedSharedMap extends SharedMap implements ISharedMap {
    public owner: string;

    public getOwner() {
        return this.owner;
    }

    public snapshot(): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry[TreeEntry.Blob],
                    value: {
                        contents: this.view.serialize(this.serializeFilter),
                        encoding: "utf-8",
                    },
                },
            ],
            id: null,
        };

        if (this.getOwner()) {
            tree.entries.push({
                mode: FileMode.File,
                path: ownerPath,
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: this.getOwner(),
                    encoding: "unclear",
                },
            });
        }

        // Add the snapshot of the content to the tree
        const contentSnapshot = this.snapshotContent();
        if (contentSnapshot) {
            tree.entries.push({
                mode: FileMode.Directory,
                path: contentPath,
                type: TreeEntry[TreeEntry.Tree],
                value: contentSnapshot,
            });
        }

        return tree;
    }

    // This is a convenience method that should probably go
    public isOwner(clientId: string): boolean {
        if (clientId === undefined) {
            return false;
        }
        const quorum = this.runtime.getQuorum();
        const member = quorum.getMember(clientId);
        return this.owner === member.client.user.id;
    }

    // TODO: Add this as a base component of snapshotter
    // protected ownerSnapshot() {
    //     return {
    //         mode: FileMode.file,
    //         path: contentPath,
    //         type: TreeEntry[TreeEntry.Tree],
    //         value: contentSnapshot,
    //     }
    // }

    protected prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (this.getMessageOwner(message) !== this.owner) {
            debug("A non owner attempted to modify this object");
            return;
            // throw new Error("Client does not have permission to modify this object.");
        } else {
            return this.prepareCore(message, local);
        }
    }

    protected async getOwnerSnapshot(storage: IObjectStorageService): Promise<void> {
        this.owner = await storage.read(ownerPath);
    }

    protected setOwner(): string | undefined {
        if (this.owner !== undefined) {
            return this.owner;
        } else if (this.runtime.clientId === undefined) {
            debug("Attempted to set owner, but no clientId");
            return undefined;
        }

        const clientId = this.runtime.clientId;
        const quorum = this.runtime.getQuorum();
        const sequencedClient = quorum.getMember(clientId);
        this.owner = sequencedClient.client.user.id;
        debug(`Set Owner to ${this.owner}`);
        return this.owner;
    }

    private getMessageOwner(message: ISequencedDocumentMessage): string {
        const quorum = this.runtime.getQuorum();
        const member = quorum.getMember(message.clientId);
        return member.client.user.id;
    }
}
