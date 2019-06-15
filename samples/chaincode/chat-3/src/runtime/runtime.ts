import {
    ConnectionState,
    IContainerContext,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
} from "@prague/container-definitions";
import { EventEmitter } from "events";

export class Runtime extends EventEmitter {
    public static async load(context: IContainerContext): Promise<Runtime> {
        const runtime = new Runtime(context);
        return runtime;
    }

    public get connectionState(): ConnectionState {
        return this.context.connectionState;
    }

    public get clientId(): string {
        return this.context.clientId;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    private closed = false;
    private requestHandler: (request: IRequest) => Promise<IResponse>;
    private bufferedOpsUntilConnection: ISequencedDocumentMessage[] = [];

    private constructor(private readonly context: IContainerContext) {
        super();
    }

    public get opsBeforeConnection(): ISequencedDocumentMessage[] {
        return this.bufferedOpsUntilConnection;
    }

    public registerRequestHandler(handler: (request: IRequest) => Promise<IResponse>) {
        this.requestHandler = handler;
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (!this.requestHandler) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            return this.requestHandler(request);
        }
    }

    public async snapshot(tagMessage: string): Promise<ITree> {
        const root: ITree = { entries: [], sha: null };
        return root;
    }

    public async requestSnapshot(tagMessage: string): Promise<void> {
        return this.context.requestSnapshot(tagMessage);
    }

    public async stop(): Promise<void> {
        this.verifyNotClosed();
        this.closed = true;
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();
        if (value === ConnectionState.Connected) {
            this.emit("connected", this.clientId);
        } else {
            this.emit("disconnected");
        }
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return;
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (!this.connected) {
            this.bufferedOpsUntilConnection.push(message);
        } else {
            this.emit("op", message);
        }
    }

    public async postProcess(
        message: ISequencedDocumentMessage,
        local: boolean,
        context: any,
    ): Promise<void> {
    //
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    public getQuorum(): IQuorum {
        return this.context.quorum;
    }

    public error(error: any) {
        this.context.error(error);
    }

    private submit(type: MessageType, content: any) {
        this.verifyNotClosed();
        this.context.submitFn(type, content);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }

}
