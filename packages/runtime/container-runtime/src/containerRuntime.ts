import {
    Browser,
    ConnectionState,
    FileMode,
    IBlob,
    IBlobManager,
    IContainerContext,
    IDeltaManager,
    IDocumentMessage,
    IDocumentStorageService,
    ILoader,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ISummaryBlob,
    ISummaryTree,
    ITelemetryLogger,
    ITree,
    MessageType,
    SummaryObject,
    SummaryTree,
    SummaryType,
    TreeEntry,
} from "@prague/container-definitions";
import {
    IAttachMessage,
    IComponentFactory,
    IComponentRuntime,
    IEnvelope,
    IHelpMessage,
    IHostRuntime,
    IInboundSignalMessage,
} from "@prague/runtime-definitions";
import { buildHierarchy, Deferred, flatten, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ComponentContext } from "./componentContext";
import { ComponentStorageService } from "./componentStorageService";
import { debug } from "./debug";
import { LeaderElector } from "./leaderElection";
import { analyzeTasks } from "./taskAnalyzer";

export interface IComponentRegistry {
    get(name: string): Promise<IComponentFactory>;
}

// Context will define the component level mappings
export class ContainerRuntime extends EventEmitter implements IHostRuntime {
    public static async Load(
        context: IContainerContext,
        registry: IComponentRegistry,
    ): Promise<ContainerRuntime> {
        const runtime = new ContainerRuntime(context, registry);

        const components = new Map<string, ISnapshotTree>();
        const snapshotTreesP = Object.keys(context.baseSnapshot.commits).map(async (key) => {
            const moduleId = context.baseSnapshot.commits[key];
            const commit = (await context.storage.getVersions(moduleId, 1))[0];
            const moduleTree = await context.storage.getSnapshotTree(commit);
            return { id: key, tree: moduleTree };
        });

        const snapshotTree = await Promise.all(snapshotTreesP);
        for (const value of snapshotTree) {
            components.set(value.id, value.tree);
        }

        const componentsP = new Array<Promise<void>>();
        for (const [componentId, snapshot] of components) {
            const componentP = runtime.loadComponent(componentId, snapshot, context.blobs);
            componentsP.push(componentP);
        }

        await Promise.all(componentsP);

        return runtime;
    }

    public get connectionState(): ConnectionState {
        return this.context.connectionState;
    }

    public get id(): string {
        return this.context.id;
    }

    public get parentBranch(): string {
        return this.context.parentBranch;
    }

