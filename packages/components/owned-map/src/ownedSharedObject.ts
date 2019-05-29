import {
    ISequencedDocumentMessage,
} from "@prague/container-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { SharedObject } from "@prague/shared-object-common";
import { debug } from "./debug";

const ownerPath = "owner";

export abstract class OwnedSharedObject extends SharedObject {

    public owner: string;

    constructor(public id: string, protected runtime: IComponentRuntime, public type: string) {
        super(id, runtime, type);
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
        this.owner = (await storage.read(ownerPath));
    }

    protected setOwner(): string | undefined {
        if (this.owner !== undefined) {
            return this.owner;
        } else if (this.runtime.clientId === undefined) {
            // tslint:disable-next-line:no-console
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
