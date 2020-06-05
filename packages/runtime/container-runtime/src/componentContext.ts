/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import EventEmitter from "events";
import { IDisposable } from "@fluidframework/common-definitions";
import { IComponent, IComponentLoadable, IRequest, IResponse } from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ContainerWarning,
    ILoader,
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
    MessageType,
    ConnectionState,
} from "@fluidframework/protocol-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
    ComponentRegistryEntry,
    IComponentRuntimeChannel,
    IAttachMessage,
    IComponentContext,
    IComponentContextLegacy,
    IComponentFactory,
    IComponentRegistry,
    IEnvelope,
    IInboundSignalMessage,
} from "@fluidframework/runtime-definitions";
import { SummaryTracker, strongAssert } from "@fluidframework/runtime-utils";
import { v4 as uuid } from "uuid";
import { ContainerRuntime } from "./containerRuntime";

// Snapshot Format Version to be used in component attributes.
const currentSnapshotFormatVersion = "0.1";

/**
 * Added IComponentAttributes similar to IChannelAttributes which will tell
 * the attributes of a component like the package, snapshotFormatVersion to
 * take different decisions based on a particular snapshotForamtVersion.
 */
export interface IComponentAttributes {
    pkg: string;
    readonly snapshotFormatVersion?: string;
}

interface ISnapshotDetails {
    pkg: readonly string[];
    snapshot?: ISnapshotTree;
}

/**
 * Represents the context for the component. This context is passed to the component runtime.
 */
