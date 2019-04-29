import {
    ConnectionState,
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
} from "@prague/container-definitions";
import {
    IChannel,
    IComponentRuntime,
    IDeltaConnection,
    IDeltaHandler,
    IDistributedObjectServices,
} from "@prague/runtime-definitions";
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
