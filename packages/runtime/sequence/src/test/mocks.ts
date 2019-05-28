import {
    ConnectionState,
    DebugLogger,
    IDeltaManager,
    IDocumentMessage,
    IGenericBlob,
    ILoader,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ITreeEntry,
    MessageType,
    TelemetryLogger,
} from "@prague/container-definitions";
import * as git from "@prague/gitresources";
import {
    IChannel,
    IComponentRuntime,
    IDeltaConnection,
    IDeltaHandler,
    IDistributedObjectServices,
} from "@prague/runtime-definitions";
import { IHistorian } from "@prague/services-client";
import * as assert from "assert";
import { EventEmitter } from "events";
// tslint:disable-next-line: no-submodule-imports
import * as uuid from "uuid/v4";

export class MockDeltaConnectionFactory {
    public sequenceNumber = 0;
    private messages: ISequencedDocumentMessage[] = [];
    private deltaConnections: MockDeltaConnection[] = [];
    public createDeltaConnection(runtime: IComponentRuntime): IDeltaConnection {
        const delta = new MockDeltaConnection(this, runtime);
        this.deltaConnections.push(delta);
        return delta;
    }

    public pushMessage(msg: Partial<ISequencedDocumentMessage>) {
        this.messages.push(msg as ISequencedDocumentMessage);
    }

    public async processMessages(): Promise<void> {
        while (this.messages.length > 0) {
            const msg = this.messages.shift();
            msg.sequenceNumber = ++this.sequenceNumber;
            for (const dc of this.deltaConnections) {
                for (const h of dc.handlers) {
                    await h.prepare(msg, true);
                    h.process(msg, true, msg.contents);
                }
            }
        }
        return Promise.resolve();
    }
}

// Mock implementaiton IDeltaConnection that does nothing
class MockDeltaConnection implements IDeltaConnection {
    public get state(): ConnectionState {
        return this.connectionState;
    }

    public set state(state: ConnectionState) {
        this.connectionState = state;
        this.handlers.forEach((h) => {
            h.setConnectionState(this.state);
        });
    }
    public readonly handlers: IDeltaHandler[] = [];
    private connectionState: ConnectionState = ConnectionState.Connected;
    private clientSequenceNumber: number = 0;

    constructor(
        private readonly factory: MockDeltaConnectionFactory,
        private readonly runtime: IComponentRuntime) { }

    public submit(messageContent: any): number {
        this.clientSequenceNumber++;
        const msg: Partial<ISequencedDocumentMessage> = {
            clientId: this.runtime.clientId,
            clientSequenceNumber: this.clientSequenceNumber,
            contents: messageContent,
            referenceSequenceNumber: this.factory.sequenceNumber,
            type: MessageType.Operation,

        };
        this.factory.pushMessage(msg);

        return msg.clientSequenceNumber;
    }

    public attach(handler: IDeltaHandler): void {
        this.handlers.push(handler);
        handler.setConnectionState(this.state);
    }
}

// Mock implementaiton of IRuntime
export class MockRuntime extends EventEmitter implements IComponentRuntime  {
    public readonly documentId: string;
    public readonly id: string;
    public readonly existing: boolean;
    public readonly options: any;
    public readonly clientId: string = uuid();
    public readonly clientType: string = "browser";
    public readonly parentBranch: string;
    public readonly connected: boolean;
    public readonly leader: boolean;
    public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    public readonly platform: IPlatform;
    public readonly loader: ILoader;
    public readonly logger: TelemetryLogger = DebugLogger.Create("prague:MockRuntime");

    public async getChannel(id: string): Promise<IChannel> {
        return null;
    }
    public createChannel(id: string, type: string): IChannel {
        return null;
    }

    public attachChannel: (channel: IChannel) => IDistributedObjectServices = () => null;

    public getQuorum(): IQuorum {
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
    public async getBlob(sha: string): Promise<IGenericBlob> {
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

    // new handler things - maybe not needed
    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return null;
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any): void {
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

    public snapshotInternal(): ITreeEntry[] {
        return null;
    }
}

export class MockHistorian implements IHistorian {
    public endpoint: string;

    private idCounter: number = 0;
    private blobMap = new Map();
    private tree: git.ICreateTreeParams;

    public async read(path: string) {
        const content =  await this.read_r(path, this.tree);
        return Buffer.from(content).toString("base64");
    }

    public async read_r(path: string, baseBlob) {
        if (!path.includes("/")) {
            for (const blob of baseBlob.tree) {
                if (blob.path === path) {
                    return this.blobMap.get(blob.sha).content;
                }
            }
            assert(false, `historian.read() blob not found (base case): ${path}`);
        } else {
            const head = path.substr(0, path.indexOf("/"));
            const tail = path.substr(path.indexOf("/") + 1);

            for (const blob of baseBlob.tree) {
                if (blob.path === head) {
                    return this.read_r(tail, this.blobMap.get(blob.sha));
                }

            }
            assert(false, `historian.read() blob not found (recursive): ${head}`);
        }
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        return this.blobMap.get(sha);
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
        const newTree =  {
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
        return this.blobMap.get(sha);
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
