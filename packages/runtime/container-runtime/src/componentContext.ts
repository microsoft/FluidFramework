/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { IDisposable } from "@microsoft/fluid-common-definitions";
import { IComponent, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ILoader,
} from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { readAndParse } from "@microsoft/fluid-driver-utils";
import { BlobTreeEntry, raiseConnectedEvent } from "@microsoft/fluid-protocol-base";
import {
    ConnectionState,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import {
    ComponentRegistryEntry,
    IAttachMessage,
    IComponentContext,
    IComponentFactory,
    IComponentRuntime,
    IEnvelope,
    IHostRuntime,
    IInboundSignalMessage,
} from "@microsoft/fluid-runtime-definitions";
import { SummaryTracker } from "@microsoft/fluid-runtime-utils";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";

// Snapshot Format Version to be used in component attributes.
const currentSnapshotFormatVersion = "0.1";

/**
 * Added IComponentAttributes similar to IChannelAttributues which will tell
 * the attributes of a component like the package, snapshotFormatVersion to
 * take different decisions based on a particular snapshotForamtVersion.
 */
export interface IComponentAttributes {
    pkg: string;
    readonly snapshotFormatVersion?: string;
}

interface ISnapshotDetails {
    pkg: readonly string[];
    snapshot: ISnapshotTree;
}

/**
 * Represents the context for the component. This context is passed to the component runtime.
 */
export abstract class ComponentContext extends EventEmitter implements IComponentContext, IDisposable {
    public get documentId(): string {
        return this._hostRuntime.id;
    }

    public get packagePath(): readonly string[] {
        // The component must be loaded before the path is accessed.
        assert(this.loaded);
        return this.pkg;
    }

    public get parentBranch(): string {
        return this._hostRuntime.parentBranch;
    }

    public get options(): any {
        return this._hostRuntime.options;
    }

    public get clientId(): string | undefined {
        return this._hostRuntime.clientId;
    }

    public get blobManager(): IBlobManager {
        return this._hostRuntime.blobManager;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._hostRuntime.deltaManager;
    }

    public get connected(): boolean {
        return this._hostRuntime.connected;
    }

    public get leader(): boolean {
        return this._hostRuntime.leader;
    }

    public get connectionState(): ConnectionState {
        return this._hostRuntime.connectionState;
    }

    public get submitFn(): (type: MessageType, contents: any) => void {
        return this._hostRuntime.submitFn;
    }

    public get submitSignalFn(): (contents: any) => void {
        return this._hostRuntime.submitSignalFn;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this._hostRuntime.snapshotFn;
    }

    public get closeFn(): () => void {
        return this._hostRuntime.closeFn;
    }

    public get branch(): string {
        return this._hostRuntime.branch;
    }

    public get loader(): ILoader {
        return this._hostRuntime.loader;
    }

    public get hostRuntime(): IHostRuntime {
        return this._hostRuntime;
    }

    public get baseSnapshot(): ISnapshotTree {
        return this._baseSnapshot;
    }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    public get isAttached(): boolean {
        return this._isAttached;
    }

    public readonly attach: (componentRuntime: IComponentRuntime) => void;
    protected componentRuntime: IComponentRuntime;
    private loaded = false;
    private pending: ISequencedDocumentMessage[] = [];
    private componentRuntimeDeferred: Deferred<IComponentRuntime>;
    private _baseSnapshot: ISnapshotTree;

    constructor(
        private readonly _hostRuntime: IHostRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IComponent,
        public readonly summaryTracker: SummaryTracker,
        private _isAttached: boolean,
        attach: (componentRuntime: IComponentRuntime) => void,
        protected pkg?: readonly string[],
    ) {
        super();

        this.attach = (componentRuntime: IComponentRuntime) => {
            attach(componentRuntime);
            this._isAttached = true;
        };
        // back-compat: 0.14 uploadSummary
        this.summaryTracker.addRefreshHandler(async () => {
            // We do not want to get the snapshot unless we have to.
            // If the component runtime is listening on refreshBaseSummary
            // event, then that means it is older version and requires the
            // component context to emit this event.
            if (this.listeners("refreshBaseSummary")?.length > 0) {
                const subtree = await this.summaryTracker.getSnapshotTree();
                if (subtree) {
                    // This subtree may not yet exist in acked summary, so only emit if found.
                    this.emit("refreshBaseSummary", subtree);
                }
            }
        });
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
                this.hostRuntime.logger.sendErrorEvent(
                    {eventName: "ComponentRuntimeDisposeError", componentId: this.id},
                    error);
            });
        }
    }

    public async createComponent(pkgOrId: string | undefined, pkg?: string, props?: any): Promise<IComponentRuntime> {
        const pkgName = pkg ?? pkgOrId;
        const id = pkg ? (pkgOrId ?? uuid()) : uuid();

        const details = await this.getInitialSnapshotDetails();
        let packagePath: string[] = [...details.pkg];

        // A factory could not contain the registry for itself. So if it is the same the last snapshot
        // pkg, create component with our package path.
        if (packagePath.length > 0 && pkgName === packagePath[packagePath.length - 1]) {
            return this.hostRuntime._createComponentWithProps(packagePath, props, id);
        }

        // Look for the package entry in our sub-registry. If we find the entry, we need to add our path
        // to the packagePath. If not, look into the global registry and the packagePath becomes just the
        // passed package.
        let entry: ComponentRegistryEntry = await this.componentRuntime.IComponentRegistry?.get(pkgName);
        if (entry) {
            packagePath.push(pkgName);
        } else {
            entry = await this._hostRuntime.IComponentRegistry.get(pkgName);
            packagePath = [pkgName];
        }

        if (!entry) {
            throw new Error(`Registry does not contain entry for package '${pkgName}'`);
        }

        return this.hostRuntime._createComponentWithProps(packagePath, props, id);
    }

    public async rejectDeferredRealize(reason: string)
    {
        const error = new Error(reason);
        // Error messages contain package names that is considered Personal Identifiable Information
        // Mark it as such, so that if it ever reaches telemetry pipeline, it has a chance to remove it.
        (error as any).containsPII = true;

        this.componentRuntimeDeferred.reject(error);
        return this.componentRuntimeDeferred.promise;
    }

    public async realize(): Promise<IComponentRuntime> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IComponentRuntime>();
            const details = await this.getInitialSnapshotDetails();
            // Base snapshot is the baseline where pending ops are applied to.
            // It is important that this be in sync with the pending ops, and also
            // that it is set here, before bindRuntime is called.
            this._baseSnapshot = details.snapshot;
            const packages = details.pkg;
            let entry: ComponentRegistryEntry;
            let registry = this._hostRuntime.IComponentRegistry;
            let factory: IComponentFactory;
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

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    public changeConnectionState(value: ConnectionState, clientId?: string) {
        this.verifyNotClosed();

        // Connection events are ignored if the component is not yet loaded
        if (!this.loaded) {
            return;
        }

        this.componentRuntime.changeConnectionState(value, clientId);

        raiseConnectedEvent(this, value, clientId);
    }

    public process(message: ISequencedDocumentMessage, local: boolean): void {
        this.verifyNotClosed();

        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);

        if (this.loaded) {
            return this.componentRuntime.process(message, local);
        } else {
            assert(!local);
            this.pending.push(message);
        }
    }

    public processSignal(message: IInboundSignalMessage, local: boolean): void {
        this.verifyNotClosed();

        // Signals are ignored if the component is not yet loaded
        if (!this.loaded) {
            return;
        }

        this.componentRuntime.processSignal(message, local);
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();
        return this._hostRuntime.getQuorum();
    }

    public getAudience(): IAudience {
        this.verifyNotClosed();
        return this._hostRuntime.getAudience();
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public close(): void {
        this._hostRuntime.closeFn();
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

        const entries = await this.componentRuntime.snapshotInternal(fullTree);

        entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        return { entries, id: null };
    }

    public async request(request: IRequest): Promise<IResponse> {
        const runtime = await this.realize();
        return runtime.request(request);
    }

    public submitMessage(type: MessageType, content: any): number {
        this.verifyNotClosed();
        assert(this.componentRuntime);
        return this.submitOp(type, content);
    }

    /**
     * @param address - The key of the dirty channel's summary tracker node.
     *
     * Updates the latestSequenceNumber of our and the dirty channel's summary tracker to the passed sequence number.
     * This is called from a summarizable object that does not generate ops but only wants to be part of the summary.
     * Updating the latestSequenceNumber will ensure that it is part of the next summary.
     */
    public channelIsDirty(address: string, sequenceNumber: number): void {
        this.verifyNotClosed();

        // Update our summary tracker's latestSequenceNumber.
        this.summaryTracker.updateLatestSequenceNumber(sequenceNumber);

        const channelSummaryTracker = this.summaryTracker.getChild(address);
        // If there is a summary tracker for the channel that called us, update it's latestSequenceNumber.
        if (channelSummaryTracker) {
            channelSummaryTracker.updateLatestSequenceNumber(sequenceNumber);
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
        return this._hostRuntime.submitSignalFn(envelope);
    }

    public error(err: any): void {
        this.hostRuntime.error(err);
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
            this.emit("leader", this.clientId);
        } else {
            this.emit("notleader", this.clientId);
        }

    }

    public bindRuntime(componentRuntime: IComponentRuntime) {
        if (this.componentRuntime) {
            throw new Error("runtime already bound");
        }

        // If this ComponentContext was created via `IHostRuntime.createComponentContext`, the
        // `componentRuntimeDeferred` promise hasn't yet been initialized.  Do so now.
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred();
        }

        if (this.pending.length > 0) {
            // Apply all pending ops
            for (const op of this.pending) {
                componentRuntime.process(op, false);
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
    }

    public abstract generateAttachMessage(): IAttachMessage;

    protected abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

    private submitOp(type: MessageType, content: any): number {
        this.verifyNotClosed();
        const envelope: IEnvelope = {
            address: this.id,
            contents: {
                content,
                type,
            },
        };
        return this._hostRuntime.submitFn(MessageType.Operation, envelope);
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Runtime is closed");
        }
    }
}

