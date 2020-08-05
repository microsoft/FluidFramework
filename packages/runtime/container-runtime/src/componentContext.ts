/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import EventEmitter from "events";
import { IDisposable } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ContainerWarning,
    ILoader,
    BindState,
    AttachState,
} from "@fluidframework/container-definitions";
import { Deferred } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { BlobTreeEntry } from "@fluidframework/protocol-base";
import {
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    ConnectionState,
} from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreChannel,
    IAttachMessage,
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IInboundSignalMessage,
    ISummarizeResult,
    ISummarizerNode,
    ISummarizeInternalResult,
    CreateChildSummarizerNodeFn,
    SummarizeInternalFn,
    CreateChildSummarizerNodeParam,
} from "@fluidframework/runtime-definitions";
import { SummaryTracker, addBlobToSummary, convertToSummaryTree } from "@fluidframework/runtime-utils";
import { ContainerRuntime } from "./containerRuntime";

// Snapshot Format Version to be used in component attributes.
const currentSnapshotFormatVersion = "0.1";

/**
 * Added IFluidDataStoretAttributes similar to IChannelAttributes which will tell
 * the attributes of a component like the package, snapshotFormatVersion to
 * take different decisions based on a particular snapshotForamtVersion.
 */
export interface IFluidDataStoretAttributes {
    pkg: string;
    readonly snapshotFormatVersion?: string;
}

interface ISnapshotDetails {
    pkg: readonly string[];
    snapshot?: ISnapshotTree;
}

interface ComponentMessage {
    content: any;
    type: string;
}

/**
 * Represents the context for the component. This context is passed to the data store runtime.
 */
