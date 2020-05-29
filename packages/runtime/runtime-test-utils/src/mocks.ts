/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    IDeltaManager,
    IGenericBlob,
    ContainerWarning,
    ILoader,
} from "@fluidframework/container-definitions";
import {
    Deferred,
    fromUtf8ToBase64,
} from "@fluidframework/common-utils";
import { DebugLogger } from "@fluidframework/client-common-utils";
import * as git from "@fluidframework/gitresources";
import {
    IBlob,
    ICommittedProposal,
    IDocumentMessage,
    IQuorum,
    ISequencedClient,
    ISequencedDocumentMessage,
    ITree,
    ITreeEntry,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannel,
    IComponentRuntime,
    IDeltaConnection,
    IDeltaHandler,
    IObjectStorageService,
    ISharedObjectServices,
} from "@fluidframework/component-runtime-definitions";
import { ComponentSerializer } from "@fluidframework/runtime-utils";
import { IComponentRuntimeChannel } from "@fluidframework/runtime-definitions";
import { IHistorian } from "@fluidframework/server-services-client";
import { v4 as uuid } from "uuid";
import { MockDeltaManager } from "./mockDeltas";

export class MockDeltaManagerWithConnectionFactory extends MockDeltaManager {
    public get minimumSequenceNumber(): number {
        return this.connectionFactory.getMinSeq();
    }

    public get referenceSequenceNumber(): number {
        return this.connectionFactory.sequenceNumber;
    }

    constructor(readonly connectionFactory?: MockDeltaConnectionFactory) {
        super();
    }
}

/**
 * Interface definition that represents the data submitted by a local client.
 * message - The message that is submitted.
 * localOpMetadata - The metadata associated with the message.
 */
interface IMessageData {
    message: ISequencedDocumentMessage,
    localOpMetadata: unknown,
}

/**
 * Factory to create MockDeltaConnection for testing
 */
export class MockDeltaConnectionFactory {
    public sequenceNumber = 0;
    public minSeq = new Map<string, number>();
    private readonly messages: IMessageData[] = [];
    private readonly deltaConnections: MockDeltaConnection[] = [];

    public getMinSeq(): number {
        let minSeq: number;
        for (const [, clientSeq] of this.minSeq) {
            if (!minSeq) {
                minSeq = clientSeq;
            } else {
                minSeq = Math.min(minSeq, clientSeq);
            }
        }
        return minSeq ? minSeq : 0;
    }

    public createDeltaConnection(runtime: MockRuntime): IDeltaConnection {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const delta = new MockDeltaConnection(this, runtime);
        this.deltaConnections.push(delta);

        assert(runtime.deltaManager === undefined ||
            runtime.deltaManager instanceof MockDeltaManagerWithConnectionFactory &&
            runtime.deltaManager.connectionFactory === this);
        runtime.deltaManager = new MockDeltaManagerWithConnectionFactory(this);
        return delta;
    }

    public pushMessage(msg: Partial<ISequencedDocumentMessage>, localOpMetadata: unknown) {
        if (!this.minSeq.has(msg.clientId)) {
            this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
        }
        this.messages.push({
            message: msg as ISequencedDocumentMessage,
            localOpMetadata,
        });
    }

    public clearMessages() {
        while (this.messages.shift()) { }
    }

    public processAllMessages() {
        while (this.messages.length > 0) {
            const messageDetail = this.messages.shift();

            // Explicitly JSON clone the value to match the behavior of going thru the wire.
            const msg = JSON.parse(JSON.stringify(messageDetail.message));

            this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
            msg.sequenceNumber = ++this.sequenceNumber;
            msg.minimumSequenceNumber = this.getMinSeq();
            for (const dc of this.deltaConnections) {
                for (const h of dc.handlers) {
                    const isLocal = dc.isLocal(msg);
                    h.process(msg, isLocal, isLocal ? messageDetail.localOpMetadata : undefined);
                }
            }
        }
    }
}

/**
 * Mock implementation IDeltaConnection for testing that does nothing
 */
class MockDeltaConnection implements IDeltaConnection {
    public get connected(): boolean {
        return this._connected;
    }

