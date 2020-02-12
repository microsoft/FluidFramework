/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { IComponent, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ILoader,
} from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-core-utils";
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
    ISummaryTracker,
} from "@microsoft/fluid-runtime-definitions";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";
import { ContainerRuntime } from "./containerRuntime";

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
    pkg: string[];
    snapshot: ISnapshotTree;
}

/**
 * Represents the context for the component. This context is passed to the component runtime.
 */
export abstract class ComponentContext extends EventEmitter implements IComponentContext {
    public get documentId(): string {
        return this._hostRuntime.id;
    }

    public get parentBranch(): string {
        return this._hostRuntime.parentBranch;
    }

    public get options(): any {
        return this._hostRuntime.options;
    }

    public get clientId(): string {
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

    protected componentRuntime: IComponentRuntime;
    private closed = false;
    private loaded = false;
    private pending: ISequencedDocumentMessage[] = [];
    private componentRuntimeDeferred: Deferred<IComponentRuntime>;
    private _baseSnapshot: ISnapshotTree;

    constructor(
        private readonly _hostRuntime: ContainerRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IComponent,
        public readonly summaryTracker: ISummaryTracker,
        public readonly attach: (componentRuntime: IComponentRuntime) => void,
    ) {
        super();
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
            throw new Error("Registry does not contain entry for the package");
        }

        return this.hostRuntime._createComponentWithProps(packagePath, props, id);
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
            for (const pkg of packages) {
                if (!registry) {
                    this.componentRuntimeDeferred.reject("Factory does not supply the component Registry");
                    return this.componentRuntimeDeferred.promise;
                }
                entry = await registry.get(pkg);
                if (!entry) {
                    this.componentRuntimeDeferred.reject("Registry does not contain an entry for the package");
                    return this.componentRuntimeDeferred.promise;
                }
                factory = entry.IComponentFactory;
                registry = entry.IComponentRegistry;
            }

            // During this call we will invoke the instantiate method - which will call back into us
            // via the bindRuntime call to resolve componentRuntimeDeferred
            factory.instantiateComponent(this);
        }

        return this.componentRuntimeDeferred.promise;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getComponentRuntime(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this._hostRuntime.getComponentRuntime(id, wait);
    }

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
     */
    public changeConnectionState(value: ConnectionState, clientId: string) {
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

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public stop(): Promise<ITree> {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshot(true);
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

    public bindRuntime(componentRuntime: IComponentRuntime): void {
        if (this.componentRuntime) {
            throw new Error("runtime already bound");
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
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}

export class RemotedComponentContext extends ComponentContext {
    private details: ISnapshotDetails;

    constructor(
        id: string,
        private readonly initSnapshotValue: ISnapshotTree | string,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        summaryTracker: ISummaryTracker,
        private readonly pkg?: string[],
    ) {
        super(
            runtime,
            id,
            true,
            storage,
            scope,
            summaryTracker,
            () => {
                throw new Error("Already attached");
            });
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

            if (tree === null || tree.blobs[".component"] === undefined) {
                this.details = {
                    pkg: this.pkg,
                    snapshot: tree,
                };
            } else {
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
                this.details = {
                    pkg: pkgFromSnapshot,
                    snapshot: tree,
                };
            }
        }

        return this.details;
    }
}

export class LocalComponentContext extends ComponentContext {
    constructor(
        id: string,
        private readonly pkg: string[],
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        summaryTracker: ISummaryTracker,
        attachCb: (componentRuntime: IComponentRuntime) => void,
        public readonly createProps?: any,
    ) {
        super(runtime, id, false, storage, scope, summaryTracker, attachCb);
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