export abstract class FluidDataStoreContext extends EventEmitter implements
    IFluidDataStoreContext,
    IDisposable {
    public get documentId(): string {
        return this._containerRuntime.id;
    }

    public get packagePath(): readonly string[] {
        // The component must be loaded before the path is accessed.
        assert(this.loaded);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.pkg!;
    }

    public get parentBranch(): string | null {
        return this._containerRuntime.parentBranch;
    }

    public get options(): any {
        return this._containerRuntime.options;
    }

    public get clientId(): string | undefined {
        return this._containerRuntime.clientId;
    }

    public get blobManager(): IBlobManager {
        return this._containerRuntime.blobManager;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._containerRuntime.deltaManager;
    }

    public get connected(): boolean {
        return this._containerRuntime.connected;
    }

    public get leader(): boolean {
        return this._containerRuntime.leader;
    }

    // Back-compat: supporting <= 0.16 components
    public get connectionState(): ConnectionState {
        return this.connected ? ConnectionState.Connected : ConnectionState.Disconnected;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this._containerRuntime.snapshotFn;
    }

    public get branch(): string {
        return this._containerRuntime.branch;
    }

    public get loader(): ILoader {
        return this._containerRuntime.loader;
    }

    public get containerRuntime(): IContainerRuntime {
        return this._containerRuntime;
    }

    /**
     * @deprecated 0.17 Issue #1888 Rename IHostRuntime to IContainerRuntime and refactor usages
     * Use containerRuntime instead of hostRuntime
     */
    public get hostRuntime(): IContainerRuntime {
        return this._containerRuntime;
    }

    public get baseSnapshot(): ISnapshotTree | undefined {
        return this._baseSnapshot;
    }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    public get attachState(): AttachState {
        return this._attachState;
    }

    public readonly bindToContext: (componentRuntime: IFluidDataStoreChannel) => void;
    protected componentRuntime: IFluidDataStoreChannel | undefined;
    private loaded = false;
    protected pending: ISequencedDocumentMessage[] | undefined = [];
    private componentRuntimeDeferred: Deferred<IFluidDataStoreChannel> | undefined;
    private _baseSnapshot: ISnapshotTree | undefined;
    protected _attachState: AttachState;
    protected readonly summarizerNode: ISummarizerNode;

    constructor(
        private readonly _containerRuntime: ContainerRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IFluidObject & IFluidObject,
        public readonly summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        private bindState: BindState,
        bindComponent: (componentRuntime: IFluidDataStoreChannel) => void,
        protected pkg?: readonly string[],
    ) {
        super();

        this._attachState = existing ? AttachState.Attached : AttachState.Detached;

        this.bindToContext = (componentRuntime: IFluidDataStoreChannel) => {
            assert(this.bindState === BindState.NotBound);
            this.bindState = BindState.Binding;
            bindComponent(componentRuntime);
            this.bindState = BindState.Bound;
        };

        const thisSummarizeInternal = async (fullTree: boolean) => this.summarizeInternal(fullTree);
        this.summarizerNode = createSummarizerNode(thisSummarizeInternal);
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        // Dispose any pending runtime after it gets fulfilled
        if (this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred.promise.then((runtime) => {
                runtime.dispose();
            }).catch((error) => {
                this._containerRuntime.logger.sendErrorEvent(
                    { eventName: "ComponentRuntimeDisposeError", componentId: this.id },
                    error);
            });
        }
    }

    private async rejectDeferredRealize(reason: string) {
        const error = new Error(reason);
        // Error messages contain package names that is considered Personal Identifiable Information
        // Mark it as such, so that if it ever reaches telemetry pipeline, it has a chance to remove it.
        (error as any).containsPII = true;

        // This is always called with a componentRuntimeDeferred in realize();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const deferred = this.componentRuntimeDeferred!;
        deferred.reject(error);
        return deferred.promise;
    }

    public async realize(): Promise<IFluidDataStoreChannel> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IFluidDataStoreChannel>();
            const details = await this.getInitialSnapshotDetails();
            // Base snapshot is the baseline where pending ops are applied to.
            // It is important that this be in sync with the pending ops, and also
            // that it is set here, before bindRuntime is called.
            this._baseSnapshot = details.snapshot;
            const packages = details.pkg;
            let entry: FluidDataStoreRegistryEntry | undefined;
            let registry: IFluidDataStoreRegistry | undefined = this._containerRuntime.IFluidDataStoreRegistry;
            let factory: IFluidDataStoreFactory | undefined;
            let lastPkg: string | undefined;
            for (const pkg of packages) {
                if (!registry) {
                    return this.rejectDeferredRealize(`No registry for ${lastPkg} package`);
                }
                lastPkg = pkg;
                entry = await registry.get(pkg);
                if (!entry) {
                    return this.rejectDeferredRealize(`Registry does not contain entry for the package ${pkg}`);
                }
                factory = entry.IFluidDataStoreFactory;
                registry = entry.IFluidDataStoreRegistry;
            }
            if (factory === undefined) {
                return this.rejectDeferredRealize(`Can't find factory for ${lastPkg} package`);
            }
            // During this call we will invoke the instantiate method - which will call back into us
            // via the bindRuntime call to resolve componentRuntimeDeferred
            factory.instantiateDataStore(this);
        }

        return this.componentRuntimeDeferred.promise;
    }

    public async realizeWithFn(
        realizationFn: (context: IFluidDataStoreContext) => void,
    ): Promise<IFluidDataStoreChannel> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IFluidDataStoreChannel>();
            realizationFn(this);
        }

        return this.componentRuntimeDeferred.promise;
    }

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        // Connection events are ignored if the component is not yet loaded
        if (!this.loaded) {
            return;
        }

        assert(this.connected === connected);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const runtime: IFluidDataStoreChannel = this.componentRuntime!;

        // Back-compat: supporting <= 0.16 components
        if (runtime.setConnectionState) {
            runtime.setConnectionState(connected, clientId);
        } else if (runtime.changeConnectionState) {
            runtime.changeConnectionState(this.connectionState, clientId);
        } else {
            assert(false);
        }
    }

    public process(messageArg: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.verifyNotClosed();

        const innerContents = messageArg.contents as ComponentMessage;
        const message = {
            ...messageArg,
            type: innerContents.type,
            contents: innerContents.content,
        };

        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);
        this.summarizerNode.recordChange(message);

        if (this.loaded) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this.componentRuntime!.process(message, local, localOpMetadata);
        } else {
            assert(!local, "local component is not loaded");
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push(message);
        }
    }

    public processSignal(message: IInboundSignalMessage, local: boolean): void {
        this.verifyNotClosed();

        // Signals are ignored if the component is not yet loaded
        if (!this.loaded) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.componentRuntime!.processSignal(message, local);
    }

    public getQuorum(): IQuorum {
        return this._containerRuntime.getQuorum();
    }

    public getAudience(): IAudience {
        return this._containerRuntime.getAudience();
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    /**
     * Notifies the object to take snapshot of a component.
     * @deprecated in 0.22 summarizerNode
     */
    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        if (!fullTree) {
            const id = await this.summaryTracker.getId();
            if (id !== undefined) {
                return { id, entries: [] };
            }
        }

        const { pkg } = await this.getInitialSnapshotDetails();

        const componentAttributes: IFluidDataStoretAttributes = {
            pkg: JSON.stringify(pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        await this.realize();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entries = await this.componentRuntime!.snapshotInternal(fullTree);

        entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        return { entries, id: null };
    }

    public async summarize(fullTree = false): Promise<ISummarizeResult> {
        return this.summarizerNode.summarize(fullTree);
    }

    private async summarizeInternal(fullTree: boolean): Promise<ISummarizeInternalResult> {
        const { pkg } = await this.getInitialSnapshotDetails();

        const componentAttributes: IFluidDataStoretAttributes = {
            pkg: JSON.stringify(pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        await this.realize();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const componentRuntime = this.componentRuntime!;
        if (componentRuntime.summarize !== undefined) {
            const summary = await componentRuntime.summarize(fullTree);
            addBlobToSummary(summary, ".component", JSON.stringify(componentAttributes));
            return { ...summary, id: this.id };
        } else {
            // back-compat summarizerNode - remove this case
            const entries = await componentRuntime.snapshotInternal(fullTree);
            entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));
            const summary = convertToSummaryTree({ entries, id: null });
            return { ...summary, id: this.id };
        }
    }

    /**
     * @deprecated 0.18.Should call request on the runtime directly
     */
    public async request(request: IRequest): Promise<IResponse> {
        const runtime = await this.realize();
        return runtime.request(request);
    }

    public submitMessage(type: string, content: any, localOpMetadata: unknown): void {
        this.verifyNotClosed();
        assert(this.componentRuntime);
        const componentContent: ComponentMessage = {
            content,
            type,
        };
        this._containerRuntime.submitComponentOp(
            this.id,
            componentContent,
            localOpMetadata);
    }

    /**
     * This is called from a SharedSummaryBlock that does not generate ops but only wants to be part of the summary.
     * It indicates that there is data in the object that needs to be summarized.
     * We will update the latestSequenceNumber of the summary tracker of this component and of the object's channel.
     *
     * @param address - The address of the channel that is dirty.
     *
     */
    public setChannelDirty(address: string): void {
        this.verifyNotClosed();

        // Get the latest sequence number.
        const latestSequenceNumber = this.deltaManager.lastSequenceNumber;

        // Update our summary tracker's latestSequenceNumber.
        this.summaryTracker.updateLatestSequenceNumber(latestSequenceNumber);
        this.summarizerNode.invalidate(latestSequenceNumber);

        const channelSummaryTracker = this.summaryTracker.getChild(address);
        const channelSummarizerNode = this.summarizerNode.getChild(address);
        // If there is a summary tracker for the channel that called us, update it's latestSequenceNumber.
        if (channelSummaryTracker) {
            channelSummaryTracker.updateLatestSequenceNumber(latestSequenceNumber);
        }
        if (channelSummarizerNode) {
            channelSummarizerNode.invalidate(latestSequenceNumber); // TODO: lazy load problem?
        }
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        assert(this.componentRuntime);
        return this._containerRuntime.submitComponentSignal(this.id, type, content);
    }

    public raiseContainerWarning(warning: ContainerWarning): void {
        this.containerRuntime.raiseContainerWarning(warning);
    }

    /**
     * Updates the leader.
     * @param leadership - Whether this client is the new leader or not.
     */
    public updateLeader(leadership: boolean) {
        // Leader events are ignored if the component is not yet loaded
        if (!this.loaded) {
            return;
        }
        if (leadership) {
            this.emit("leader");
        } else {
            this.emit("notleader");
        }
    }

    public bindRuntime(componentRuntime: IFluidDataStoreChannel) {
        if (this.componentRuntime) {
            throw new Error("runtime already bound");
        }

        // If this FluidDataStoreContext was created via `IContainerRuntime.createDataStoreContext`, the
        // `componentRuntimeDeferred` promise hasn't yet been initialized.  Do so now.
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred();
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pending = this.pending!;

        if (pending.length > 0) {
            // Apply all pending ops
            for (const op of pending) {
                componentRuntime.process(op, false, undefined /* localOpMetadata */);
            }
        }

        this.pending = undefined;

        // And now mark the runtime active
        this.loaded = true;
        this.componentRuntime = componentRuntime;

        // Freeze the package path to ensure that someone doesn't modify it when it is
        // returned in packagePath().
        Object.freeze(this.pkg);

        // And notify the pending promise it is now available
        this.componentRuntimeDeferred.resolve(this.componentRuntime);

        // notify the runtime if they want to propagate up. Used for logging.
        this.containerRuntime.notifyDataStoreInstantiated(this);
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.attachState !== AttachState.Attached) {
            return undefined;
        }
        return this._containerRuntime.getAbsoluteUrl(relativeUrl);
    }

    /**
     * Take a package name and transform it into a path that can be used to find it
     * from this context, such as by looking into subregistries
     * @param subpackage - The subpackage to find in this context
     * @returns A list of packages to the subpackage destination if found,
     * otherwise the original subpackage
     */
    public async composeSubpackagePath(subpackage: string): Promise<string[]> {
        const details = await this.getInitialSnapshotDetails();
        let packagePath: string[] = [...details.pkg];

        // A factory could not contain the registry for itself. So if it is the same the last snapshot
        // pkg, return our package path.
        if (packagePath.length > 0 && subpackage === packagePath[packagePath.length - 1]) {
            return packagePath;
        }

        // Look for the package entry in our sub-registry. If we find the entry, we need to add our path
        // to the packagePath. If not, look into the global registry and the packagePath becomes just the
        // passed package.
        if (await this.componentRuntime?.IFluidDataStoreRegistry?.get(subpackage)) {
            packagePath.push(subpackage);
        } else {
            if (!(await this._containerRuntime.IFluidDataStoreRegistry.get(subpackage))) {
                throw new Error(`Registry does not contain entry for package '${subpackage}'`);
            }

            packagePath = [subpackage];
        }

        return packagePath;
    }

    public abstract generateAttachMessage(): IAttachMessage;

    protected abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

    public reSubmit(contents: any, localOpMetadata: unknown) {
        assert(this.componentRuntime, "FluidDataStoreRuntime must exist when resubmitting ops");
        const innerContents = contents as ComponentMessage;
        this.componentRuntime.reSubmit(innerContents.type, innerContents.content, localOpMetadata);
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Context is closed");
        }
    }

    public getCreateChildSummarizerNodeFn(id: string, createParam: CreateChildSummarizerNodeParam) {
        return (summarizeInternal: SummarizeInternalFn) => this.summarizerNode.createChild(
            summarizeInternal,
            id,
            createParam,
            // DDS will not create failure summaries
            { throwOnFailure: true },
        );
    }
}