    public set connected(connected: boolean) {
        if (connected) {
            this.runtime.clientId = uuid();
        }

        this._connected = connected;
        this.handlers.forEach((h) => {
            h.setConnectionState(this.connected);
        });
    }
    public readonly handlers: IDeltaHandler[] = [];
    private _connected = true;
    private clientSequenceNumber: number = 0;
    private referenceSequenceNumber = 0;

    constructor(
        private readonly factory: MockDeltaConnectionFactory,
        private readonly runtime: MockRuntime) {
        this.handlers.push({
            process: (message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) => {
                this.referenceSequenceNumber = message.sequenceNumber;
            },
            setConnectionState: (connected: boolean) => { },
            reSubmit: (content: any, localOpMetadata: unknown) => { },
        });
    }

    public submit(messageContent: any, localOpMetadata: unknown): number {
        this.clientSequenceNumber++;
        const msg: Partial<ISequencedDocumentMessage> = {
            clientId: this.runtime.clientId,
            clientSequenceNumber: this.clientSequenceNumber,
            contents: messageContent,
            referenceSequenceNumber: this.referenceSequenceNumber,
            type: MessageType.Operation,

        };
        this.factory.pushMessage(msg, localOpMetadata);

        return msg.clientSequenceNumber;
    }

    public attach(handler: IDeltaHandler): void {
        this.handlers.push(handler);
        handler.setConnectionState(this.connected);
    }

    public dirty(): void {}

    public isLocal(msg: ISequencedDocumentMessage) {
        return msg.clientId === this.runtime.clientId;
    }
}

export class MockQuorum implements IQuorum, EventEmitter {
    private readonly map = new Map<string, any>();
    private readonly members: Map<string, ISequencedClient>;
    private readonly eventEmitter = new EventEmitter();

    constructor(... members: [string, Partial<ISequencedClient>][]) {
        this.members = new Map(members as [string, ISequencedClient][] ?? []);
    }

    async propose(key: string, value: any) {
        if (this.map.has(key)) {
            assert.fail(`${key} exists`);
        }
        this.map.set(key, value);
        this.eventEmitter.emit("approveProposal", 0, key, value);
        this.eventEmitter.emit("commitProposal", 0, key, value);
    }

    has(key: string): boolean {
        return this.map.has(key);
    }

    get(key: string) {
        return this.map.get(key);
    }

    getApprovalData(key: string): ICommittedProposal | undefined {
        throw new Error("Method not implemented.");
    }

    addMember(id: string, client: Partial<ISequencedClient>) {
        this.members.set(id, client as ISequencedClient);
        this.eventEmitter.emit("addMember");
    }

    removeMember(id: string) {
        if (this.members.delete(id)) {
            this.eventEmitter.emit("removeMember");
        }
    }

    getMembers(): Map<string, ISequencedClient> {
        return this.members;
    }
    getMember(clientId: string): ISequencedClient | undefined {
        return this.getMembers().get(clientId);
    }
    disposed: boolean = false;

    dispose(): void {
        throw new Error("Method not implemented.");
    }

    addListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        switch (event) {
            case "afterOn":
                this.eventEmitter.on(event, listener);
                return this;

            case "addMember":
            case "removeMember":
            case "approveProposal":
            case "commitProposal":
                this.eventEmitter.on(event, listener);
                this.eventEmitter.emit("afterOn", event);
                return this;
            default:
                throw new Error("Method not implemented.");
        }
    }
    once(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    prependListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this {
        throw new Error("Method not implemented.");
    }
    removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
        this.eventEmitter.removeListener(event, listener);
        return this;
    }
    off(event: string | symbol, listener: (...args: any[]) => void): this {
        this.eventEmitter.off(event, listener);
        return this;
    }
    removeAllListeners(event?: string | symbol | undefined): this {
        throw new Error("Method not implemented.");
    }
    setMaxListeners(n: number): this {
        throw new Error("Method not implemented.");
    }
    getMaxListeners(): number {
        throw new Error("Method not implemented.");
    }
    listeners(event: string | symbol): Function[] {
        throw new Error("Method not implemented.");
    }
    rawListeners(event: string | symbol): Function[] {
        throw new Error("Method not implemented.");
    }
    emit(event: string | symbol, ...args: any[]): boolean {
        throw new Error("Method not implemented.");
    }
    eventNames(): (string | symbol)[] {
        throw new Error("Method not implemented.");
    }
    listenerCount(type: string | symbol): number {
        throw new Error("Method not implemented.");
    }
}

