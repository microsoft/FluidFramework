import {
    Browser,
    ConnectionState,
    FileMode,
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
    ITree,
    MessageType,
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
export class Runtime extends EventEmitter implements IHostRuntime {
    public static async Load(
        registry: IComponentRegistry,
        context: IContainerContext,
    ): Promise<Runtime> {
        const runtime = new Runtime(registry, context);

        const components = new Map<string, ISnapshotTree>();
        const snapshotTreesP = Object.keys(context.baseSnapshot.commits).map(async (key) => {
            const moduleSha = context.baseSnapshot.commits[key];
            const commit = (await context.storage.getVersions(moduleSha, 1))[0];
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

    public get tenantId(): string {
        return this.context.tenantId;
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
    private components = new Map<string, ComponentContext>();
    private componentsDeferred = new Map<string, Deferred<ComponentContext>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: (request: IRequest) => Promise<IResponse>;
    private lastMinSequenceNumber: number;

    private constructor(
        private readonly registry: IComponentRegistry,
        private readonly context: IContainerContext,
    ) {
        super();
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
        this.components.set(id, component);

        // Create a promise to refer to the started component
        const startedP = component.start().then(() => component);
        const deferred = new Deferred<ComponentContext>();
        deferred.resolve(startedP);
        this.componentsDeferred.set(id, deferred);

        await startedP;
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

    public async snapshot(tagMessage: string): Promise<ITree> {
        // Pull in the prior version and snapshot tree to store against
        const lastVersion = await this.storage.getVersions(this.id, 1);
        const tree = lastVersion.length > 0
            ? await this.storage.getSnapshotTree(lastVersion[0])
            : { blobs: {}, commits: {}, trees: {} };

        // Iterate over each component and ask it to snapshot
        const componentEntries = new Map<string, ITree>();
        this.components.forEach((component, key) => componentEntries.set(key, component.snapshot()));

        // Use base tree to know previous component snapshot and then snapshot each component
        const componentCommitsP = new Array<Promise<{ id: string, commit: string }>>();
        for (const [componentId, componentSnapshot] of componentEntries) {
            // If sha exists then previous commit is still valid
            if (componentSnapshot.sha) {
                componentCommitsP.push(Promise.resolve({
                    commit: tree.commits[componentId],
                    id: componentId,
                }));
            } else {
                const parent = componentId in tree.commits ? [tree.commits[componentId]] : [];
                const componentCommitP = this.storage
                    .write(componentSnapshot, parent, `${componentId} commit ${tagMessage}`, componentId)
                    .then((commit) => {
                        this.components.get(componentId).updateBaseSha(commit.tree.sha);
                        return { id: componentId, commit: commit.sha };
                    });
                componentCommitsP.push(componentCommitP);
            }
        }

        const root: ITree = { entries: [], sha: null };

        // Add in module references to the component snapshots
        const componentCommits = await Promise.all(componentCommitsP);
        let gitModules = "";
        for (const componentCommit of componentCommits) {
            root.entries.push({
                mode: FileMode.Commit,
                path: componentCommit.id,
                type: TreeEntry[TreeEntry.Commit],
                value: componentCommit.commit,
            });

            const repoUrl = "https://github.com/kurtb/praguedocs.git"; // this.storageService.repositoryUrl
            gitModules += `[submodule "${componentCommit.id}"]\n\tpath = ${componentCommit.id}\n\turl = ${repoUrl}\n\n`;
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

        for (const [, component] of this.components) {
            component.changeConnectionState(value, clientId);
        }

        if (value === ConnectionState.Connected) {
            this.emit("connected", this.clientId);
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

    public process(message: ISequencedDocumentMessage, local: boolean, context: ComponentContext) {
        switch (message.type) {
            case MessageType.Operation:
                this.processOperation(message, local, context);
                break;

            case MessageType.Attach:
                this.processAttach(message, local, context);
                break;

            default:
        }

        this.emit("op", message);

        if (this.lastMinSequenceNumber !== message.minimumSequenceNumber) {
            this.lastMinSequenceNumber = message.minimumSequenceNumber;
            this.updateMinSequenceNumber(message.minimumSequenceNumber);
        }
    }

    public async postProcess(
        message: ISequencedDocumentMessage,
        local: boolean,
        context: ComponentContext,
    ): Promise<void> {
        switch (message.type) {
            case MessageType.Attach:
                return this.postProcessAttach(message, local, context);
            default:
        }
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        const envelope = message.content as IEnvelope;
        const component = this.components.get(envelope.address);
        assert(component);
        const innerContent = envelope.contents as { content: any, type: string };

        const transformed: IInboundSignalMessage = {
            clientId: message.clientId,
            content: innerContent.content,
            type: innerContent.type,
        };
        component.processSignal(transformed, local);
    }

    public async getComponent(id: string, wait = true): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        if (!this.componentsDeferred.has(id)) {
            if (!wait) {
                return Promise.reject(`Process ${id} does not exist`);
            }

            // Add in a deferred that will resolve once the process ID arrives
            this.componentsDeferred.set(id, new Deferred<ComponentContext>());
        }

        const componentRuntime = await this.componentsDeferred.get(id).promise;
        return componentRuntime.component;
    }

    public async createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        const runtimeStorage = new ComponentStorageService(this.storage, new Map());
        const component = new ComponentContext(
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
        this.componentsDeferred.set(id, deferred);
        this.components.set(id, component);

        // Start the component
        await component.start();
        deferred.resolve(component);

        return component.component;
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

    private async prepareOperation(message: ISequencedDocumentMessage, local: boolean): Promise<ComponentContext> {
        const envelope = message.contents as IEnvelope;
        const component = this.components.get(envelope.address);
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
        const component = this.components.get(envelope.address);
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
            this.components.set(attachMessage.id, context);

            // Fully start the component
            await context.start();

            // Resolve pending gets and store off any new ones
            if (this.componentsDeferred.has(attachMessage.id)) {
                this.componentsDeferred.get(attachMessage.id).resolve(context);
            } else {
                const deferred = new Deferred<ComponentContext>();
                deferred.resolve(context);
                this.componentsDeferred.set(attachMessage.id, deferred);
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
                for (const [, component] of this.components) {
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
        // Analyze the current state and ask for local and remote help seperately.
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