export class RemotedFluidDataStoreContext extends FluidDataStoreContext {
    private details: ISnapshotDetails | undefined;

    constructor(
        id: string,
        private readonly initSnapshotValue: Promise<ISnapshotTree> | string | null,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject & IFluidObject,
        summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        pkg?: string[],
    ) {
        super(
            runtime,
            id,
            true,
            storage,
            scope,
            summaryTracker,
            createSummarizerNode,
            BindState.Bound,
            () => {
                throw new Error("Already attached");
            },
            pkg);
    }

    public generateAttachMessage(): IAttachMessage {
        throw new Error("Cannot attach remote component");
    }

    // This should only be called during realize to get the baseSnapshot,
    // or it can be called at any time to get the pkg, but that assumes the
    // pkg can never change for a component.
    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        if (!this.details) {
            let tree: ISnapshotTree | null;

            if (typeof this.initSnapshotValue === "string") {
                const commit = (await this.storage.getVersions(this.initSnapshotValue, 1))[0];
                tree = await this.storage.getSnapshotTree(commit);
            } else {
                tree = await this.initSnapshotValue;
            }

            const localReadAndParse = async <T>(id: string) => readAndParse<T>(this.storage, id);
            if (tree) {
                const loadedSummary = await this.summarizerNode.loadBaseSummary(tree, localReadAndParse);
                tree = loadedSummary.baseSummary;
                // Prepend outstanding ops to pending queue of ops to process.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.pending = loadedSummary.outstandingOps.concat(this.pending!);
            }

            if (tree !== null && tree.blobs[".component"] !== undefined) {
                // Need to rip through snapshot and use that to populate extraBlobs
                const { pkg, snapshotFormatVersion } =
                    await localReadAndParse<IFluidDataStoretAttributes>(tree.blobs[".component"]);

                let pkgFromSnapshot: string[];
                // Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
                // For snapshotFormatVersion = "0.1", pkg is jsonified, otherwise it is just a string.
                if (snapshotFormatVersion === undefined) {
                    if (pkg.startsWith("[\"") && pkg.endsWith("\"]")) {
                        pkgFromSnapshot = JSON.parse(pkg) as string[];
                    } else {
                        pkgFromSnapshot = [pkg];
                    }
                } else if (snapshotFormatVersion === currentSnapshotFormatVersion) {
                    pkgFromSnapshot = JSON.parse(pkg) as string[];
                } else {
                    throw new Error(`Invalid snapshot format version ${snapshotFormatVersion}`);
                }
                this.pkg = pkgFromSnapshot;
            }

            this.details = {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                pkg: this.pkg!,
                snapshot: tree ?? undefined,
            };
        }

