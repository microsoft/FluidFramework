/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import EventEmitter from "events";
import { IDisposable } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
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
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
    FluidDataStoreRegistryEntry,
    IFluidDataStoreChannel,
    IAttachMessage,
    IFluidDataStoreContext,
    IFluidDataStoreContextDetached,
    IFluidDataStoreRegistry,
    IInboundSignalMessage,
    ISummarizeResult,
    ISummarizerNode,
    ISummarizeInternalResult,
    CreateChildSummarizerNodeFn,
    SummarizeInternalFn,
    CreateChildSummarizerNodeParam,
    IProvideFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import { SummaryTracker, addBlobToSummary, convertToSummaryTree } from "@fluidframework/runtime-utils";
import { ContainerRuntime } from "./containerRuntime";

// Snapshot Format Version to be used in store attributes.
export const currentSnapshotFormatVersion = "0.1";

const attributesBlobKey = ".component";

function createAttributes(pkg: readonly string[]): IFluidDataStoreAttributes {
    const stringifiedPkg = JSON.stringify(pkg);
    return {
        pkg: stringifiedPkg,
        snapshotFormatVersion: currentSnapshotFormatVersion,
    };
}
export function createAttributesBlob(pkg: readonly string[]): ITreeEntry {
    const attributes = createAttributes(pkg);
    return new BlobTreeEntry(attributesBlobKey, JSON.stringify(attributes));
}

/**
 * Added IFluidDataStoreAttributes similar to IChannelAttributes which will tell
 * the attributes of a store like the package, snapshotFormatVersion to
 * take different decisions based on a particular snapshotFormatVersion.
 */
export interface IFluidDataStoreAttributes {
    pkg: string;
    readonly snapshotFormatVersion?: string;
}

interface ISnapshotDetails {
    pkg: readonly string[];
    snapshot?: ISnapshotTree;
}

interface FluidDataStoreMessage {
    content: any;
    type: string;
}

/**
 * Represents the context for the store. This context is passed to the store runtime.
 */