export class RemotedComponentContext extends ComponentContext {
    private details: ISnapshotDetails;

    constructor(
        id: string,
        private readonly initSnapshotValue: ISnapshotTree | string,
        runtime: IHostRuntime,
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
            let tree: ISnapshotTree;

            if (typeof this.initSnapshotValue === "string") {
                const commit = (await this.storage.getVersions(this.initSnapshotValue, 1))[0];
                tree = await this.storage.getSnapshotTree(commit);
            } else {
                tree = this.initSnapshotValue;
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
                }
                this.pkg = pkgFromSnapshot;
            }

            this.details = {
                pkg: this.pkg,
                snapshot: tree,
            };
        }

        return this.details;
    }
}

export class LocalComponentContext extends ComponentContext {
    constructor(
        id: string,
        pkg: string[],
        runtime: IHostRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        summaryTracker: SummaryTracker,
        attachCb: (componentRuntime: IComponentRuntime) => void,
        public readonly createProps?: any,
    ) {
        super(runtime, id, false, storage, scope, summaryTracker, false, attachCb, pkg);
    }

    public generateAttachMessage(): IAttachMessage {
        const componentAttributes: IComponentAttributes = {
            pkg: JSON.stringify(this.pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        const entries = this.componentRuntime.getAttachSnapshot();
        const snapshot = { entries, id: undefined };

        snapshot.entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        const message: IAttachMessage = {
            id: this.id,
            snapshot,
            type: this.pkg[this.pkg.length - 1],
        };

        return message;
    }

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        return {
            pkg: this.pkg,
            snapshot: undefined,
        };
    }
}
