/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ILoader,
    IQuorum,
} from "@prague/container-definitions";
import {
    FileMode,
    IDocumentMessage,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    IAttachMessage,
    IComponentContext,
    IComponentRuntime,
    IEnvelope,
    IHostRuntime,
    IInboundSignalMessage,
} from "@prague/runtime-definitions";
import { Deferred, raiseConnectedEvent, readAndParse } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ContainerRuntime } from "./containerRuntime";

interface ISnapshotDetails {
    pkg: string;
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
        return this._baseSnapshot;
    }

    // Tracks the base snapshot ID. If no ops effect this component then the id value can be returned on a
    // snapshot call
    protected baseId = null;
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
        public readonly attach: (componentRuntime: IComponentRuntime) => void,
    ) {
        super();
    }

    public createComponent(pkgOrId: string, pkg?: string): Promise<IComponentRuntime> {
        return this.hostRuntime.createComponent(pkgOrId, pkg);
    }

    public async realize(): Promise<IComponentRuntime> {
        if (!this.componentRuntimeDeferred) {
            this.componentRuntimeDeferred = new Deferred<IComponentRuntime>();
            const details = await this.getSnapshotDetails();
            this._baseSnapshot = details.snapshot;
            this.baseId = details.snapshot ? details.snapshot.id : null;
            const factory = await this._hostRuntime.getPackage(details.pkg);

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

    // Called after a snapshot to update the base ID
    public updateBaseId(id: string) {
        this.baseId = id;
    }

    public process(message: ISequencedDocumentMessage, local: boolean): void {
        this.verifyNotClosed();

        if (this.loaded) {
            // component has been modified and will need to regenerate its snapshot
            this.baseId = null;
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
    public async snapshot(): Promise<ITree> {
        await this.realize();

        const { pkg } = await this.getSnapshotDetails();

        const componentAttributes = { pkg };

        const entries = await this.componentRuntime.snapshotInternal();
        const snapshot = { entries, id: undefined };

        snapshot.entries.push({
            mode: FileMode.File,
            path: ".component",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(componentAttributes),
                encoding: "utf-8",
            },
        });

        // base ID still being set means previous snapshot is still valid
        if (this.baseId) {
            snapshot.id = this.baseId;
        }

        return snapshot;
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
     * @param clientId - Client id of the new leader.
     */
    public updateLeader(clientId: string) {
        // Leader events are ignored if the component is not yet loaded
        if (!this.loaded) {
            return;
        }

        this.emit("leader", clientId);
    }

    public bindRuntime(componentRuntime: IComponentRuntime): void {
        if (this.componentRuntime) {
            throw new Error("runtime already bound");
        }

        if (this.pending.length > 0) {
            // component has been modified and will need to regenerate its snapshot
            this.baseId = null;

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

    protected abstract getSnapshotDetails(): Promise<ISnapshotDetails>;

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
        private readonly snapshotValue: ISnapshotTree | string,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        private readonly type?: string,
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
    }

    public generateAttachMessage(): IAttachMessage {
        throw new Error("Cannot attach remote component");
    }

    protected async getSnapshotDetails(): Promise<ISnapshotDetails> {
        if (!this.details) {
            let tree: ISnapshotTree;

            if (typeof this.snapshotValue === "string") {
                const commit = (await this.storage.getVersions(this.snapshotValue, 1))[0];
                tree = await this.storage.getSnapshotTree(commit);
            } else {
                tree = this.snapshotValue;
            }

            if (tree === null || tree.blobs[".component"] === undefined) {
                this.details = {
                    pkg: this.type,
                    snapshot: tree,
                };
            } else {
                // Need to rip through snapshot and use that to populate extraBlobs
                const { pkg } = await readAndParse<{ pkg: string }>(
                    this.storage,
                    tree.blobs[".component"]);

                this.details = {
                    pkg,
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
        private readonly pkg: string,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IComponent,
        attachCb: (componentRuntime: IComponentRuntime) => void,
    ) {
        super(runtime, id, false, storage, scope, attachCb);
    }

    public generateAttachMessage(): IAttachMessage {
        const componentAttributes = { pkg: this.pkg };

        const entries = this.componentRuntime.getAttachSnapshot();
        const snapshot = { entries, id: undefined };

        snapshot.entries.push({
            mode: FileMode.File,
            path: ".component",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(componentAttributes),
                encoding: "utf-8",
            },
        });

        // base ID still being set means previous snapshot is still valid
        if (this.baseId) {
            snapshot.id = this.baseId;
        }

        const message: IAttachMessage = {
            id: this.id,
            snapshot,
            type: this.pkg,
        };

        return message;
    }

    protected async getSnapshotDetails(): Promise<ISnapshotDetails> {
        return {
            pkg: this.pkg,
            snapshot: undefined,
        };
    }
}
