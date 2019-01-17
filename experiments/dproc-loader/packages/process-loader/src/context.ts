import {
    IChaincodeHost,
    IHostRuntime,
    IProcess,
} from "@prague/process-definitions";
import {
    ConnectionState,
    IAttachMessage,
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
import { buildHierarchy, Deferred, flatten } from "@prague/utils";
import * as assert from "assert";
import { BlobManager } from "./blobManager";
import { Component } from "./component";
import { ComponentStorageService } from "./componentStorageService";
import { debug } from "./debug";
import { DeltaManager } from "./deltaManager";

export class Context implements IHostRuntime {
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
            branch,
            minimumSequenceNumber,
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
        debug("Starting context");
        await context.start();

        return context;
    }

    public get ready(): Promise<void> {
        this.verifyNotClosed();

        // TODOTODO this needs to defer to the runtime
        return Promise.resolve();
    }

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    // Components tracked by the Domain
    private components = new Map<string, Component>();
    private processDeferred = new Map<string, Deferred<Component>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    private constructor(
        public readonly tenantId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly user: IUser,
        public readonly blobManager: BlobManager,
        public readonly deltaManager: DeltaManager,
        private quorum: IQuorum,
        public readonly pkg: string,
        public readonly platform: IPlatform,
        public readonly chaincode: IChaincodeHost,
        public readonly storage: IDocumentStorageService,
        // tslint:disable-next-line:variable-name
        private _connectionState: ConnectionState,
        public readonly branch: string,
        public readonly minimumSequenceNumber: number,
        public readonly submitFn: (type: MessageType, contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
    ) {
    }

    public async loadComponent(
        id: string,
        snapshotTree: ISnapshotTree,
        extraBlobs: Map<string, string>,
    ): Promise<void> {
        // Need to rip through snapshot and use that to populate extraBlobs
        const runtimeStorage = new ComponentStorageService(this.storage, extraBlobs);

        // Load in the type of component

        const component = await Component.LoadFromSnapshot(
            this.tenantId,
            this.id,
            id,
            this.parentBranch,
            this.existing,
            this.options,
            this.clientId,
            this.user,
            this.blobManager,
            null,           // TODO need to read package attribute prior to load
            this.chaincode,
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

        await component.start();
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
        this.verifyNotClosed();

        if (value === this.connectionState) {
            return;
        }

        this._connectionState = value;
        this.clientId = clientId;

        // Resend all pending attach messages prior to notifying clients
        if (value === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        for (const [, component] of this.components) {
            component.changeConnectionState(value, clientId);
        }
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
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

    public async prepareAttach(message: ISequencedDocumentMessage, local: boolean): Promise<Component> {
        this.verifyNotClosed();

        // the local object has already been attached
        if (local) {
            return;
        }

        const attachMessage = message.contents as IAttachMessage;
        let snapshotTree: ISnapshotTree = null;
        if (attachMessage.snapshot) {
            const flattened = flatten(attachMessage.snapshot.entries, new Map());
            snapshotTree = buildHierarchy(flattened);
        }

        // create storage service that wraps the attach data
        const runtimeStorage = new ComponentStorageService(this.storage, new Map());
        const component = await Component.LoadFromSnapshot(
            this.tenantId,
            this.id,
            attachMessage.id,
            this.parentBranch,
            this.existing,
            this.options,
            this.clientId,
            this.user,
            this.blobManager,
            attachMessage.type,
            this.chaincode,
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

        // Start the component code
        await component.start();

        return component;
    }

    public processAttach(message: ISequencedDocumentMessage, local: boolean, context: Component): void {
        this.verifyNotClosed();

        debug("processAttach");

        const attachMessage = message.contents as IAttachMessage;

        // If a non-local operation then go and create the object - otherwise mark it as officially attached.
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id));
            this.pendingAttach.delete(attachMessage.id);
        } else {
            this.components.set(attachMessage.id, context);

            // Resolve pending gets and store off any new ones
            if (this.processDeferred.has(attachMessage.id)) {
                this.processDeferred.get(attachMessage.id).resolve(context);
            } else {
                const deferred = new Deferred<Component>();
                deferred.resolve(context);
                this.processDeferred.set(attachMessage.id, deferred);
            }
        }
    }

    public updateMinSequenceNumber(minimumSequenceNumber: number) {
        for (const [, component] of this.components) {
            component.updateMinSequenceNumber(minimumSequenceNumber);
        }
    }

    public async start(): Promise<void> {
        // Once all components and prepared invoke the run function on the chaincode
        await this.chaincode.run(this, this.platform);
    }

    public getProcess(id: string, wait = true): Promise<IProcess> {
        this.verifyNotClosed();

        if (!this.processDeferred.has(id)) {
            if (!wait) {
                return Promise.reject(`Process ${id} does not exist`);
            }

            // Add in a deferred that will resolve once the process ID arrives
            this.processDeferred.set(id, new Deferred<Component>());
        }

        return this.processDeferred.get(id).promise;
    }

    public async createAndAttachProcess(id: string, pkg: string): Promise<IProcess> {
        this.verifyNotClosed();

        const runtimeStorage = new ComponentStorageService(this.storage, new Map());
        const component = await Component.create(
            this.tenantId,
            this.id,
            id,
            this.parentBranch,
            this.existing,
            this.options,
            this.clientId,
            this.user,
            this.blobManager,
            pkg,
            this.chaincode,
            this.deltaManager,
            this.quorum,
            runtimeStorage,
            this.connectionState,
            this.id,
            this.deltaManager.minimumSequenceNumber,
            this.submitFn,
            this.snapshotFn,
            this.closeFn);

        // Store off the component
        this.components.set(id, component);

        // Generate the attach message
        const message: IAttachMessage = {
            id,
            snapshot: null,
            type: pkg,
        };
        this.pendingAttach.set(id, message);
        this.submit(MessageType.Attach, message);

        // Start up the component
        await component.start();

        // Resolve any pending requests for the component
        if (this.processDeferred.has(id)) {
            this.processDeferred.get(id).resolve(component);
        } else {
            const deferred = new Deferred<Component>();
            deferred.resolve(component);
            this.processDeferred.set(id, deferred);
        }

        return component;
    }

    public getQuorum(): IQuorum {
        return this.quorum;
    }

    public error(error: any) {
        // TODO bubble up to parent
        debug("Context has encountered a non-recoverable error");
    }

    private submit(type: MessageType, content: any) {
        this.verifyNotClosed();
        this.submitFn(type, content);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
