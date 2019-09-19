/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* tslint:disable:no-unsafe-any*/
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from "@prague/protocol-definitions";
import { fromBase64ToUtf8 } from "@prague/utils";
import { debug } from "./debug";
import { OwnedMapFactory } from "./ownedMapFactory";

const snapshotFileName = "header";
const ownerPath = "owner";
const contentPath = "content";

/**
 * Implementation of a map shared object
 */
export class OwnedSharedMap extends SharedMap implements ISharedMap {
    /**
     * Create a new owned shared map
     *
     * @param runtime - component runtime the new owned shared map belongs to
     * @param id - optional name of the owned shared map
     * @returns newly create owned shared map (but not attached yet)
     */
    public static create(runtime: IComponentRuntime, id?: string) {
        return runtime.createChannel(OwnedSharedMap.getIdForCreate(id), OwnedMapFactory.Type) as OwnedSharedMap;
    }

    /**
     * Get a factory for OwnedSharedMap to register with the component.
     *
     * @returns a factory that creates and load OwnedSharedMap
     */
    public static getFactory() {
        return new OwnedMapFactory();
    }

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
                        contents: this.serialize(),
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
                    encoding: "utf-8",
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

    // tslint:disable-next-line: no-suspicious-comment
    // TODO: Add this as a base component of snapshotter
    // protected ownerSnapshot() {
    //     return {
    //         mode: FileMode.file,
    //         path: contentPath,
    //         type: TreeEntry[TreeEntry.Tree],
    //         value: contentSnapshot,
    //     }
    // }

    protected processCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (this.getMessageOwner(message) !== this.owner) {
            debug("A non owner attempted to modify this object");
            return;
            // throw new Error("Client does not have permission to modify this object.");
        } else {
            super.processCore(message, local);
        }
    }

    protected async getOwnerSnapshot(storage: IObjectStorageService): Promise<void> {
        const owner = await storage.read(ownerPath);
        this.owner = fromBase64ToUtf8(owner);
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