        return this.details;
    }
}

export class LocalFluidDataStoreContext extends FluidDataStoreContext {
    constructor(
        id: string,
        pkg: string[],
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject & IFluidObject,
        summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindComponent: (componentRuntime: IFluidDataStoreChannel) => void,
    ) {
        super(
            runtime,
            id,
            false,
            storage,
            scope,
            summaryTracker,
            createSummarizerNode,
            BindState.NotBound,
            bindComponent,
            pkg);
        this.attachListeners();
    }

    private attachListeners(): void {
        this.once("attaching", () => {
            assert.strictEqual(this.attachState, AttachState.Detached, "Should move from detached to attaching");
            this._attachState = AttachState.Attaching;
        });
        this.once("attached", () => {
            assert.strictEqual(this.attachState, AttachState.Attaching, "Should move from attaching to attached");
            this._attachState = AttachState.Attached;
        });
    }

    public generateAttachMessage(): IAttachMessage {
        const componentAttributes: IFluidDataStoretAttributes = {
            pkg: JSON.stringify(this.pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entries = this.componentRuntime!.getAttachSnapshot();

        const snapshot: ITree = { entries, id: null };

        snapshot.entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        const message: IAttachMessage = {
            id: this.id,
            snapshot,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            type: this.pkg![this.pkg!.length - 1],
        };

        return message;
    }

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        return {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            pkg: this.pkg!,
            snapshot: undefined,
        };
    }
}