export abstract class ComponentContext extends EventEmitter implements
    IComponentContext,
    IComponentContextLegacy,
    IDisposable
{
    public readonly isExperimentalComponentContext = true;

    public isLocal(): boolean {
        return this.containerRuntime.isLocal() || !this.isAttached;
    }

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

    public get submitSignalFn(): (contents: any) => void {
        return this._containerRuntime.submitSignalFn;
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

    public get isAttached(): boolean {
        return this._isAttached;
    }

    public readonly attach: (componentRuntime: IComponentRuntimeChannel) => void;
    protected componentRuntime: IComponentRuntimeChannel | undefined;
    private loaded = false;
    private pending: ISequencedDocumentMessage[] | undefined = [];
    private componentRuntimeDeferred: Deferred<IComponentRuntimeChannel> | undefined;
    private _baseSnapshot: ISnapshotTree | undefined;

    constructor(
        private readonly _containerRuntime: ContainerRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IComponent,
        public readonly summaryTracker: SummaryTracker,
        private _isAttached: boolean,
        attach: (componentRuntime: IComponentRuntimeChannel) => void,
        protected pkg?: readonly string[],
    ) {
        super();

        this.attach = (componentRuntime: IComponentRuntimeChannel) => {
            attach(componentRuntime);
            this._isAttached = true;
        };
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

    /**
     * @deprecated
     * Remove once issue #1756 is closed
     */
    public async createComponent(
        pkgOrId: string | undefined,
        pkg?: string,
        props?: any,
    ): Promise<IComponentRuntimeChannel> {
        // pkgOrId can't be undefined if pkg is undefined
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const pkgName = pkg ?? pkgOrId!;
        assert(pkgName);
        const id = pkg ? (pkgOrId ?? uuid()) : uuid();

        const packagePath: string[] = await this.composeSubpackagePath(pkgName);

        return this.containerRuntime._createComponentWithProps(packagePath, props, id);
    }

    public async createComponentWithRealizationFn(
        pkg: string,
        realizationFn?: (context: IComponentContext) => void,
    ): Promise<IComponent & IComponentLoadable> {
        const packagePath = await this.composeSubpackagePath(pkg);

        const componentRuntime = await this.containerRuntime.createComponentWithRealizationFn(
            packagePath,
            realizationFn,
        );
        const response = await componentRuntime.request({ url: "/" });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error("Failed to create component");
        }

        return response.value;
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

    public async realize(): Promise<IComponentRuntimeChannel> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IComponentRuntimeChannel>();
            const details = await this.getInitialSnapshotDetails();
            // Base snapshot is the baseline where pending ops are applied to.
            // It is important that this be in sync with the pending ops, and also
            // that it is set here, before bindRuntime is called.
            this._baseSnapshot = details.snapshot;
            const packages = details.pkg;
            let entry: ComponentRegistryEntry | undefined;
            let registry: IComponentRegistry | undefined = this._containerRuntime.IComponentRegistry;
            let factory: IComponentFactory | undefined;
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
                factory = entry.IComponentFactory;
                registry = entry.IComponentRegistry;
            }

            if (factory === undefined) {
                return this.rejectDeferredRealize(`Can't find factory for ${lastPkg} package`);
            }
            // During this call we will invoke the instantiate method - which will call back into us
            // via the bindRuntime call to resolve componentRuntimeDeferred
            factory.instantiateComponent(this);
        }

        return this.componentRuntimeDeferred.promise;
    }

    public async realizeWithFn(
        realizationFn: (context: IComponentContext) => void,
    ): Promise<IComponentRuntimeChannel> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IComponentRuntimeChannel>();
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
        const runtime: IComponentRuntimeChannel = this.componentRuntime!;

        // Back-compat: supporting <= 0.16 components
        if (runtime.setConnectionState) {
            runtime.setConnectionState(connected, clientId);
        } else if (runtime.changeConnectionState) {
            runtime.changeConnectionState(this.connectionState, clientId);
        } else {
            assert(false);
        }
    }

    public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.verifyNotClosed();

        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);

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
     */
    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        if (!fullTree) {
            const id = await this.summaryTracker.getId();
            if (id !== undefined) {
                return { id, entries: [] };
            }
        }

        const { pkg } = await this.getInitialSnapshotDetails();

        const componentAttributes: IComponentAttributes = {
            pkg: JSON.stringify(pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        await this.realize();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const entries = await this.componentRuntime!.snapshotInternal(fullTree);

        entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        return { entries, id: null };
    }

    /**
     * @deprecated 0.18.Should call request on the runtime directly
     */
    public async request(request: IRequest): Promise<IResponse> {
        const runtime = await this.realize();
        return runtime.request(request);
    }

    public submitMessage(type: MessageType, content: any, localOpMetadata: unknown): number {
        this.verifyNotClosed();
        assert(this.componentRuntime);
        return this.submitOp(type, content, localOpMetadata);
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

        const channelSummaryTracker = this.summaryTracker.getChild(address);
        // If there is a summary tracker for the channel that called us, update it's latestSequenceNumber.
        if (channelSummaryTracker) {
            channelSummaryTracker.updateLatestSequenceNumber(latestSequenceNumber);
        }
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        assert(this.componentRuntime);
        const envelope: IEnvelope = {
            address: this.id,
            contents: {
                content,
                type,
            },
        };
        return this._containerRuntime.submitSignalFn(envelope);
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

    public bindRuntime(componentRuntime: IComponentRuntimeChannel) {
        if (this.componentRuntime) {
            throw new Error("runtime already bound");
        }

        // If this ComponentContext was created via `IContainerRuntime.createComponentContext`, the
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
        this.containerRuntime.notifyComponentInstantiated(this);
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string> {
        return this._containerRuntime.getAbsoluteUrl(relativeUrl);
    }

    /**
     * Take a package name and transform it into a path that can be used to find it
     * from this context, such as by looking into subregistries
     * @param subpackage - The subpackage to find in this context
     * @returns A list of packages to the subpackage destination if found,
     * otherwise the original subpackage
     */
    protected async composeSubpackagePath(subpackage: string): Promise<string[]> {
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
        if (await this.componentRuntime?.IComponentRegistry?.get(subpackage)) {
            packagePath.push(subpackage);
        } else {
            if (!(await this._containerRuntime.IComponentRegistry.get(subpackage))) {
                throw new Error(`Registry does not contain entry for package '${subpackage}'`);
            }

            packagePath = [subpackage];
        }

        return packagePath;
    }

    public abstract generateAttachMessage(): IAttachMessage;

    protected abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

    private submitOp(type: MessageType, content: any, localOpMetadata: unknown): number {
        this.verifyNotClosed();
        const envelope: IEnvelope = {
            address: this.id,
            contents: {
                content,
                type,
            },
        };
        return this._containerRuntime.submit(MessageType.Operation, envelope, localOpMetadata);
    }

    public reSubmit(type: MessageType, content: any, localOpMetadata: unknown) {
        strongAssert(this.componentRuntime, "ComponentRuntime must exist when resubmitting ops");

        // back-compat: 0.18 components
        if (this.componentRuntime.reSubmit) {
            this.componentRuntime.reSubmit(type, content, localOpMetadata);
        }
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Context is closed");
        }
    }

    public async createAlias(alias: string): Promise<string> {
        return this._containerRuntime.createComponentAlias(this.id, alias);
    }
}

export class RemotedComponentContext extends ComponentContext {
    private details: ISnapshotDetails | undefined;

    constructor(
        id: string,
        private readonly initSnapshotValue: Promise<ISnapshotTree> | string | null,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        summaryTracker: SummaryTracker,
        pkg?: string[],
    ) {
        super(
            runtime,
            id,
            true,
            storage,
            scope,
            summaryTracker,
            true,
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

            if (tree !== null && tree.blobs[".component"] !== undefined) {
                // Need to rip through snapshot and use that to populate extraBlobs
                const { pkg, snapshotFormatVersion } =
                    await readAndParse<IComponentAttributes>(
                        this.storage,
                        tree.blobs[".component"]);

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

export class LocalComponentContext extends ComponentContext {
    constructor(
        id: string,
        pkg: string[],
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        summaryTracker: SummaryTracker,
        attachCb: (componentRuntime: IComponentRuntimeChannel) => void,
        /**
         * @deprecated 0.16 Issue #1635 Use the IComponentFactory creation methods instead to specify initial state
         */
        public readonly createProps?: any,
    ) {
        super(runtime, id, false, storage, scope, summaryTracker, false, attachCb, pkg);
    }

    public generateAttachMessage(): IAttachMessage {
        const componentAttributes: IComponentAttributes = {
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