/**
 * Mock implementation of IRuntime for testing that does nothing
 */
export class MockRuntime extends EventEmitter
    implements IComponentRuntime, IComponentRuntimeChannel, IComponentHandleContext {
    public get IComponentHandleContext(): IComponentHandleContext { return this; }
    public get IComponentRouter() { return this; }

    public readonly IComponentSerializer = new ComponentSerializer();

    public readonly documentId: string;
    public readonly id: string;
    public readonly existing: boolean;
    public readonly options: any = {};
    public clientId: string | undefined = uuid();
    public readonly parentBranch: string;
    public readonly path = "";
    public readonly connected = true;
    public readonly leader: boolean;
    public deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    public readonly loader: ILoader;
    public readonly logger: ITelemetryLogger = DebugLogger.create("fluid:MockRuntime");
    public services: ISharedObjectServices;
    private readonly activeDeferred = new Deferred<void>();
    public readonly quorum = new MockQuorum();

    private _disposed = false;
    public get disposed() { return this._disposed; }

    public dispose(): void {
        this._disposed = true;
    }

    public get active(): Promise<void> {
        return this.activeDeferred.promise;
    }

    public get isAttached(): boolean {
        return true;
    }

    public async getChannel(id: string): Promise<IChannel> {
        return null;
    }
    public createChannel(id: string, type: string): IChannel {
        return null;
    }

    public isLocal(): boolean {
        return true;
    }

    public registerChannel(channel: IChannel): void {
        channel.connect(this.services);
    }

    public attach(): void {
        return;
    }

    public bind(handle: IComponentHandle): void {
        return;
    }

    public getQuorum(): IQuorum {
        return this.quorum;
    }

    public getAudience(): IAudience {
        return null;
    }

    public async snapshot(message: string): Promise<void> {
        return null;
    }

    public save(message: string) {
        return;
    }

    public async close(): Promise<void> {
        return null;
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        return null;
    }

    public async getBlob(blobId: string): Promise<IGenericBlob> {
        return null;
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return null;
    }

    public submitMessage(type: MessageType, content: any) {
        return null;
    }

    public submitSignal(type: string, content: any) {
        return null;
    }

    public process(message: ISequencedDocumentMessage, local: boolean): void {
        return;
    }

    public processSignal(message: any, local: boolean) {
        return;
    }

    public updateMinSequenceNumber(value: number): void {
        return;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        return;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return null;
    }

    public async snapshotInternal(): Promise<ITreeEntry[]> {
        return [];
    }

    public getAttachSnapshot(): ITreeEntry[] {
        return [];
    }

    public async waitAttached(): Promise<void> {
        return;
    }

    public async requestComponent(request: IRequest): Promise<IResponse> {
        return null;
    }

    public raiseContainerWarning(warning: ContainerWarning): void { }

    public reSubmit(content: any, localOpMetadata: unknown) {
        return;
    }
}

/**
 * Mock implementation of IHistorian for testing that keeps the blobs in memory
 */
export class MockHistorian implements IHistorian {
    public endpoint: string;

    private idCounter: number = 0;
    private readonly blobMap = new Map<string, git.ITree | git.IBlob>();
    private tree: git.ICreateTreeParams;

    public async read(path: string) {
        const content = await this.read_r(path, this.tree);
        return fromUtf8ToBase64(content);
    }