    public get existing(): boolean {
        return this.context.existing;
    }

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.context.options;
    }

    public get clientId(): string {
        return this.context.clientId;
    }

    public get clientType(): string {
        return this.context.clientType;
    }

    public get blobManager(): IBlobManager {
        return this.context.blobManager;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this.context.deltaManager;
    }

    public get storage(): IDocumentStorageService {
        return this.context.storage;
    }

    public get branch(): string {
        return this.context.branch;
    }

    public get minimumSequenceNumber(): number {
        return this.context.minimumSequenceNumber;
    }

    public get submitFn(): (type: MessageType, contents: any) => number {
        return this.context.submitFn;
    }

    public get submitSignalFn(): (contents: any) => void {
        return this.context.submitSignalFn;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this.context.snapshotFn;
    }

    public get closeFn(): () => void {
        return this.context.closeFn;
    }

    public get loader(): ILoader {
        return this.context.loader;
    }

    public readonly logger: ITelemetryLogger;
    private tasks: string[] = [];
    private leaderElector: LeaderElector;

    // back-compat: version decides between loading document and chaincode.
    private version: string;

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get leader(): boolean {
        return this.leaderElector && (this.leaderElector.getLeader() === this.clientId);
    }

    // Components tracked by the Domain
    private readonly componentContexts = new Map<string, ComponentContext>();
    private readonly componentContextsDeferred = new Map<string, Deferred<ComponentContext>>();
    private closed = false;
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: (request: IRequest) => Promise<IResponse>;
    private lastMinSequenceNumber: number;

    private constructor(
        private readonly context: IContainerContext,
        private readonly registry: IComponentRegistry,
    ) {
        super();
        this.logger = context.logger;
        this.lastMinSequenceNumber = context.minimumSequenceNumber;
        this.startLeaderElection();
    }

    public async loadComponent(
        id: string,
        snapshotTree: ISnapshotTree,
        extraBlobs: Map<string, string>,
    ): Promise<void> {
        // Need to rip through snapshot and use that to populate extraBlobs
        const runtimeStorage = new ComponentStorageService(this.storage, extraBlobs);
        const details = await readAndParse<{ pkg: string }>(this.storage, snapshotTree.blobs[".component"]);

        // Create and store the unstarted component
        const component = new ComponentContext(
            this,
            details.pkg,
            id,
            true,
            runtimeStorage,
            snapshotTree);
        this.componentContexts.set(id, component);

        // Create a promise that will resolve to the started component
        const deferred = new Deferred<ComponentContext>();
        this.componentContextsDeferred.set(id, deferred);

        await component.start();

        deferred.resolve(component);
    }

    public registerRequestHandler(handler: (request: IRequest) => Promise<IResponse>) {
        this.requestHandler = handler;
    }

    public getPackage(name: string): Promise<IComponentFactory> {
        return this.registry.get(name);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (!this.requestHandler) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            return this.requestHandler(request);
        }
    }

    /**
     * Returns a summary of the runtime at the current sequence number
     */
    public async summarize(): Promise<ISummaryTree> {
        const result: ISummaryTree = {
            tree: {},
            type: SummaryType.Tree,
        };

        // Iterate over each component and ask it to snapshot
        const componentEntries = new Map<string, ITree>();
        this.componentContexts.forEach((component, key) => componentEntries.set(key, component.snapshot()));

        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storage.getVersions(this.id, 1);
        const tree = lastVersion.length > 0
            ? await this.storage.getSnapshotTree(lastVersion[0])
            : ({ blobs: {}, commits: {}, trees: {} } as ISnapshotTree);

        for (const [componentId, componentSnapshot] of componentEntries) {
            // If sha exists then previous commit is still valid
            if (componentSnapshot.id) {
                result.tree[componentId] = {
                    handle: tree.commits[componentId],
                    handleType: SummaryType.Commit,
                    type: SummaryType.Handle,
                };
            } else {
                const parents = componentId in tree.commits ? [tree.commits[componentId]] : [];
                const summaryTree = this.convertToSummaryTree(componentSnapshot);

                const author = {
                    date: new Date().toISOString(),
                    email: "kurtb@microsoft.com",
                    name: "Kurt Berglund",
                };

                const message =
                    `${componentId}@` +
                    `${this.deltaManager.referenceSequenceNumber}:${this.deltaManager.minimumSequenceNumber}`;
                result.tree[componentId] = {
                    author,
                    committer: author,
                    message,
                    parents,
                    tree: summaryTree,
                    type: SummaryType.Commit,
                };
            }
        }

        return result;
    }

    public async snapshot(tagMessage: string): Promise<ITree> {
        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storage.getVersions(this.id, 1);
        const tree = lastVersion.length > 0
            ? await this.storage.getSnapshotTree(lastVersion[0])
            : { blobs: {}, commits: {}, trees: {} };

        // Iterate over each component and ask it to snapshot
        const componentEntries = new Map<string, ITree>();
        this.componentContexts.forEach((component, key) => componentEntries.set(key, component.snapshot()));

        // Use base tree to know previous component snapshot and then snapshot each component
        const componentVersionsP = new Array<Promise<{ id: string, version: string }>>();
        for (const [componentId, componentSnapshot] of componentEntries) {
            // If ID exists then previous commit is still valid
            if (componentSnapshot.id) {
                componentVersionsP.push(Promise.resolve({
                    id: componentId,
                    version: tree.commits[componentId],
                }));
            } else {
                const parent = componentId in tree.commits ? [tree.commits[componentId]] : [];
                const componentVersionP = this.storage
                    .write(componentSnapshot, parent, `${componentId} commit ${tagMessage}`, componentId)
                    .then((version) => {
                        this.componentContexts.get(componentId).updateBaseId(version.treeId);
                        return { id: componentId, version: version.id };
                    });
                componentVersionsP.push(componentVersionP);
            }
        }

        const root: ITree = { entries: [], id: null };

        // Add in module references to the component snapshots
        const componentVersions = await Promise.all(componentVersionsP);
        let gitModules = "";
        for (const componentVersion of componentVersions) {
            root.entries.push({
                mode: FileMode.Commit,
                path: componentVersion.id,
                type: TreeEntry[TreeEntry.Commit],
                value: componentVersion.version,
            });

            const repoUrl = "https://github.com/kurtb/praguedocs.git"; // this.storageService.repositoryUrl
            // tslint:disable-next-line: max-line-length
            gitModules += `[submodule "${componentVersion.id}"]\n\tpath = ${componentVersion.id}\n\turl = ${repoUrl}\n\n`;
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

    public async requestSnapshot(tagMessage: string): Promise<void> {
        return this.context.requestSnapshot(tagMessage);
    }

    public async stop(): Promise<void> {
        this.verifyNotClosed();
        this.closed = true;
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

        // Resend all pending attach messages prior to notifying clients
        if (value === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        for (const [, componentContext] of this.componentContexts) {
            componentContext.changeConnectionState(value, clientId);
        }

        if (value === ConnectionState.Connected) {
            this.emit("connected", this.clientId);
        } else {
            this.emit("disconnected");
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

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        switch (message.type) {
            case MessageType.Operation:
                this.processOperation(message, local, context);
                break;

            case MessageType.Attach:
                this.processAttach(message, local, context as ComponentContext);
                break;

            default:
        }

        this.emit("op", message);

        if (this.lastMinSequenceNumber !== message.minimumSequenceNumber) {
            this.lastMinSequenceNumber = message.minimumSequenceNumber;
            this.updateMinSequenceNumber(message.minimumSequenceNumber);
        }
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any) {
        switch (message.type) {
            case MessageType.Attach:
                return this.postProcessAttach(message, local, context as ComponentContext);
            default:
        }
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        const envelope = message.content as IEnvelope;
        const component = this.componentContexts.get(envelope.address);
        assert(component);
        const innerContent = envelope.contents as { content: any, type: string };

        const transformed: IInboundSignalMessage = {
            clientId: message.clientId,
            content: innerContent.content,
            type: innerContent.type,
        };
        component.processSignal(transformed, local);
    }

    public async getComponentRuntime(id: string, wait = true): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        if (!this.componentContextsDeferred.has(id)) {
            if (!wait) {
                return Promise.reject(`Process ${id} does not exist`);
            }

            // Add in a deferred that will resolve once the process ID arrives
            this.componentContextsDeferred.set(id, new Deferred<ComponentContext>());
        }

        const componentContext = await this.componentContextsDeferred.get(id).promise;
        return componentContext.componentRuntime;
    }

    public async createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        const runtimeStorage = new ComponentStorageService(this.storage, new Map());
        const componentContext = new ComponentContext(
            this,
            pkg,
            id,
            false,
            runtimeStorage,
            null);

        // Generate the attach message. This may include ownership
        const message: IAttachMessage = {
            id,
            snapshot: null,
            type: pkg,
        };
        this.pendingAttach.set(id, message);
        this.submit(MessageType.Attach, message);

        // Store off the component
        const deferred = new Deferred<ComponentContext>();
        this.componentContextsDeferred.set(id, deferred);
        this.componentContexts.set(id, componentContext);

        // Start the component
        const componentRuntime = await componentContext.start();
        deferred.resolve(componentContext);

        return componentRuntime;
    }

    public getQuorum(): IQuorum {
        return this.context.quorum;
    }

    public error(error: any) {
        this.context.error(error);
    }

    public registerTasks(tasks: string[], version?: string) {
        this.verifyNotClosed();
        this.tasks = tasks;
        this.version = version;
        if (this.leader) {
            this.runTaskAnalyzer();
        }
    }

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    private convertToSummaryTree(snapshot: ITree): SummaryTree {
        if (snapshot.id) {
            return {
                handle: snapshot.id,
                handleType: SummaryType.Tree,
                type: SummaryType.Handle,
            };
        } else {
            const summaryTree: ISummaryTree = {
                tree: {},
                type: SummaryType.Tree,
            };

            for (const entry of snapshot.entries) {
                let value: SummaryObject;

                switch (entry.type) {
                    case TreeEntry[TreeEntry.Blob]:
                        const blob = entry.value as IBlob;
                        value = {
                            content: blob.encoding === "base64" ? Buffer.from(blob.contents, "base64") : blob.contents,
                            type: SummaryType.Blob,
                        } as ISummaryBlob;
                        break;

                    case TreeEntry[TreeEntry.Tree]:
                        value = this.convertToSummaryTree(entry.value as ITree);
                        break;

                    case TreeEntry[TreeEntry.Commit]:
                        value = this.convertToSummaryTree(entry.value as ITree);
                        break;

                    default:
                        throw new Error();
                }

                summaryTree.tree[entry.path] = value;
            }

            return summaryTree;
        }
    }

    private updateMinSequenceNumber(minimumSequenceNumber: number) {
        this.emit("minSequenceNumberChanged", this.deltaManager.minimumSequenceNumber);
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

    private async prepareOperation(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        const envelope = message.contents as IEnvelope;
        const component = this.componentContexts.get(envelope.address);
        assert(component);
        const innerContents = envelope.contents as { content: any, type: string };

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: innerContents.content,
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
        const component = this.componentContexts.get(envelope.address);
        assert(component);
        const innerContents = envelope.contents as { content: any, type: string };

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: innerContents.content,
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

    private async prepareAttach(message: ISequencedDocumentMessage, local: boolean): Promise<ComponentContext> {
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
        const component = new ComponentContext(
            this,
            attachMessage.type,
            attachMessage.id,
            true,
            runtimeStorage,
            snapshotTree);

        return component;
    }

    private processAttach(message: ISequencedDocumentMessage, local: boolean, context: ComponentContext): void {
        this.verifyNotClosed();
        debug("processAttach");
    }

    private async postProcessAttach(
        message: ISequencedDocumentMessage,
        local: boolean,
        context: ComponentContext,
    ): Promise<void> {
        const attachMessage = message.contents as IAttachMessage;

        // If a non-local operation then go and create the object - otherwise mark it as officially attached.
        if (local) {
            assert(this.pendingAttach.has(attachMessage.id));
            this.pendingAttach.delete(attachMessage.id);
        } else {
            this.componentContexts.set(attachMessage.id, context);

            // Fully start the component
            await context.start();

            // Resolve pending gets and store off any new ones
            if (this.componentContextsDeferred.has(attachMessage.id)) {
                this.componentContextsDeferred.get(attachMessage.id).resolve(context);
            } else {
                const deferred = new Deferred<ComponentContext>();
                deferred.resolve(context);
                this.componentContextsDeferred.set(attachMessage.id, deferred);
            }
        }
    }

    private startLeaderElection() {
        if (this.deltaManager && this.deltaManager.clientType === Browser) {
            if (this.connected) {
                this.initLeaderElection();
            } else {
                this.once("connected", () => this.initLeaderElection());
            }
        }
    }

    private initLeaderElection() {
        this.leaderElector = new LeaderElector(this.getQuorum(), this.clientId);
        this.leaderElector.on("newLeader", (clientId: string) => {
            debug(`New leader elected: ${clientId}`);
            if (this.leader) {
                this.emit("leader", clientId);
                for (const [, component] of this.componentContexts) {
                    component.updateLeader(clientId);
                }
                this.runTaskAnalyzer();
            }
        });
        this.leaderElector.on("leaderLeft", (clientId: string) => {
            debug(`Leader ${clientId} left`);
            this.proposeLeadership();
        });
        this.leaderElector.on("noLeader", (clientId: string) => {
            debug(`No leader present. Member ${clientId} left`);
            this.proposeLeadership();
        });
        this.leaderElector.on("memberLeft", (clientId: string) => {
            debug(`Member ${clientId} left`);
            if (this.leader) {
                this.runTaskAnalyzer();
            }
        });
        this.proposeLeadership();
    }

    private proposeLeadership() {
        this.leaderElector.proposeLeadership().then(() => {
            debug(`Leadership proposal accepted for ${this.clientId}`);
        }, (err) => {
            debug(`Leadership proposal rejected ${err}`);
        });
    }

    /**
     * On a client joining/departure, decide whether this client is the new leader.
     * If so, calculate if there are any unhandled tasks for browsers and remote agents.
     * Emit local help message for this browser and submits a remote help message for agents.
     */
    private runTaskAnalyzer() {
        // Analyze the current state and ask for local and remote help separately.
        const helpTasks = analyzeTasks(this.clientId, this.getQuorum().getMembers(), this.tasks);
        if (helpTasks && (helpTasks.browser.length > 0 || helpTasks.robot.length > 0)) {
            if (helpTasks.browser.length > 0) {
                const localHelpMessage: IHelpMessage = {
                    tasks: helpTasks.browser,
                    version: this.version,   // back-compat
                };
                debug(`Requesting local help for ${helpTasks.browser}`);
                this.emit("localHelp", localHelpMessage);
            }
            if (helpTasks.robot.length > 0) {
                const remoteHelpMessage: IHelpMessage = {
                    tasks: helpTasks.robot,
                    version: this.version,   // back-compat
                };
                debug(`Requesting remote help for ${helpTasks.robot}`);
                this.submit(MessageType.RemoteHelp, remoteHelpMessage);
            }
        }
    }
}
