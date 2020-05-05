/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@microsoft/fluid-common-utils";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
import { FileMode, ISequencedDocumentMessage, ITree, TreeEntry } from "@microsoft/fluid-protocol-definitions";
import { IComponentRuntime, IObjectStorageService } from "@microsoft/fluid-runtime-definitions";
import { debug } from "./debug";
import { OwnedMapFactory } from "./ownedMapFactory";

const ownerPath = "owner";

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
        return runtime.createChannel(id, OwnedMapFactory.Type) as OwnedSharedMap;
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
        const tree = super.snapshot();

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

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    protected processCore(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (this.getMessageOwner(message) !== this.owner) {
            debug("A non owner attempted to modify this object");
            return;
        } else {
            super.processCore(message, local);
        }
    }

    /**
     * {@inheritDoc @microsoft/fluid-shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(
        branchId: string,
        storage: IObjectStorageService) {
        const owner = await storage.read(ownerPath);
        this.owner = fromBase64ToUtf8(owner);
        return super.loadCore(branchId, storage);
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