    public async read_r(path: string, baseBlob: git.ITree | git.ICreateTreeParams): Promise<string> {
        if (!path.includes("/")) {
            for (const blob of baseBlob.tree) {
                if (blob.path === path) {
                    return (this.blobMap.get(blob.sha) as git.IBlob).content;
                }
            }
            assert(false, `historian.read() blob not found (base case): ${path}`);
        } else {
            const head = path.substr(0, path.indexOf("/"));
            const tail = path.substr(path.indexOf("/") + 1);

            for (const blob of baseBlob.tree) {
                if (blob.path === head) {
                    return this.read_r(tail, this.blobMap.get(blob.sha) as git.ITree);
                }
            }
            assert(false, `historian.read() blob not found (recursive): ${head}`);
        }
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        return this.blobMap.get(sha) as git.IBlob;
    }
    public async createBlob(blob: git.ICreateBlobParams): Promise<git.ICreateBlobResponse> {
        const newBlob = {
            sha: `id${this.idCounter}`,
            url: `id${this.idCounter}`,
        };
        this.blobMap.set(`id${this.idCounter++}`, {
            content: blob.content,
            encoding: blob.encoding,
            sha: newBlob.sha,
            size: 0,
            url: newBlob.url,
        });
        return newBlob;
    }
    public async getContent(path: string, ref: string): Promise<any> {
        assert(false, "getContent");
        return null;
    }
    public async getCommits(sha: string, count: number): Promise<git.ICommitDetails[]> {
        assert(false);
        return null;
    }
    public async getCommit(sha: string): Promise<git.ICommit> {
        assert(false);
        return null;
    }
    public async createCommit(commit: git.ICreateCommitParams): Promise<git.ICommit> {
        assert(false);
        return null;
    }
    public async getRefs(): Promise<git.IRef[]> {
        assert(false);
        return null;
    }
    public async getRef(ref: string): Promise<git.IRef> {
        assert(false);
        return null;
    }
    public async createRef(params: git.ICreateRefParams): Promise<git.IRef> {
        assert(false);
        return null;
    }
    public async updateRef(ref: string, params: git.IPatchRefParams): Promise<git.IRef> {
        assert(false);
        return null;
    }
    public async deleteRef(ref: string): Promise<void> {
        assert(false);
        return null;
    }
    public async createTag(tag: git.ICreateTagParams): Promise<git.ITag> {
        assert(false);
        return null;
    }
    public async getTag(tag: string): Promise<git.ITag> {
        assert(false);
        return null;
    }
    public async createTree(tree: git.ICreateTreeParams): Promise<git.ITree> {
        this.tree = tree;
        const newTree = {
            sha: `id${this.idCounter}`,
            tree: tree.tree.map((treeEntry) => ({
                mode: treeEntry.mode,
                path: treeEntry.path,
                sha: treeEntry.sha,
                size: 0,
                type: treeEntry.type,
                url: "website.com",
            })),
            url: `id${this.idCounter}`,
        };
        this.blobMap.set(`id${this.idCounter++}`, newTree);
        return newTree;
    }
    public async getTree(sha: string, recursive: boolean): Promise<git.ITree> {
        return this.blobMap.get(sha) as git.ITree;
    }

    /**
     * Retrieves the header for the given document
     */
    public async getHeader(sha: string): Promise<git.IHeader> {
        assert(false, "getHeader");
        return null;
    }
    public async getFullTree(sha: string): Promise<any> {
        assert(false, "getFullTree");
        return null;
    }
}

/**
 * Mock implementation of IDeltaConnection
 */
export class MockEmptyDeltaConnection implements IDeltaConnection {
    public connected = false;

    public attach(handler) {
    }

    public submit(messageContent: any): number {
        assert(false);
        return 0;
    }

    public dirty(): void {}
}

/**
 * Mock implementation of IObjectStorageService
 */
export class MockObjectStorageService implements IObjectStorageService {
    public constructor(private readonly contents: { [key: string]: string }) {
    }

    public async read(path: string): Promise<string> {
        const content = this.contents[path];
        // Do we have such blob?
        assert(content !== undefined);
        return fromUtf8ToBase64(content);
    }
}

/**
 * Mock implementation of ISharedObjectServices
 */
export class MockSharedObjectServices implements ISharedObjectServices {
    public static createFromTree(tree: ITree) {
        const contents: { [key: string]: string } = {};
        for (const entry of tree.entries) {
            assert(entry.type === TreeEntry[TreeEntry.Blob]);
            contents[entry.path] = (entry.value as IBlob).contents;
        }
        return new MockSharedObjectServices(contents);
    }

    public deltaConnection = new MockEmptyDeltaConnection();
    public objectStorage: MockObjectStorageService;

    public constructor(contents: { [key: string]: string }) {
        this.objectStorage = new MockObjectStorageService(contents);
    }
}
