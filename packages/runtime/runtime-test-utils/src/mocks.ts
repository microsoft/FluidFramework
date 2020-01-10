/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    IDeltaManager,
    IGenericBlob,
    ILoader,
} from "@microsoft/fluid-container-definitions";
import {
    DebugLogger,
    Deferred,
    fromUtf8ToBase64,
} from "@microsoft/fluid-core-utils";
import * as git from "@microsoft/fluid-gitresources";
import {
    ConnectionState,
    IBlob,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ITree,
    ITreeEntry,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IChannel,
    IComponentRuntime,
    IDeltaConnection,
    IDeltaHandler,
    IObjectStorageService,
    ISharedObjectServices,
} from "@microsoft/fluid-runtime-definitions";
import { ComponentSerializer } from "@microsoft/fluid-runtime-utils";
import { IHistorian } from "@microsoft/fluid-server-services-client";
// eslint-disable-next-line import/no-internal-modules
import * as uuid from "uuid/v4";

/**
 * Factory to create MockDeltaConnection for testing
 */
export class MockDeltaConnectionFactory {
    public sequenceNumber = 0;
    public minSeq = new Map<string, number>();
    private readonly messages: ISequencedDocumentMessage[] = [];
    private readonly deltaConnections: MockDeltaConnection[] = [];
    public createDeltaConnection(runtime: MockRuntime): IDeltaConnection {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const delta = new MockDeltaConnection(this, runtime);
        this.deltaConnections.push(delta);
        return delta;
    }

    public pushMessage(msg: Partial<ISequencedDocumentMessage>) {
        if (!this.minSeq.has(msg.clientId)) {
            this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
        }
        this.messages.push(msg as ISequencedDocumentMessage);
    }

    public clearMessages() {
        while (this.messages.shift()) { }
    }

    public processAllMessages() {
        while (this.messages.length > 0) {
            const msg = this.messages.shift();
            this.minSeq.set(msg.clientId, msg.referenceSequenceNumber);
            msg.sequenceNumber = ++this.sequenceNumber;
            msg.minimumSequenceNumber = this.getMinSeq();
            for (const dc of this.deltaConnections) {
                for (const h of dc.handlers) {
                    h.process(msg, dc.isLocal(msg));
                }
            }
        }
    }

    private getMinSeq(): number {
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
}

/**
 * Mock implementation IDeltaConnection for testing that does nothing
 */
class MockDeltaConnection implements IDeltaConnection {
    public get state(): ConnectionState {
        return this.connectionState;
    }

    public set state(state: ConnectionState) {
        switch (state) {
            case ConnectionState.Connected:
                if (this.pendingClientId) {
                    this.runtime.clientId = this.pendingClientId;
                    this.pendingClientId = undefined;
                }
            // Intentional fallthrough
            case ConnectionState.Connecting:
                this.pendingClientId = uuid();
                break;
            case ConnectionState.Disconnected:
            default:
        }

        this.connectionState = state;
        this.handlers.forEach((h) => {
            h.setConnectionState(this.state);
        });
    }
    public readonly handlers: IDeltaHandler[] = [];
    private connectionState: ConnectionState = ConnectionState.Connected;
    private clientSequenceNumber: number = 0;
    private pendingClientId: string;
    private referenceSequenceNumber = 0;

    constructor(
        private readonly factory: MockDeltaConnectionFactory,
        private readonly runtime: MockRuntime) {
        this.handlers.push({
            process: (message: ISequencedDocumentMessage, local: boolean) => {
                this.referenceSequenceNumber = message.sequenceNumber;
            },
            setConnectionState: (state: ConnectionState) => { },
        });
    }

    public submit(messageContent: any): number {
        this.clientSequenceNumber++;
        const msg: Partial<ISequencedDocumentMessage> = {
            clientId: this.runtime.clientId,
            clientSequenceNumber: this.clientSequenceNumber,
            contents: messageContent,
            referenceSequenceNumber: this.referenceSequenceNumber,
            type: MessageType.Operation,

        };
        this.factory.pushMessage(msg);

        return msg.clientSequenceNumber;
    }

    public attach(handler: IDeltaHandler): void {
        this.handlers.push(handler);
        handler.setConnectionState(this.state);
    }

    public isLocal(msg: ISequencedDocumentMessage) {
        return msg.clientId === this.runtime.clientId || msg.clientId === this.pendingClientId;
    }
}

/**
 * Mock implementation of IRuntime for testing that does nothing
 */
export class MockRuntime extends EventEmitter
    implements IComponentRuntime, IComponentHandleContext {

    public get IComponentHandleContext(): IComponentHandleContext { return this; }
    public get IComponentRouter() { return this; }

    public readonly IComponentSerializer = new ComponentSerializer();

    public readonly documentId: string;
    public readonly id: string;
    public readonly existing: boolean;
    public readonly options: any = {};
    public clientId: string = uuid();
    public readonly clientType: string = "browser"; // Back-compat: 0.11 clientType
    public readonly parentBranch: string;
    public readonly path = "";
    public readonly connected: boolean;
    public readonly leader: boolean;
    public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    public readonly loader: ILoader;
    public readonly logger: ITelemetryLogger = DebugLogger.create("fluid:MockRuntime");
    public services: ISharedObjectServices;
    private readonly activeDeferred = new Deferred<void>();

    public get active(): Promise<void> {
        return this.activeDeferred.promise;
    }

    public get connectionState(): ConnectionState {
        return ConnectionState.Connected;
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
        return null;
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

    public notifyPendingMessages(): void {
        return;
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

    public changeConnectionState(value: ConnectionState, clientId: string) {
        return null;
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

    public error(err: any): void { }
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
    public state = ConnectionState.Disconnected;

    public attach(handler) {
    }

    public submit(messageContent: any): number {
        assert(false);
        return 0;
    }
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
