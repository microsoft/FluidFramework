import {
    Browser,
    ConnectionState,
    FileMode,
    IBlobManager,
    IContainerContext,
    IDeltaManager,
    IDocumentStorageService,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import { ICommit } from "@prague/gitresources";
import {
    IAttachMessage,
    IComponentFactory,
    IComponentRuntime,
    IEnvelope,
    IHelpMessage,
    IHostRuntime,
} from "@prague/runtime-definitions";
import { buildHierarchy, Deferred, flatten, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ComponentRuntime } from "./componentRuntime";
import { ComponentStorageService } from "./componentStorageService";
import { debug } from "./debug";
import { LeaderElector } from "./leaderElection";
import { analyzeTasks, getLeaderCandidate } from "./taskAnalyzer";

// Context will define the component level mappings
export class Runtime extends EventEmitter implements IHostRuntime {
    public static async Load(
        registry: Map<string, Promise<IComponentFactory>>,
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

    public get blobManager(): IBlobManager {
        return this.context.blobManager;
    }

    public get deltaManager(): IDeltaManager {
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

    public get snapshotFn(): (message: string) => Promise<void> {
        return this.context.snapshotFn;
    }

    public get closeFn(): () => void {
        return this.context.closeFn;
    }

    private tasks: string[] = [];
    private leaderElector: LeaderElector;

    // back-compat: version decides between loading document and chaincode.
    private version: string;

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    // Components tracked by the Domain
    private components = new Map<string, ComponentRuntime>();
    private componentsDeferred = new Map<string, Deferred<ComponentRuntime>>();
    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: (request: IRequest) => Promise<IResponse>;

    private constructor(
        private readonly registry: Map<string, Promise<IComponentFactory>>,
        private readonly context: IContainerContext,
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

        const componentP = ComponentRuntime.LoadFromSnapshot(
            this,
            id,
            details.pkg,
            runtimeStorage,
            snapshotTree);
        const deferred = new Deferred<ComponentRuntime>();
        deferred.resolve(componentP);
        this.componentsDeferred.set(id, deferred);

        const component = await componentP;

        this.components.set(id, component);

        await component.start();
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

    public process(message: ISequencedDocumentMessage, local: boolean, context: ComponentRuntime) {
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

    public async postProcess(
        message: ISequencedDocumentMessage,
        local: boolean,
        context: ComponentRuntime,
    ): Promise<void> {
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

    public getComponent(id: string, wait = true): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        if (!this.componentsDeferred.has(id)) {
            if (!wait) {
                return Promise.reject(`Process ${id} does not exist`);
            }

            // Add in a deferred that will resolve once the process ID arrives
            this.componentsDeferred.set(id, new Deferred<ComponentRuntime>());
        }

        return this.componentsDeferred.get(id).promise;
    }

    public async createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        this.verifyNotClosed();

        const runtimeStorage = new ComponentStorageService(this.storage, new Map());
        const component = await ComponentRuntime.create(
            this,
            id,
            pkg,
            runtimeStorage);

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
        if (this.componentsDeferred.has(id)) {
            this.componentsDeferred.get(id).resolve(component);
        } else {
            const deferred = new Deferred<ComponentRuntime>();
            deferred.resolve(component);
            this.componentsDeferred.set(id, deferred);
        }

        return component;
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
        this.startLeaderElection();
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

    private async prepareOperation(message: ISequencedDocumentMessage, local: boolean): Promise<ComponentRuntime> {
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

    private async prepareAttach(message: ISequencedDocumentMessage, local: boolean): Promise<ComponentRuntime> {
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
        const component = await ComponentRuntime.LoadFromSnapshot(
            this,
            attachMessage.id,
            attachMessage.type,
            runtimeStorage,
            snapshotTree);

        return component;
    }

    private processAttach(message: ISequencedDocumentMessage, local: boolean, context: ComponentRuntime): void {
        this.verifyNotClosed();
        debug("processAttach");
    }

    private async postProcessAttach(
        message: ISequencedDocumentMessage,
        local: boolean,
        context: ComponentRuntime,
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
            if (this.componentsDeferred.has(attachMessage.id)) {
                this.componentsDeferred.get(attachMessage.id).resolve(context);
            } else {
                const deferred = new Deferred<ComponentRuntime>();
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
            this.runTaskAnalyzer();
        });
        this.leaderElector.on("leaderLeft", (clientId: string) => {
            debug(`Leader ${clientId} left`);
            this.proposeLeadership();
        });
        this.leaderElector.on("memberLeft", (clientId: string) => {
            debug(`Member ${clientId} left`);
            this.runTaskAnalyzer();
        });
        this.proposeLeadership();
    }

    private proposeLeadership() {
        if (getLeaderCandidate(this.getQuorum().getMembers()) === this.clientId) {
            this.leaderElector.proposeLeadership().then(() => {
                debug(`Proposal accepted`);
            }, (err) => {
                debug(`Proposal rejected: ${err}`);
            });
        }
    }

    /**
     * On a client joining/departure, decide whether this client is the new leader.
     * If so, calculate if there are any unhandled tasks for browsers and remote agents.
     * Emit local help message for this browser and submits a remote help message for agents.
     */
    private runTaskAnalyzer() {
        if (this.leaderElector.getLeader() === this.clientId) {
            // Analyze the current state and ask for local and remote help seperately.
            const helpTasks = analyzeTasks(this.clientId, this.getQuorum().getMembers(), this.tasks);
            if (helpTasks && (helpTasks.browser.length > 0 || helpTasks.robot.length > 0)) {
                if (helpTasks.browser.length > 0) {
                    const localHelpMessage: IHelpMessage = {
                        tasks: helpTasks.browser,
                        version: this.version,   // back-compat
                    };
                    console.log(`Requesting local help for ${helpTasks.browser}`);
                    this.emit("localHelp", localHelpMessage);
                }
                if (helpTasks.robot.length > 0) {
                    const remoteHelpMessage: IHelpMessage = {
                        tasks: helpTasks.robot,
                        version: this.version,   // back-compat
                    };
                    console.log(`Requesting remote help for ${helpTasks.robot}`);
                    this.submit(MessageType.RemoteHelp, remoteHelpMessage);
                }
            }
        }
    }
}
