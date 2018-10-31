// tslint:disable
import * as runtime from "@prague/runtime-definitions";
import { EventEmitter } from "events";

// tslint:disable-next-line:no-submodule-imports
const cloneDeep = require("lodash/cloneDeep");

export interface IConnectionDetails {
    clientId: string;
    existing: boolean;
    parentBranch: string;
    user: runtime.IUser;
    initialMessages?: runtime.ISequencedDocumentMessage[];
    maxMessageSize: number;
}

export class DeltaConnection extends EventEmitter {
    public static async Connect(
        tenantId: string,
        id: string,
        token: string,
        service: runtime.IDocumentService,
        client: runtime.IClient) {
        const connection = await service.connectToDeltaStream(tenantId, id, token, client);
        return new DeltaConnection(connection);
    }

    public get details(): IConnectionDetails {
        return this._details;
    }

    public get nacked(): boolean {
        return this._nacked;
    }

    public get connected(): boolean {
        return this._connected;
    }

    // tslint:disable:variable-name
    private _details: IConnectionDetails;
    private _nacked = false;
    private _connected = true;
    // tslint:enable:variable-name

    private envelopeMap: Map<string, runtime.ISequencedDocumentMessage> =
        new Map<string, runtime.ISequencedDocumentMessage>();
    private contentMap: Map<string, any> = new Map<string, any>();

    private constructor(private connection: runtime.IDocumentDeltaConnection) {
        super();

        this._details = {
            clientId: connection.clientId,
            existing: connection.existing,
            initialMessages: connection.initialMessages,
            maxMessageSize: connection.maxMessageSize,
            parentBranch: connection.parentBranch,
            user: connection.user,
        };

        // listen for new messages
        connection.on("op", (documentId: string, messages: runtime.ISequencedDocumentMessage[]) => {
            this.processEnvelope(documentId, messages);
        });

        connection.on("op-content", (documentId: string, messages: any[]) => {
            this.processContent(documentId, messages);
        });

        connection.on("nack", (documentId: string, message: runtime.INack[]) => {
            // Mark nacked and also pause any outbound communication
            this._nacked = true;
            const target = message[0].sequenceNumber;
            this.emit("nack", target);
        });

        connection.on("disconnect", (reason) => {
            this._connected = false;
            this.emit("disconnect", reason);
        });

        // Listen for socket.io latency messages
        connection.on("pong", (latency: number) => {
            this.emit("pong", latency);
        });
    }

    /**
     * Closes the delta connection. This disconnects the socket and clears any listeners
     */
    public close() {
        this._connected = false;
        this.connection.disconnect();
        this.removeAllListeners();
    }

    public submit(message: runtime.IDocumentMessage): void {
        this.connection.submit(message);
    }

    private processEnvelope(documentId: string, envelopes: runtime.ISequencedDocumentMessage[]) {
        const ops: runtime.ISequencedDocumentMessage[] = [];
        for (const envelope of envelopes) {
            if (envelope.contents && envelope.contents !== null) {
                ops.push(envelope);
            } else {
                // Special case for deli noop messages. We don't split those.
                if (envelope.clientId === null) {
                    ops.push(envelope);
                    continue;
                }
                const key = `${envelope.clientId}-${envelope.clientSequenceNumber}`;
                if (this.contentMap.has(key)) {
                    envelope.contents = cloneDeep(this.contentMap.get(key));
                    ops.push(envelope);
                    this.contentMap.delete(key);
                } else {
                    this.envelopeMap.set(key, envelope);
                }
            }
        }
        this.emit("op", documentId, ops);
    }

    private processContent(documentId: string, messages: any[]) {
        const ops: runtime.ISequencedDocumentMessage[] = [];
        for (const message of messages) {
            const key = `${message.clientId}-${message.op.clientSequenceNumber}`;
            if (this.envelopeMap.has(key)) {
                const envelope = cloneDeep(this.envelopeMap.get(key));
                envelope.contents = message.op.contents;
                ops.push(envelope);
                this.envelopeMap.delete(key);
            } else {
                this.contentMap.set(key, message.op.contents);
            }
        }
        this.emit("op", documentId, ops);
    }
}
