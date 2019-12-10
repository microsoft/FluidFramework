/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
} from "@microsoft/fluid-runtime-definitions";
import { SummaryTracker } from "@microsoft/fluid-runtime-utils";
import * as assert from "assert";
import { EventEmitter } from "events";
// tslint:disable-next-line:no-submodule-imports
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

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this._hostRuntime.options;
    }

    public get clientId(): string {
        return this._hostRuntime.clientId;
    }

    /**
     * DEPRECATED use hostRuntime.clientDetails.type instead
     * back-compat: 0.11 clientType
     */
    public get clientType(): string {
        return this._hostRuntime.clientType;
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
        return this.summaryTracker.baseTree;
    }

    protected componentRuntime: IComponentRuntime;
    protected readonly summaryTracker = new SummaryTracker();
    private closed = false;
    private loaded = false;
    private pending: ISequencedDocumentMessage[] = [];
    private componentRuntimeDeferred: Deferred<IComponentRuntime>;

    constructor(
        private readonly _hostRuntime: ContainerRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IComponent,
        public readonly attach: (componentRuntime: IComponentRuntime) => void,
    ) {
        super();
    }

    public async createComponent(pkgOrId: string, pkg?: string | string[]): Promise<IComponentRuntime> {
        return this.hostRuntime.createComponent(pkgOrId, pkg);
    }

    public async createSubComponent(pkg: string | string[], props?: any): Promise<IComponentRuntime> {
        const details = await this.getInitialSnapshotDetails();
        const packagePath: string[] = [...details.pkg];
        const pkgs = Array.isArray(pkg) ? pkg : [pkg];
        // A factory could not contain the registry for itself. So remove the fist
        // passed package if it is the same as the last snapshot pkg
        if (packagePath.length > 0 && pkg === packagePath[packagePath.length - 1]) {
            pkgs.shift();
        }
        packagePath.push(...pkgs);

        const pkgId = uuid();
        return this.hostRuntime._createComponentWithProps(packagePath, props, pkgId);
    }

    public async realize(): Promise<IComponentRuntime> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IComponentRuntime>();
            const details = await this.getInitialSnapshotDetails();
            if (details.snapshot && !this.summaryTracker.baseTree) {
                // do not overwrite if refreshed!
                // local - will always give undefined tree, so never enter here
                // remote - will give the tree at the time of construction (initial),
                // which may be older than the refreshed one, but never newer than
                // the refreshed or one set at constructor (in case of summarizer)
                this.summaryTracker.setBaseTree(details.snapshot);
            }
            const packages = details.pkg;
            let entry: ComponentRegistryEntry;
            let registry = this._hostRuntime.IComponentRegistry;
            let factory: IComponentFactory;
            for (const pkg of packages) {
                if (!registry) {
                    throw new Error("Factory does not supply the component Registry");
                }
                entry = await registry.get(pkg);
                if (entry === undefined) {
                    break;
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

        // component has been modified and will need to regenerate its snapshot
        this.summaryTracker.invalidate();

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

    public stop(): Promise<ITree> {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshot();
    }

    public close(): void {
        this._hostRuntime.closeFn();
    }

    /**
     * Notifies the object to take snapshot of a component.
     */
    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        // base ID still being set means previous snapshot is still valid
        const baseId = this.summaryTracker.getBaseId();
        if (baseId && !fullTree) {
            return { id: baseId, entries: [] };
        }
        this.summaryTracker.reset();

        await this.realize();

        const { pkg } = await this.getInitialSnapshotDetails();

        const componentAttributes: IComponentAttributes = {
            pkg: JSON.stringify(pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        const entries = await this.componentRuntime.snapshotInternal(fullTree);

        entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        return { entries, id: baseId };
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
            // component has been modified and will need to regenerate its snapshot
            this.summaryTracker.invalidate();

            // Apply all pending ops
            for (const op of this.pending) {
                componentRuntime.process(op, false);
            }
        }

        this.pending = undefined;

        // and now mark the runtime active
        this.loaded = true;
        this.componentRuntime = componentRuntime;

        // And notify the pending promise it is now available
        this.componentRuntimeDeferred.resolve(this.componentRuntime);
    }

    public abstract generateAttachMessage(): IAttachMessage;

    public refreshBaseSummary(snapshot: ISnapshotTree) {
        this.summaryTracker.setBaseTree(snapshot);
        // need to notify runtime of the update
        this.emit("refreshBaseSummary", snapshot);
    }

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
        private readonly pkg?: string[],
    ) {
        super(
            runtime,
            id,
            true,
            storage,
            scope,
            () => {
                throw new Error("Already attached");
            });

        if (initSnapshotValue && typeof initSnapshotValue !== "string") {
            // This will allow the summarizer to avoid calling realize if there
            // are no changes to the component.  If the initSnapshotValue is a
            // string, the summarizer cannot avoid calling realize.
            this.summaryTracker.setBaseTree(initSnapshotValue);
        }
    }

    public generateAttachMessage(): IAttachMessage {
        throw new Error("Cannot attach remote component");
    }

    // Only refers to the initial snapshot value, not necessarily the baseSnapshot.
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
        attachCb: (componentRuntime: IComponentRuntime) => void,
        public readonly createProps?: any,
    ) {
        super(runtime, id, false, storage, scope, attachCb);
    }

    public generateAttachMessage(): IAttachMessage {
        const componentAttributes: IComponentAttributes = {
            pkg: JSON.stringify(this.pkg),
            snapshotFormatVersion: currentSnapshotFormatVersion,
        };

        const entries = this.componentRuntime.getAttachSnapshot();
        const snapshot = { entries, id: undefined };

        snapshot.entries.push(new BlobTreeEntry(".component", JSON.stringify(componentAttributes)));

        // base ID still being set means previous snapshot is still valid
        snapshot.id = this.summaryTracker.getBaseId();

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
