import {
    IChaincodeHost,
    IComponentContext,
    IComponentRuntime,
    IHostRuntime,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import { ICommit } from "@prague/gitresources";
import {
    ConnectionState,
    FileMode,
    IAttachMessage,
    IBlobManager,
    IDeltaManager,
    IDocumentStorageService,
    IEnvelope,
    IPlatform,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
    TreeEntry,
} from "@prague/runtime-definitions";
import { buildHierarchy, Deferred, flatten, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { Component } from "./component";
import { ComponentStorageService } from "./componentStorageService";
import { debug } from "./debug";

// Context will define the component level mappings
export class Runtime extends EventEmitter implements IComponentContext, IHostRuntime, IPlatform {
    public static async Load(
        tenantId: string,
        id: string,
        parentBranch: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        blobManager: IBlobManager,
        chaincode: IChaincodeHost,
        deltaManager: IDeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        baseSnapshot: ISnapshotTree,
        extraBlobs: Map<string, string>,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ): Promise<Runtime> {
        const context = new Runtime(
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
            chaincode,
            storage,
            connectionState,
            branch,
            minimumSequenceNumber,
            submitFn,
            snapshotFn,
            closeFn);

        const components = new Map<string, ISnapshotTree>();
        const snapshotTreesP = Object.keys(baseSnapshot.commits).map(async (key) => {
            const moduleSha = baseSnapshot.commits[key];
            const commit = (await storage.getVersions(moduleSha, 1))[0];
            const moduleTree = await storage.getSnapshotTree(commit);
            return { id: key, tree: moduleTree };
        });

        const snapshotTree = await Promise.all(snapshotTreesP);
        for (const value of snapshotTree) {
            components.set(value.id, value.tree);
        }

        const componentsP = new Array<Promise<void>>();
        for (const [componentId, snapshot] of components) {
            const componentP = context.loadComponent(componentId, snapshot, extraBlobs);
            componentsP.push(componentP);
        }

        await Promise.all(componentsP);

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
    private requestHandler: (request: IRequest) => Promise<IResponse>;

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
        public readonly blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager,
        private quorum: IQuorum,
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
        super();
    }

    public async loadComponent(
        id: string,
        snapshotTree: ISnapshotTree,
        extraBlobs: Map<string, string>,
    ): Promise<void> {
        // Need to rip through snapshot and use that to populate extraBlobs
        const runtimeStorage = new ComponentStorageService(this.storage, extraBlobs);
        const details = await readAndParse<{ pkg: string }>(this.storage, snapshotTree.blobs[".component"]);

        const componentP = Component.LoadFromSnapshot(
            this,
            this.tenantId,
            this.id,
            id,
            this.parentBranch,
            this.options,
            this.clientId,
            this.user,
            this.blobManager,
            details.pkg,
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
        const deferred = new Deferred<Component>();
        deferred.resolve(componentP);
        this.processDeferred.set(id, deferred);

        const component = await componentP;

        this.components.set(id, component);

        await component.start();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "context":
                return this as IComponentContext;
            default:
                return null;
        }
    }

    public registerRequestHandler(handler: (request: IRequest) => Promise<IResponse>) {
        this.requestHandler = handler;
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (!this.requestHandler) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            return this.requestHandler(request);
        }
    }

    public async snapshot(tagMessage: string): Promise<ITree> {
        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storage.getVersions(this.id, 1);
        const tree = lastVersion.length > 0
            ? await this.storage.getSnapshotTree(lastVersion[0])
            : { blobs: {}, commits: {}, trees: {} };

        // Iterate over each component and ask it to snapshot
        const channelEntries = new Map<string, ITree>();
        this.components.forEach((component, key) => channelEntries.set(key, component.snapshot()));

        // Use base tree to know previous component snapshot and then snapshot each component
        const channelCommitsP = new Array<Promise<{ id: string, commit: ICommit }>>();
        for (const [channelId, channelSnapshot] of channelEntries) {
            const parent = channelId in tree.commits ? [tree.commits[channelId]] : [];
            const channelCommitP = this.storage
                .write(channelSnapshot, parent, `${channelId} commit ${tagMessage}`, channelId)
                .then((commit) => ({ id: channelId, commit }));
            channelCommitsP.push(channelCommitP);
        }

        const root: ITree = { entries: [] };

        // Add in module references to the component snapshots
        const channelCommits = await Promise.all(channelCommitsP);
        let gitModules = "";
        for (const channelCommit of channelCommits) {
            root.entries.push({
                mode: FileMode.Commit,
                path: channelCommit.id,
                type: TreeEntry[TreeEntry.Commit],
                value: channelCommit.commit.sha,
            });

            const repoUrl = "https://github.com/kurtb/praguedocs.git"; // this.storageService.repositoryUrl
            gitModules += `[submodule "${channelCommit.id}"]\n\tpath = ${channelCommit.id}\n\turl = ${repoUrl}\n\n`;
        }

        // Write the module lookup details
        root.entries.push({
            mode: FileMode.File,
            path: ".gitmodules",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: gitModules,
                encoding: "utf-8",
            },
        });

        return root;
    }

    public async stop(): Promise<void> {
        this.verifyNotClosed();
        this.closed = true;
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
        switch (message.type) {
            case MessageType.Operation:
                return this.prepareOperation(message, local);

            case MessageType.Attach:
                return this.prepareAttach(message, local);

            default:
                return Promise.resolve();
        }
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: Component) {
        switch (message.type) {
            case MessageType.Operation:
                this.processOperation(message, local, context);
                break;

            case MessageType.Attach:
                this.processAttach(message, local, context);
                break;

            default:
        }
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: Component): Promise<void> {
        switch (message.type) {
            case MessageType.Attach:
                return this.postProcessAttach(message, local, context);
            default:
        }
    }

    public updateMinSequenceNumber(minimumSequenceNumber: number) {
        for (const [, component] of this.components) {
            component.updateMinSequenceNumber(minimumSequenceNumber);
        }
    }

    public getProcess(id: string, wait = true): Promise<IComponentRuntime> {
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

    public async createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        const runtimeStorage = new ComponentStorageService(this.storage, new Map());
        const component = await Component.create(
            this,
            this.tenantId,
            this.id,
            id,
            this.parentBranch,
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

        // Generate the attach message
        const message: IAttachMessage = {
            id,
            snapshot: null,
            type: pkg,
        };
        this.pendingAttach.set(id, message);
        this.submit(MessageType.Attach, message);

        // Start the component
        await component.start();

        // Store off the component
        this.components.set(id, component);

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

    private async prepareOperation(message: ISequencedDocumentMessage, local: boolean): Promise<Component> {
        const envelope = message.contents as IEnvelope;
        const component = this.components.get(envelope.address);
        assert(component);
        const innerContents = envelope.contents as { content: any, type: string };

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: innerContents.content,
            metadata: message.metadata,
            minimumSequenceNumber: message.minimumSequenceNumber,
            origin: message.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: message.sequenceNumber,
            timestamp: message.timestamp,
            traces: message.traces,
            type: innerContents.type,
        };

        return component.prepare(transformed, local);
    }

    private processOperation(message: ISequencedDocumentMessage, local: boolean, context: any) {
        const envelope = message.contents as IEnvelope;
        const component = this.components.get(envelope.address);
        assert(component);
        const innerContents = envelope.contents as { content: any, type: string };

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: innerContents.content,
            metadata: message.metadata,
            minimumSequenceNumber: message.minimumSequenceNumber,
            origin: message.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: message.sequenceNumber,
            timestamp: message.timestamp,
            traces: message.traces,
            type: innerContents.type,
        };

        component.process(transformed, local, context);
    }

    private async prepareAttach(message: ISequencedDocumentMessage, local: boolean): Promise<Component> {
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
            this,
            this.tenantId,
            this.id,
            attachMessage.id,
            this.parentBranch,
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

        return component;
    }

    private processAttach(message: ISequencedDocumentMessage, local: boolean, context: Component): void {
        this.verifyNotClosed();
        debug("processAttach");
    }

    private async postProcessAttach(
        message: ISequencedDocumentMessage,
        local: boolean,
        context: Component,
    ): Promise<void> {
        const attachMessage = message.contents as IAttachMessage;

        // If a non-local operation then go and create the object - otherwise mark it as officially attached.
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id));
            this.pendingAttach.delete(attachMessage.id);
        } else {
            await context.start();

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
}
