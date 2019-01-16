import { IChaincodeHost } from "@prague/process-definitions";
import {
    ConnectionState,
    IDocumentStorageService,
    IEnvelope,
    IPlatform,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { buildHierarchy, flatten } from "@prague/utils";
import * as assert from "assert";
import { BlobManager } from "./blobManager";
import { Component } from "./component";
import { ComponentStorageService } from "./componentStorageService";
import { DeltaManager } from "./deltaManager";

export class Context {
    public static async Load(
        tenantId: string,
        id: string,
        platform: IPlatform,
        parentBranch: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        blobManager: BlobManager,
        pkg: string,
        chaincode: IChaincodeHost,
        tardisMessages: Map<string, ISequencedDocumentMessage[]>,
        deltaManager: DeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        components: Map<string, ISnapshotTree>,
        extraBlobs: Map<string, string>,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ): Promise<Context> {
        const context = new Context(
            tenantId,
            id,
            parentBranch,
            existing,
            options,
            clientId,
            user,
            blobManager,
            deltaManager,
            quorum,
            pkg,
            platform,
            chaincode,
            storage,
            connectionState,
            submitFn,
            snapshotFn,
            closeFn);

        // Instantiate all components in the document.
        // THOUGHT Does the host want to control some form of this instead? Do we really need to rip through all the
        // components or can we delay load them as necessary?
        const componentsP = new Array<Promise<void>>();
        for (const [componentId, snapshot] of components) {
            const componentP = context.loadComponent(componentId, snapshot, extraBlobs);
            componentsP.push(componentP);
        }

        await Promise.all(componentsP);

        // Start the context
        await context.start();

        return context;
    }

    public get ready(): Promise<void> {
        this.verifyNotClosed();

        // TODOTODO this needs to defer to the runtime
        return Promise.resolve();
    }

    // Components tracked by the Domain
    private components = new Map<string, Component>();
    private closed = false;

    private constructor(
        public readonly tenantId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly user: IUser,
        private blobManager: BlobManager,
        public readonly deltaManager: DeltaManager,
        private quorum: IQuorum,
        public readonly pkg: string,
        private readonly platform: IPlatform,
        public readonly chaincode: IChaincodeHost,
        private readonly storageService: IDocumentStorageService,
        private connectionState: ConnectionState,
        private submitFn: (type: MessageType, contents: any) => void,
        private snapshotFn: (message: string) => Promise<void>,
        private closeFn: () => void,
    ) {
    }

    public async loadComponent(
        id: string,
        snapshotTree: ISnapshotTree,
        extraBlobs: Map<string, string>,
    ): Promise<void> {
        // Need to rip through snapshot and use that to populate extraBlobs
        const runtimeStorage = new ComponentStorageService(this.storageService, extraBlobs);

        const component = await Component.LoadFromSnapshot(
            this.tenantId,
            this.id,
            this.platform,
            this.parentBranch,
            this.existing,
            this.options,
            this.clientId,
            this.user,
            this.blobManager,
            this.pkg,
            this.chaincode,
            new Map(),
            this.deltaManager,
            this.quorum,
            runtimeStorage,
            this.connectionState,
            snapshotTree,
            this.id,
            this.deltaManager.minimumSequenceNumber,
            this.submitFn,
            this.snapshotFn,
            this.closeFn);
        this.components.set(id, component);
    }

    public snapshot(): Map<string, ITree> {
        // Iterate over each component and ask it to snapshot
        const channelEntries = new Map<string, ITree>();
        this.components.forEach((component, key) => channelEntries.set(key, component.snapshot()));

        return channelEntries;
    }

    public stop(): { snapshot: Map<string, ISnapshotTree>, blobs: Map<string, string> } {
        this.verifyNotClosed();
        this.closed = true;
        const snapshot = this.snapshot();

        const blobs = new Map<string, string>();
        const result = new Map<string, ISnapshotTree>();
        for (const [id, value] of snapshot) {
            const flattened = flatten(value.entries, blobs);
            const snapshotTree = buildHierarchy(flattened);
            result.set(id, snapshotTree);
        }

        return { blobs, snapshot: result };
    }

    public transform(message: ISequencedDocumentMessage, sequenceNumber: number) {
        const envelope = message.contents as IEnvelope;
        const component = this.components.get(envelope.address);
        component.transform(message, sequenceNumber);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        for (const [, component] of this.components) {
            component.changeConnectionState(value, clientId);
        }
    }

    public prepareRemoteMessage(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        const envelope = message.contents as IEnvelope;
        const component = this.components.get(envelope.address);
        assert(component);

        return component.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        const envelope = message.contents as IEnvelope;
        const component = this.components.get(envelope.address);
        assert(component);

        component.process(message, local, context);
    }

    public updateMinSequenceNumber(minimumSequenceNumber: number) {
        for (const [, component] of this.components) {
            component.updateMinSequenceNumber(minimumSequenceNumber);
        }
    }

    public async start(): Promise<void> {
        // Once all components and prepared invoke the run function on the chaincode
        await this.chaincode.run(null, this.platform);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