export abstract class FluidDataStoreContext extends EventEmitter implements
    IFluidDataStoreContext,
    IDisposable {
    public get documentId(): string {
        return this._containerRuntime.id;
    }

    public get packagePath(): readonly string[] {
        // The store must be loaded before the path is accessed.
        assert(this.loaded);
        assert(this.pkg !== undefined);
        return this.pkg;
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

    // Back-compat: supporting <= 0.16 stores
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

    public get isLoaded(): boolean {
        return this.loaded;
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

    public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry | undefined {
        return this.registry;
    }

    protected registry: IFluidDataStoreRegistry | undefined;

    protected detachedRuntimeCreation = false;
    public readonly bindToContext: (channel: IFluidDataStoreChannel) => void;
    protected channel: IFluidDataStoreChannel | undefined;
    private loaded = false;
    protected pending: ISequencedDocumentMessage[] | undefined = [];
    protected channelDeferred: Deferred<IFluidDataStoreChannel> | undefined;
    private _baseSnapshot: ISnapshotTree | undefined;
    protected _attachState: AttachState;
    protected readonly summarizerNode: ISummarizerNode;

    constructor(
        private readonly _containerRuntime: ContainerRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IFluidObject,
        public readonly summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        private bindState: BindState,
        public readonly isLocalDataStore: boolean,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        protected pkg?: readonly string[],
    ) {
        super();

        this._attachState = this.containerRuntime.attachState !== AttachState.Detached && existing ?
            this.containerRuntime.attachState : AttachState.Detached;

        this.bindToContext = (channel: IFluidDataStoreChannel) => {
            assert(this.bindState === BindState.NotBound);
            this.bindState = BindState.Binding;
            bindChannel(channel);
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
        if (this.channelDeferred) {
            this.channelDeferred.promise.then((runtime) => {
                runtime.dispose();
            }).catch((error) => {
                this._containerRuntime.logger.sendErrorEvent(
                    { eventName: "ChannelDisposeError", fluidDataStoreId: this.id },
                    error);
            });
        }
    }

    private rejectDeferredRealize(reason: string): never {
        const error = new Error(reason);
        // Error messages contain package names that is considered Personal Identifiable Information
        // Mark it as such, so that if it ever reaches telemetry pipeline, it has a chance to remove it.
        (error as any).containsPII = true;
        throw error;
    }

    public async realize(): Promise<IFluidDataStoreChannel> {
        assert(!this.detachedRuntimeCreation);
        if (!this.channelDeferred) {
            this.channelDeferred = new Deferred<IFluidDataStoreChannel>();
            this.realizeCore().catch((error) => {
                this.channelDeferred?.reject(error);
            });
        }
        return this.channelDeferred.promise;
    }

    protected async factoryFromPackagePath(packages) {
        assert(this.pkg === packages);

        let entry: FluidDataStoreRegistryEntry | undefined;
        let registry: IFluidDataStoreRegistry | undefined = this._containerRuntime.IFluidDataStoreRegistry;
        let lastPkg: string | undefined;
        for (const pkg of packages) {
            if (!registry) {
                this.rejectDeferredRealize(`No registry for ${lastPkg} package`);
            }
            lastPkg = pkg;
            entry = await registry.get(pkg);
            if (!entry) {
                this.rejectDeferredRealize(`Registry does not contain entry for the package ${pkg}`);
            }
            registry = entry.IFluidDataStoreRegistry;
        }
        const factory = entry?.IFluidDataStoreFactory;
        if (factory === undefined) {
            this.rejectDeferredRealize(`Can't find factory for ${lastPkg} package`);
        }

        return { factory, registry };
    }

    private async realizeCore(): Promise<void> {
        const details = await this.getInitialSnapshotDetails();
        // Base snapshot is the baseline where pending ops are applied to.
        // It is important that this be in sync with the pending ops, and also
        // that it is set here, before bindRuntime is called.
        this._baseSnapshot = details.snapshot;
        const packages = details.pkg;

        const { factory, registry } = await this.factoryFromPackagePath(packages);

        assert(this.registry === undefined);
        this.registry = registry;

        const channel = await factory.instantiateDataStore(this);

        // back-compat: <= 0.25 allows returning nothing and calling bindRuntime() later directly.
        if (channel !== undefined) {
            this.bindRuntime(channel);
        }
    }

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        // Connection events are ignored if the store is not yet loaded
        if (!this.loaded) {
            return;
        }

        assert(this.connected === connected);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const channel: IFluidDataStoreChannel = this.channel!;

        // Back-compat: supporting <= 0.16 stores
        if (channel.setConnectionState) {
            channel.setConnectionState(connected, clientId);
        } else if (channel.changeConnectionState) {
            channel.changeConnectionState(this.connectionState, clientId);
        } else {
            assert(false);
        }
    }

    public process(messageArg: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.verifyNotClosed();

        const innerContents = messageArg.contents as FluidDataStoreMessage;
        const message = {
            ...messageArg,
            type: innerContents.type,
            contents: innerContents.content,
        };

        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);
        this.summarizerNode.recordChange(message);

        if (this.loaded) {
            return this.channel?.process(message, local, localOpMetadata);
        } else {
            assert(!local, "local store channel is not loaded");
            this.pending?.push(message);
        }
    }

    public processSignal(message: IInboundSignalMessage, local: boolean): void {
        this.verifyNotClosed();

        // Signals are ignored if the store is not yet loaded
        if (!this.loaded) {
            return;
        }

        this.channel?.processSignal(message, local);
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
     * Notifies the object to take snapshot of a store.
     * @deprecated in 0.22 summarizerNode
     */
    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        if (!fullTree) {
            const id = await this.summaryTracker.getId();
            if (id !== undefined) {
                return { id, entries: [] };
            }
        }

        await this.realize();

        const { pkg } = await this.getInitialSnapshotDetails();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entries = await this.channel!.snapshotInternal(fullTree);

        const attributesBlob = createAttributesBlob(pkg);
        entries.push(attributesBlob);

        return { entries, id: null };
    }

    public async summarize(fullTree = false): Promise<ISummarizeResult> {
        return this.summarizerNode.summarize(fullTree);
    }

    private async summarizeInternal(fullTree: boolean): Promise<ISummarizeInternalResult> {
        await this.realize();

        const { pkg } = await this.getInitialSnapshotDetails();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const channel = this.channel!;
        if (channel.summarize !== undefined) {
            const summary = await channel.summarize(fullTree);
            const attributes: IFluidDataStoreAttributes = createAttributes(pkg);
            addBlobToSummary(summary, attributesBlobKey, JSON.stringify(attributes));
            return { ...summary, id: this.id };
        } else {
            // back-compat summarizerNode - remove this case
            const entries = await channel.snapshotInternal(fullTree);
            const attributesBlob = createAttributesBlob(pkg);
            entries.push(attributesBlob);
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
        assert(this.channel);
        const fluidDataStoreContent: FluidDataStoreMessage = {
            content,
            type,
        };
        this._containerRuntime.submitDataStoreOp(
            this.id,
            fluidDataStoreContent,
            localOpMetadata);
    }

    /**
     * This is called from a SharedSummaryBlock that does not generate ops but only wants to be part of the summary.
     * It indicates that there is data in the object that needs to be summarized.
     * We will update the latestSequenceNumber of the summary tracker of this
     * store and of the object's channel.
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
        assert(this.channel);
        return this._containerRuntime.submitDataStoreSignal(this.id, type, content);
    }

    public raiseContainerWarning(warning: ContainerWarning): void {
        this.containerRuntime.raiseContainerWarning(warning);
    }

    /**
     * Updates the leader.
     * @param leadership - Whether this client is the new leader or not.
     */
    public updateLeader(leadership: boolean) {
        // Leader events are ignored if the store is not yet loaded
        if (!this.loaded) {
            return;
        }
        if (leadership) {
            this.emit("leader");
        } else {
            this.emit("notleader");
        }
    }

    public bindRuntime(channel: IFluidDataStoreChannel) {
        if (this.channel) {
            throw new Error("Runtime already bound");
        }

        try
        {
            assert(!this.detachedRuntimeCreation);
            assert(this.channelDeferred !== undefined);
            assert(this.pkg !== undefined);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const pending = this.pending!;

            if (pending.length > 0) {
                // Apply all pending ops
                for (const op of pending) {
                    channel.process(op, false, undefined /* localOpMetadata */);
                }
            }

            this.pending = undefined;

            // And now mark the runtime active
            this.loaded = true;
            this.channel = channel;

            // Freeze the package path to ensure that someone doesn't modify it when it is
            // returned in packagePath().
            Object.freeze(this.pkg);

            // And notify the pending promise it is now available
            this.channelDeferred.resolve(this.channel);
        } catch (error) {
            this.channelDeferred?.reject(error);
        }

        // notify the runtime if they want to propagate up. Used for logging.
        this._containerRuntime.notifyDataStoreInstantiated(this);
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.attachState !== AttachState.Attached) {
            return undefined;
        }
        return this._containerRuntime.getAbsoluteUrl(relativeUrl);
    }

    public abstract generateAttachMessage(): IAttachMessage;

    protected abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

    public reSubmit(contents: any, localOpMetadata: unknown) {
        assert(this.channel, "Channel must exist when resubmitting ops");
        const innerContents = contents as FluidDataStoreMessage;
        this.channel.reSubmit(innerContents.type, innerContents.content, localOpMetadata);
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
        scope: IFluidObject,
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
            false,
            () => {
                throw new Error("Already attached");
            },
            pkg);
    }

    public generateAttachMessage(): IAttachMessage {
        throw new Error("Cannot attach remote store");
    }

    // This should only be called during realize to get the baseSnapshot,
    // or it can be called at any time to get the pkg, but that assumes the
    // pkg can never change for a store.
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

            if (tree !== null && tree.blobs[attributesBlobKey] !== undefined) {
                // Need to rip through snapshot and use that to populate extraBlobs
                const { pkg, snapshotFormatVersion } =
                    await localReadAndParse<IFluidDataStoreAttributes>(tree.blobs[attributesBlobKey]);

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

/**
 * Base class for detached & attached context classes
 */
export class LocalFluidDataStoreContextBase extends FluidDataStoreContext {
    constructor(
        id: string,
        pkg: string[] | undefined,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject,
        summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        private readonly snapshotTree: ISnapshotTree | undefined,
    ) {
        super(
            runtime,
            id,
            snapshotTree !== undefined ? true : false,
            storage,
            scope,
            summaryTracker,
            createSummarizerNode,
            snapshotTree ? BindState.Bound : BindState.NotBound,
            true,
            bindChannel,
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entries = this.channel!.getAttachSnapshot();

        const snapshot: ITree = { entries, id: null };

        assert(this.pkg !== undefined);
        const attributesBlob = createAttributesBlob(this.pkg);
        snapshot.entries.push(attributesBlob);

        const message: IAttachMessage = {
            id: this.id,
            snapshot,
            type: this.pkg[this.pkg.length - 1],
        };

        return message;
    }

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        assert(this.pkg !== undefined);
        return {
            pkg: this.pkg,
            snapshot: this.snapshotTree,
        };
    }
}

/**
 * context implementation for "attached" data store runtime.
 * Various workflows (snapshot creation, requests) result in .realize() being called
 * on context, resulting in instantiation and attachment of runtime.
 * Runtime is created using data store factory that is associated with this context.
 */
export class LocalFluidDataStoreContext extends LocalFluidDataStoreContextBase {
    constructor(
        id: string,
        pkg: string[],
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject & IFluidObject,
        summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        snapshotTree: ISnapshotTree | undefined,
    ) {
        super(
            id,
            pkg,
            runtime,
            storage,
            scope,
            summaryTracker,
            createSummarizerNode,
            bindChannel,
            snapshotTree);
    }
}

/**
 * Detached context. Data Store runtime will be attached to it by attachRuntime() call
 * Before attachment happens, this context is not associated with particular type of runtime
 * or factory, i.e. it's package path is undefined.
 * Attachment process provides all missing parts - package path, data store runtime, and data store factory
 */
export class LocalDetachedFluidDataStoreContext
    extends LocalFluidDataStoreContextBase
    implements IFluidDataStoreContextDetached
{
    constructor(
        id: string,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject & IFluidObject,
        summaryTracker: SummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        snapshotTree: ISnapshotTree | undefined,
    ) {
        super(
            id,
            undefined, // pkg
            runtime,
            storage,
            scope,
            summaryTracker,
            createSummarizerNode,
            bindChannel,
            snapshotTree);
        assert(this.pkg === undefined);
        this.detachedRuntimeCreation = true;
    }

    public async attachRuntime(
        packagePath: Readonly<string[]>,
        registry: IProvideFluidDataStoreFactory,
        dataStoreRuntime: IFluidDataStoreChannel)
    {
        assert(this.detachedRuntimeCreation);
        assert(this.channelDeferred === undefined);
        assert(this.pkg === undefined);

        const factory = registry.IFluidDataStoreFactory;
        this.pkg = packagePath;

        const entry = await this.factoryFromPackagePath(this.pkg);
        assert(entry.factory === factory);

        assert(this.registry === undefined);
        this.registry = entry.registry;

        this.detachedRuntimeCreation = false;
        this.channelDeferred = new Deferred<IFluidDataStoreChannel>();

        super.bindRuntime(dataStoreRuntime);
    }

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        if (this.detachedRuntimeCreation) {
            throw new Error("Detached Fluid Data Store context can't be realized! Please attach runtime first!");
        }
        return super.getInitialSnapshotDetails();
    }
}
