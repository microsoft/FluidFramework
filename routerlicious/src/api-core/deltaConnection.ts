import { EventEmitter } from "events";
import * as protocol from "./protocol";
import * as storage from "./storage";
import { ITenantUser } from "./tenant";

export interface IConnectionDetails {
    clientId: string;
    existing: boolean;
    parentBranch: string;
    user: ITenantUser;
}

export class DeltaConnection extends EventEmitter {
    public static async Connect(tenantId: string, id: string, token: string, service: storage.IDocumentService) {
        const connection = await service.connectToDeltaStream(tenantId, id, token);
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

    private constructor(private connection: storage.IDocumentDeltaConnection) {
        super();

        this._details = {
            clientId: connection.clientId,
            existing: connection.existing,
            parentBranch: connection.parentBranch,
            user: connection.user,
        };

        // listen for new messages
        connection.on("op", (documentId: string, messages: protocol.ISequencedDocumentMessage[]) => {
            this.emit("op", documentId, messages);
        });

        connection.on("nack", (documentId: string, message: protocol.INack[]) => {
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

    public submit(message: protocol.IDocumentMessage): void {
        this.connection.submit(message);
    }
}
